#![no_std]

//! **POSITIVE CONTROL — not a design recommendation.**
//!
//! This is a copy of `contracts/hardened-vault` in which the only change is
//! `DEAD_SHARES` (1_000 -> 100_000_000). It exists so that the checker has at
//! least one vault for which all 11 checks can be shown to PASS, proving the
//! `donation_attack` check is capable of passing and is not failing vacuously.
//!
//! The value of `DEAD_SHARES` was calibrated *after* the parameters of the
//! `donation_attack` check were known (1-stroop dust deposit, 100,000,000-
//! stroop donation, 5,000,000-stroop victim deposit). It is deliberately
//! sized to that attack and is not a general-purpose or recommended value.
//! Do not copy it into a production vault. See VAULT_CHECKS.md for the
//! result and the honest framing, and SECURITY.md §1 for the underlying
//! donation/inflation issue.
//!
//! The mechanism is otherwise the one described for `hardened-vault`: burn a
//! fixed number of "dead" shares to the vault's own address at construction
//! time, before any real deposit can occur.
//!
//! ## Why at construction, not lazily inside `deposit()`/`mint()`
//!
//! An earlier design considered minting the dead shares lazily, inside
//! `deposit()`/`mint()`, guarded by `total_supply() == 0` so it only fires
//! on the vault's first real call. That design was rejected: SEP-56
//! requires `deposit()`'s returned shares to exactly match
//! `preview_deposit()` computed immediately beforehand, and the CLI's own
//! `deposit`/`mint` conformance checks enforce this by calling
//! `preview_deposit()`, then `deposit()`, then comparing the two. Minting
//! dead shares *inside* `deposit()` would change `total_supply` between an
//! external caller's `preview_deposit()` call and the actual `deposit()`
//! call, but only for the vault's very first transaction — breaking that
//! invariant exactly once, on the check that matters most. Minting the
//! dead shares once in the constructor avoids this entirely:
//! `total_supply` is already `DEAD_SHARES` before the vault can receive
//! any deposit, so every `preview_*` / execute pair a caller ever makes —
//! including the first — sees a consistent, unchanging `total_supply`
//! between the two calls.
//!
//! ## Why the vault's own address as the "dead" recipient
//!
//! Soroban has no null/zero-address sentinel the way Ethereum does. The
//! vault contract's own address is used instead: nothing in this contract
//! ever calls `withdraw`/`redeem` with itself as `owner`, and an external
//! caller cannot forge `Address::require_auth()` for the contract's own
//! address — only the contract's own executing code can satisfy that for
//! itself. So these shares can never be moved or redeemed by anyone.
//!
//! ## What this does and doesn't fix
//!
//! This permanently raises the vault's `total_supply` floor, which dilutes
//! how much a donation-inflated share price can distort the very next real
//! depositor's share of the pool after an attacker's dust deposit. It is a
//! *fixed* constant, so — like `decimals_offset` (see SECURITY.md §1a) —
//! it only meaningfully protects against a donation whose size is within
//! the same order of magnitude as `DEAD_SHARES` itself; a sufficiently
//! large, well-funded donation can still overwhelm it. See VAULT_CHECKS.md
//! for the actual, unadjusted `donation_attack` result against this
//! contract.

use soroban_sdk::{contract, contractimpl, Address, Env, MuxedAddress, String};
use stellar_tokens::{
    fungible::{Base, FungibleToken},
    vault::{FungibleVault, Vault},
};

#[contract]
pub struct PositiveControlVault;

/// Number of vault shares permanently locked to the vault's own address at
/// construction time, with no backing assets.
///
/// Positive-control value: calibrated after the `donation_attack` check's
/// parameters were known, so that check can PASS. Not a recommended design
/// value; unlike `hardened-vault`'s deliberately modest constant, this one is
/// tuned to a specific test.
const DEAD_SHARES: i128 = 100_000_000;

#[contractimpl]
impl PositiveControlVault {
    pub fn __constructor(
        e: &Env,
        name: String,
        symbol: String,
        asset: Address,
        decimals_offset: u32,
    ) {
        // Asset and decimal offset should be configured once during
        // initialization.
        Vault::set_asset(e, asset);
        Vault::set_decimals_offset(e, decimals_offset);

        // Donation/inflation attack mitigation: burn DEAD_SHARES to the
        // vault's own address now, while total_supply is still 0 and
        // before any real deposit is possible. See the module-level doc
        // comment above for why this happens here rather than lazily on
        // the first deposit/mint call.
        Base::mint(e, &e.current_contract_address(), DEAD_SHARES);

        // Vault overrides the decimals function by default.
        // Decimal offset must be set prior to metadata initialization.
        Base::set_metadata(e, Self::decimals(e), name, symbol);
    }
}

#[contractimpl(contracttrait)]
impl FungibleToken for PositiveControlVault {
    type ContractType = Vault;

    // Allows override of decimals and other base functions.

    fn decimals(e: &Env) -> u32 {
        Vault::decimals(e)
    }
}

#[contractimpl(contracttrait)]
impl FungibleVault for PositiveControlVault {}
