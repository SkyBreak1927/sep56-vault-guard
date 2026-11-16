#![no_std]

//! **TEST FIXTURE — SEP-41 parameter names on `approve` / `allowance`.**
//!
//! A copy of `contracts/positive-control-vault` (same constructor, same
//! `DEAD_SHARES = 100_000_000`) in which the only change is that `approve`
//! and `allowance` are declared with the parameter names SEP-41 uses:
//!
//! - `approve(from, spender, amount, expiration_ledger)`
//! - `allowance(from, spender) -> i128`
//!
//! OpenZeppelin `stellar-tokens` 0.7.2 declares the same functions as
//! `approve(owner, spender, amount, live_until_ledger)` and
//! `allowance(owner, spender)`. The order and types are identical; only
//! the names differ. Both overrides delegate to `Base`, so the behaviour
//! is exactly the positive control's.
//!
//! It exists to check that `access_control_probing` calls these two
//! functions by the names the target declares, not by OpenZeppelin's
//! (see docs/sow2/design-approve-allowance.md). Because it is built on the
//! positive control, a run where every check works is 11 of 11 PASS with
//! exit code 0, so a regression in the name handling shows in the exit
//! code. `DEAD_SHARES` is the positive control's test value, sized to the
//! `donation_attack` check; it is not a design recommendation.

use soroban_sdk::{contract, contractimpl, Address, Env, MuxedAddress, String};
use stellar_tokens::{
    fungible::{Base, FungibleToken},
    vault::{FungibleVault, Vault},
};

#[contract]
pub struct Sep41NamesVault;

/// Same value as `contracts/positive-control-vault`.
const DEAD_SHARES: i128 = 100_000_000;

#[contractimpl]
impl Sep41NamesVault {
    pub fn __constructor(
        e: &Env,
        name: String,
        symbol: String,
        asset: Address,
        decimals_offset: u32,
    ) {
        Vault::set_asset(e, asset);
        Vault::set_decimals_offset(e, decimals_offset);
        Base::mint(e, &e.current_contract_address(), DEAD_SHARES);
        Base::set_metadata(e, Self::decimals(e), name, symbol);
    }
}

#[contractimpl(contracttrait)]
impl FungibleToken for Sep41NamesVault {
    type ContractType = Vault;

    fn decimals(e: &Env) -> u32 {
        Vault::decimals(e)
    }

    /// SEP-41 name `from` instead of OpenZeppelin's `owner`.
    fn allowance(e: &Env, from: Address, spender: Address) -> i128 {
        Base::allowance(e, &from, &spender)
    }

    /// SEP-41 names `from` and `expiration_ledger` instead of OpenZeppelin's
    /// `owner` and `live_until_ledger`.
    fn approve(e: &Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        Base::approve(e, &from, &spender, amount, expiration_ledger);
    }
}

#[contractimpl(contracttrait)]
impl FungibleVault for Sep41NamesVault {}
