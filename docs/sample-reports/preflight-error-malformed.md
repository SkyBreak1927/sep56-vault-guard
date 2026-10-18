# Aegis Vault — Conformance Verification Report

- Vault: `GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554`
- Network: testnet
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Result: Prerequisite missing, no checks were run

## Error

- Error: `preflight_failed`
- Code: `vault_address_malformed`

### Problem

GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554 is not a contract address: a Soroban contract address is 56 characters and starts with C

### Fix

Pass a deployed vault's contract address with --vault.

No checks were run.
