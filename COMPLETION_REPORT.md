# Aegis Vault — Completion Report

**Instawards Program — Stellar Chapter Ambassador Indonesia**
**Builder:** Feby Mara Pandebu | **Ambassador Chapter Lead:** Kenny Rivaldi

## Summary

Aegis Vault is an open-source command-line tool, with a hosted web UI, that checks 7 core SEP-56 functions and four basic security risks of a Soroban tokenized vault on Stellar Testnet. This report covers version **v0.5.0**.

- **Repository:** https://github.com/SkyBreak1927/sep56-vault-guard
- **Web UI:** https://aegisvault.site
- **Release:** [v0.5.0](https://github.com/SkyBreak1927/sep56-vault-guard/releases/tag/v0.5.0)

What this work is, and is not:

- It is functional and adversarial testing of vault contracts. It is not a formal third-party security review.
- It runs on Testnet only. The network is fixed in the code and there is no flag for mainnet.
- It gives no verdict that a vault is "safe". A PASS means an assertion held in one run on Testnet; a FAIL is a finding to investigate.
- The 7 conformance checks change the state of the target vault and spend Testnet funds. Only the 4 security checks run against a temporary copy.

## Results per deliverable

### Deliverable 1 — CLI core

| SOW item | Status | Evidence | Gap |
|---|---|---|---|
| Rust CLI | Done | `cli/` in the repository; release v0.5.0 | None |
| Connection to Stellar RPC | Done, indirectly | Every chain call goes through the Stellar CLI (v28 or newer): `stellar contract invoke` and `stellar contract deploy` (`cli/src/rpc.rs`) | There is no direct RPC client in the Rust code |
| Friendbot funding | Done, indirectly | Accounts are created and funded with `stellar keys generate <name> --network testnet --fund`, which uses Friendbot (README, Prerequisites) | The CLI does not call Friendbot itself. Seven local identities are needed: `alice bob carol dave erin frank grace` |
| `deposit`, `mint`, `withdraw`, `redeem` | Done | Conformance checks 02–05, run on Testnet; see `docs/sample-reports/` | None known |
| `total_assets`, `convert_to_shares`, `convert_to_assets` | Done | Checks 01, 06, 07 | Checks 06 and 07 test a necessary condition only (a floor/floor round trip never creates value), not the full conversion rule |
| `max_deposit`, `max_mint`, `max_withdraw`, `max_redeem` | Done in code, partly unproven | Read inside checks 02–05 since v0.4.0 (`VAULT_CHECKS.md`) | The handling of a vault whose `max_*` or `total_supply` reverts is classified from reading the code and has not been run against such a vault |
| `total_supply` (not in the SOW) | Added | Read inside checks 02–05 | Same gap as `max_*` |
| Generalisation with `--vault` | Done | Target vault's Wasm hash, `decimals_offset` and asset are resolved at run time | The security checks need the constructor `(name, symbol, asset, decimals_offset)` and `query_asset`; otherwise they report `NOT_APPLICABLE` |
| Release binaries | Partly done | Windows, Linux and macOS (universal) archives with `.sha256` files are attached to v0.5.0 | The maintainer has not run the Linux and macOS binaries. The macOS binary is not notarized |

### Deliverable 2 — Test suite

| SOW item | Status | Evidence | Gap |
|---|---|---|---|
| 11 checks (7 conformance, 4 security) | Done | `VAULT_CHECKS.md`; sample reports in `docs/sample-reports/` | See Limitations |
| Mapping to SEP-56 | Done by heading | `VAULT_CHECKS.md` has a SEP-56 heading column, pinned to stellar-protocol commit `a5508c4` (SEP-56 version 0.1.2, status Draft). SEP-56 has no numbered clauses, so headings are the reference | Events (`Deposit`, `Withdraw`) are not checked |
| One full pass | Done | Positive Control Vault: 11 of 11 PASS, exit code 0 (`docs/sample-reports/positive-control-vault.md`) | It is a positive control for `donation_attack` only. `redeem` returns 0 assets and `convert_to_assets` returns 0 there, and only one donation size was run. It is not a recommended design |
| Failure examples | Done | `donation_attack` fails on the Reference Vault (`docs/sample-reports/reference-vault.md`, exit code 1); `rounding_direction` fails on Vault B (`VAULT_CHECKS.md`) | None |
| Check 09, `overflow_protection` | Done, with a caveat | `SECURITY.md` section 2 | At `decimals_offset = 0` the failure that makes the check PASS comes from the asset contract, not from the vault's own protection |
| Preflight and report formats | Done | Text, JSON and Markdown output; a missing prerequisite exits with code 2 (`docs/sample-reports/preflight-error.md`) | None |

### Deliverable 3 — Web UI, validation and documentation

| SOW item | Status | Evidence | Gap |
|---|---|---|---|
| Web UI | Done | https://aegisvault.site: Next.js on Vercel; a Render backend runs the CLI, one job at a time with a queue of 5 | The hosted runner and the Supabase login account (`web/src/lib/supabase.ts`) are outside the SOW |
| Documentation | Done | `README.md`, `SECURITY.md`, `VAULT_CHECKS.md`, the docs pages on the site | CLI Markdown output and the web export have not been compared for identical content |
| Demo recording | Open | A recording of 3:55 exists. [PANDEBU: konfirmasi apakah CLI tampil di video] | Not confirmed |
| Validation against real ecosystem vaults | Open | [MENUNGGU BUKTI: validasi vault ekosistem asli sedang berjalan] | No result is stated here |
| Generalisation on own fixtures | Done | Vault A (`decimals_offset = 6`), Vault B (rounding bug), Hardened Vault, Blind Vault (custom asset, `decimals_offset = 3`), Positive Control Vault; expected results in `VAULT_CHECKS.md` | These are temporary stand-ins for real vaults, not third-party contracts |

## Limitations

- **Real ecosystem vaults.** See the open marker above. Until it is closed, every result in this report is from vaults deployed by the project.
- **Specialist security review.** [PANDEBU: konfirmasi status]
- **Fixtures instead of real vaults.** Vault A, Vault B, Hardened Vault, Blind Vault and the Positive Control Vault were built for this project.
- **Reverting functions not tested.** From reading the code, a vault function that exists but reverts ends as `INCONCLUSIVE` with `unclassified_error`, not as FAIL. This has not been run against such a vault.
- **The Positive Control Vault is shallow.** `donation_attack` passes there because the dead-share constant (100,000,000) equals the check's donation size. Larger donations were not run.
- **A check can PASS with a value of zero.** On the Positive Control Vault, `redeem` and `convert_to_assets` PASS with 0 because their assertions held. They carry almost no information at that share price.
- **`donation_attack` ignores a share price already in the vault.** Its baseline is the deposit times `10^decimals_offset`, so on a vault that already holds shares the reported percentage (199% on the Positive Control Vault) does not measure how well off the victim is.
- **Events are not checked.** A vault that emits wrong events, or none, can still PASS every check.
- **CLI Markdown versus web export.** The structure matches `web/src/lib/report.ts` for the title, header list, summary and per-group tables. The CLI table has no "Settled at" column and adds an Error section; the web export has a timing note. Identical content for the same run was not tested.
- **Linux and macOS binaries.** They were built by the release workflow and have not been run by the maintainer.
- **Beyond the SOW.** The login account (Supabase) and the hosted runner on Render were added outside the SOW.

## Possible Next Steps

1. Apply for an SCF Build Award, as the SOW's next-step section anticipates.
2. Close the real ecosystem vault validation once operator permission is granted and results are available, and add those results to VAULT_CHECKS.md and to this report.
3. Run the Linux and macOS binaries on real machines against Testnet, and notarize the macOS binary.
4. Run the `max_*` and `total_supply` handling against a vault whose functions revert, and add a deeper positive control (larger donation sizes, non-zero redeem values).
5. Consider checking the `Deposit` and `Withdraw` events, and address the two known CLI limits (a check passing with a value of zero, and the `donation_attack` baseline ignoring an existing share price).

## Evidence Index

| Item | Link |
|---|---|
| Repository | https://github.com/SkyBreak1927/sep56-vault-guard |
| Release v0.5.0 | https://github.com/SkyBreak1927/sep56-vault-guard/releases/tag/v0.5.0 |
| Web UI | https://aegisvault.site |
| README | [README.md](./README.md) |
| Security findings | [SECURITY.md](./SECURITY.md) |
| Check descriptions and results | [VAULT_CHECKS.md](./VAULT_CHECKS.md) |
| Sample reports from CLI v0.5.0 | [docs/sample-reports/](./docs/sample-reports/) |
