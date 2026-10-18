# Sample reports

These three files are the unedited output of `sep56-vault-guard --output markdown`, saved exactly as the CLI printed them. Nothing was added, removed or reworded by hand.

- CLI version: `sep56-vault-guard 0.5.0`
- Network: Stellar testnet only
- Run date (UTC): 2026-10-18, runs executed one after another (last run completed 13:27:56Z)

| File | Command | Vault / input | Exit code |
|---|---|---|---|
| [positive-control-vault.md](positive-control-vault.md) | `sep56-vault-guard --vault CAHMH3VSMNCYDCRTCZBJOKJE65HT2LJBZQFQULMRH6E2OGGGPMSNG376 --output markdown` | Positive Control Vault | 0 (11 PASS) |
| [reference-vault.md](reference-vault.md) | `sep56-vault-guard --vault CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF --output markdown` | Reference Vault | 1 (10 PASS, 1 FAIL: `donation_attack`) |
| [preflight-error.md](preflight-error.md) | `sep56-vault-guard --vault CBH2EDM4OZOPACOAYBTH7YPKOJHYMVEVJSJKKHF3B7RON2A7QQQY5ARR --output markdown` | A syntactically valid contract address with no contract deployed on testnet | 2 (preflight failed, no check ran; `vault_not_a_contract`) |

## Notes

- Each report was produced by the CLI itself, without edits.
- The seven core function checks change the state of the target vault and use testnet funds. Only the four basic security checks run against a temporary copy of the vault.
- The Positive Control Vault is a positive control for `donation_attack` only. It is not a recommended design: its `redeem` and `convert_to_assets` values are zero, and it was sized to a single donation size. Its 11 of 11 result is not a statement that the vault is safe.
- Passing checks describe behaviour observed in these runs on testnet. They are not a formal third-party security review.
