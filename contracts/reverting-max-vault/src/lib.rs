#![no_std]

// TEST FIXTURE ONLY. A copy of `contracts/reference-vault` whose
// `max_deposit`, `max_mint`, `max_withdraw` and `max_redeem` always panic.
// It exists to see how the checker classifies a vault whose limit functions
// revert. Everything else is identical to the reference vault.

use soroban_sdk::{contract, contractimpl, Address, Env, MuxedAddress, String};
use stellar_tokens::{
    fungible::{Base, FungibleToken},
    vault::{FungibleVault, Vault},
};

#[contract]
pub struct RevertingMaxVault;

#[contractimpl]
impl RevertingMaxVault {
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
impl FungibleToken for RevertingMaxVault {
    type ContractType = Vault;

    // Allows override of decimals and other base functions.

    fn decimals(e: &Env) -> u32 {
        Vault::decimals(e)
    }
}

#[contractimpl(contracttrait)]
impl FungibleVault for RevertingMaxVault {
    fn max_deposit(_e: &Env, _receiver: Address) -> i128 {
        panic!("max_deposit reverts by design")
    }

    fn max_mint(_e: &Env, _receiver: Address) -> i128 {
        panic!("max_mint reverts by design")
    }

    fn max_withdraw(_e: &Env, _owner: Address) -> i128 {
        panic!("max_withdraw reverts by design")
    }

    fn max_redeem(_e: &Env, _owner: Address) -> i128 {
        panic!("max_redeem reverts by design")
    }
}
