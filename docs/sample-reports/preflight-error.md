# Aegis Vault — Conformance Verification Report

- Vault: `CBH2EDM4OZOPACOAYBTH7YPKOJHYMVEVJSJKKHF3B7RON2A7QQQY5ARR`
- Network: testnet
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Result: Prerequisite missing, no checks were run

## Error

- Error: `preflight_failed`
- Code: `vault_not_a_contract`

### Problem

CBH2EDM4OZOPACOAYBTH7YPKOJHYMVEVJSJKKHF3B7RON2A7QQQY5ARR could not be confirmed as a contract on testnet: it does not exist there, or it has no Wasm of its own (a Stellar Asset Contract has none).

### Fix

Check the address, and that it is deployed on testnet rather than another network.

No checks were run.
