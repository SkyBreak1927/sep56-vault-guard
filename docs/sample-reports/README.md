# Sample reports

The Markdown files here are the unedited output of `sep56-vault-guard --output markdown`. The one exception is `reverting-max-vault.json`, which is the unedited output of `--output json`. All are saved exactly as the CLI printed them. Nothing was added, removed or reworded by hand.

- CLI version: `sep56-vault-guard 0.5.0`
- Network: Stellar testnet only
- Run date (UTC): 2026-10-18, runs executed one after another (last run completed 13:27:56Z)

| File | Command | Vault / input | Exit code |
|---|---|---|---|
| [positive-control-vault.md](positive-control-vault.md) | `sep56-vault-guard --vault CAHMH3VSMNCYDCRTCZBJOKJE65HT2LJBZQFQULMRH6E2OGGGPMSNG376 --output markdown` | Positive Control Vault | 0 (11 PASS) |
| [reference-vault.md](reference-vault.md) | `sep56-vault-guard --vault CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF --output markdown` | Reference Vault | 1 (10 PASS, 1 FAIL: `donation_attack`) |
| [preflight-error.md](preflight-error.md) | `sep56-vault-guard --vault CBH2EDM4OZOPACOAYBTH7YPKOJHYMVEVJSJKKHF3B7RON2A7QQQY5ARR --output markdown` | A syntactically valid contract address with no contract deployed on testnet | 2 (preflight failed, no check ran; `vault_not_a_contract`) |
| [preflight-error-malformed.md](preflight-error-malformed.md) | `sep56-vault-guard --vault GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554 --output markdown` | A public account address (starts with `G`), not a contract address | 2 (preflight failed, no check ran; `vault_address_malformed`) |
| [reverting-max-vault.json](reverting-max-vault.json) | `sep56-vault-guard --vault CBMB3D7H22CARRIQX3CXEABXBY7QXSYCG4JJ5LL5DD3T3DHE46GNH5O4 --output json` | Reverting Max Vault (`max_*` always revert), CLI 0.5.0, 2026-10-18 | 1 (6 PASS, 4 INCONCLUSIVE `unclassified_error`, 1 FAIL `donation_attack`) |

## Notes

- Each report was produced by the CLI itself, without edits.
- The seven core function checks change the state of the target vault and use testnet funds. Only the four basic security checks run against a temporary copy of the vault.
- The Positive Control Vault is a positive control for `donation_attack` only. It is not a recommended design: its `redeem` and `convert_to_assets` values are zero, and it was sized to a single donation size. Its 11 of 11 result is not a statement that the vault is safe.
- Two preflight cases are kept because they fail at different stages: `vault_address_malformed` is rejected on the address format alone, before anything is asked of testnet; `vault_not_a_contract` needs a well-formed contract address that testnet does not confirm as a contract.
- `preflight-error-malformed.md` was first produced in the same session as the other reports (2026-10-18) and was then overwritten by mistake. It was regenerated at 13:29:29Z with the identical command; the output matches the first run line for line.
- Passing checks describe behaviour observed in these runs on testnet. They are not a formal third-party security review.
