#![no_std]

// ⚠️ INTENTIONALLY BUGGY CONTRACT — for Aegis Vault demo/testing purposes
// only. `convert_to_shares`/`convert_to_assets` round UP (Ceil) instead of
// DOWN (Floor), reversing SEP-56's "rounding always favors the vault"
// requirement so it favors the user instead. Everything else is identical
// to `contracts/reference-vault`. Do not deploy this pattern in production.

use soroban_sdk::{contract, contractimpl, Address, Env, MuxedAddress, String};
use stellar_contract_utils::math::Rounding;
use stellar_tokens::{
    fungible::{Base, FungibleToken},
    vault::{FungibleVault, Vault},
};

#[contract]
pub struct RoundingBugVault;

#[contractimpl]
impl RoundingBugVault {
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
        // Vault overrides the decimals function by default.
        // Decimal offset must be set prior to metadata initialization.
        Base::set_metadata(e, Self::decimals(e), name, symbol);
    }
}

#[contractimpl(contracttrait)]
impl FungibleToken for RoundingBugVault {
    type ContractType = Vault;

    // Allows override of decimals and other base functions.

    fn decimals(e: &Env) -> u32 {
        Vault::decimals(e)
    }
}

#[contractimpl(contracttrait)]
impl FungibleVault for RoundingBugVault {
    // BUG: rounds UP instead of DOWN, favoring the user over the vault —
    // reverses the direction SEP-56 requires.
    fn convert_to_shares(e: &Env, assets: i128) -> i128 {
        Vault::convert_to_shares_with_rounding(e, assets, Rounding::Ceil)
    }

    // BUG: same reversal in the assets<-shares direction.
    fn convert_to_assets(e: &Env, shares: i128) -> i128 {
        Vault::convert_to_assets_with_rounding(e, shares, Rounding::Ceil)
    }
}
