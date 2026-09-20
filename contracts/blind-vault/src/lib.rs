#![no_std]

// Deliberately an EXACT clone of contracts/reference-vault — no code
// changes of any kind — deployed with a different decimals_offset and a
// non-native underlying asset purely as a blind generalization test of the
// Aegis Vault checker. See VAULT_CHECKS.md for the deployment parameters
// and full results.

use soroban_sdk::{contract, contractimpl, Address, Env, MuxedAddress, String};
use stellar_tokens::{
    fungible::{Base, FungibleToken},
    vault::{FungibleVault, Vault},
};

#[contract]
pub struct BlindVault;

#[contractimpl]
impl BlindVault {
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
impl FungibleToken for BlindVault {
    type ContractType = Vault;

    // Allows override of decimals and other base functions.

    fn decimals(e: &Env) -> u32 {
        Vault::decimals(e)
    }
}

#[contractimpl(contracttrait)]
impl FungibleVault for BlindVault {}
