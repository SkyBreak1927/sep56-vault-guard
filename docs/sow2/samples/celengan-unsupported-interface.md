# Aegis Vault — Conformance Verification Report

- Vault: `CCM6TNVNYYFUYXDON5HAGWMBL6IWMWIOZJFUNEWDUAJAGSJE326RWD2O`
- Network: testnet
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Result: Unsupported interface, no checks were run

## Error

- Error: `preflight_failed`
- Code: `unsupported_interface`

### Problem

CCM6TNVNYYFUYXDON5HAGWMBL6IWMWIOZJFUNEWDUAJAGSJE326RWD2O does not have the SEP-56 vault interface this tool checks. Missing (16 of the 16 functions the checks call): total\_assets, total\_supply, convert\_to\_shares, convert\_to\_assets, preview\_deposit, preview\_mint, preview\_withdraw, preview\_redeem, max\_deposit, max\_mint, max\_withdraw, max\_redeem, deposit, mint, withdraw, redeem. No check was run and no contract function was invoked.

### Missing functions

- `total_assets`
- `total_supply`
- `convert_to_shares`
- `convert_to_assets`
- `preview_deposit`
- `preview_mint`
- `preview_withdraw`
- `preview_redeem`
- `max_deposit`
- `max_mint`
- `max_withdraw`
- `max_redeem`
- `deposit`
- `mint`
- `withdraw`
- `redeem`

### Fix

This tool checks SEP-56 tokenized vaults. If this contract is meant to be one, declare these functions with the argument names and types SEP-56 uses (listed in VAULT\_CHECKS.md), deploy it, and run again.

No checks were run.
