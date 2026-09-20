#![no_std]

//! Minimal custom fungible token, deployed purely to serve as a non-native
//! underlying asset for `contracts/blind-vault`'s blind generalization
//! test. Vanilla SEP-41 surface (via `FungibleToken`/`Base`, no
//! overrides), plus an admin-gated `mint()` so testnet balances can be
//! created directly — Friendbot only funds native XLM, not custom assets.
//!
//! This is a test fixture, not a production token: `mint()` has no
//! supply cap and trusts a single admin address set at construction.

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, MuxedAddress, String};
use stellar_tokens::fungible::{Base, FungibleToken};

#[contract]
pub struct BlindAsset;

#[contracttype]
enum DataKey {
    Admin,
}

#[contractimpl]
impl BlindAsset {
    pub fn __constructor(e: &Env, admin: Address, name: String, symbol: String) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        Base::set_metadata(e, 7, name, symbol);
    }

    /// Mints `amount` tokens to `to`. Restricted to the admin address set
    /// at construction time.
    pub fn mint(e: &Env, to: Address, amount: i128) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        Base::mint(e, &to, amount);
    }
}

#[contractimpl(contracttrait)]
impl FungibleToken for BlindAsset {
    type ContractType = Base;
}
