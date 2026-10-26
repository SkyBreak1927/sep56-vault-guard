# Aegis Vault — Completion Report

**Instawards Statement of Work (SOW) — 30-Day Scoped Engagement — Final Report**

## 1. Project & Team Information

| Field | Value |
|---|---|
| Project Name | Aegis Vault |
| Project URL | https://aegisvault.site |
| Repository | https://github.com/SkyBreak1927/sep56-vault-guard |
| Released Version | 0.5.0 (CLI `sep56-vault-guard`; release v0.5.0) |
| Builder / Team Name | Aegis Vault |
| Primary Contact (Name + Email) | Feby Mara Pandebu (febymarapandebu01@gmail.com) |
| Ambassador Chapter | Stellar Chapter Ambassador Indonesia |
| Ambassador Chapter Lead | Kenny Rivaldi |

## 2. Scope of Work (30-Day Deliverables)

### 2.1 In-Scope Deliverables

| Deliverable | Description | Status | Proof |
|---|---|---|---|
| Deliverable 1 — CLI tool (Rust) | A Rust CLI that takes a deployed Soroban vault address (`--vault`) and invokes `deposit`, `mint`, `withdraw`, `redeem`, `total_assets`, `convert_to_shares` and `convert_to_assets` on Stellar Testnet. The four `max_*` functions and `total_supply` are read inside the deposit, mint, withdraw and redeem checks. Every chain call goes through the Stellar CLI (v28 or newer), and test accounts are funded with Friendbot through `stellar keys generate --fund`; the Rust code has no direct RPC client of its own. Output is text, JSON or Markdown, with exit codes 0 (all pass), 1 (at least one fail), 2 (prerequisite failed) and 3 (no fail, at least one inconclusive). Release binaries for Windows, Linux and macOS are attached to v0.5.0. The Windows binary was run from the website download. The Linux and macOS binaries ran on GitHub Actions runners (ubuntu-22.04 and macos-14 arm64). | Complete | Repo: https://github.com/SkyBreak1927/sep56-vault-guard; Release: v0.5.0; CLI terminal recording (L02); Binary smoke-test run (L11) |
| Deliverable 2 — Positive and negative test suite | 11 checks: 7 conformance checks (`total_assets`, `deposit`, `mint`, `withdraw`, `redeem`, `convert_to_shares`, `convert_to_assets`) and 4 security checks (`donation_attack`, `overflow_protection`, `rounding_direction`, `access_control_probing`). The 7 conformance checks change the state of the target vault and spend Testnet funds; the 4 security checks run against a temporary copy. Each check is mapped in `VAULT_CHECKS.md` to a SEP-56 section heading, pinned to stellar-protocol commit `a5508c4` (SEP-56 v0.1.2, Draft). SEP-56 has no numbered clauses, so headings are the reference, and events are not checked. Seven fixtures were deployed on Testnet. A fully passing run (Positive Control Vault, 11 of 11) and detected failures (`donation_attack` on the Reference Vault, `rounding_direction` on Vault B) are published as sample reports. A fixture whose `max_*` functions always revert produces INCONCLUSIVE on checks 2 to 5, as designed. | Complete | `VAULT_CHECKS.md` (L03); Sample reports (L04-L08); `SECURITY.md` (L09) |
| Deliverable 3 (optional) — Web UI, validation, documentation, demo, Completion Report | Web UI at aegisvault.site where a user pastes a vault address and runs the same checks (a Render backend runs the CLI, one job at a time with a queue of 5). README, `SECURITY.md` and `VAULT_CHECKS.md` are published, and this report is the Completion Report. A demo recording of the CLI is available (L12). Validation against third-party SEP-56 vaults: 3 vaults from 2 builders tested. Lumbung Vault and Karsa Vault, two SEP-56 vaults built by one developer on Testnet, and Feng Vault, an experimental SEP-56 vault built by a second developer to try the checker, were each tested by their builder through the web UI. Lumbung: 10 passed, 1 failed (`donation_attack`, the same finding as on the Reference Vault) (L14, L15). Karsa: 11 passed (L20, L21). Feng: 11 passed (L22). Two further runs, on Celengan and StellarBin, contracts that are not SEP-56, serve as negative tests (L16 to L19). The tool runs on Testnet only by design, so other teams' vaults are tested through their Testnet deployments; the projects named in the SOW (Cushion, Microvault) were not among the vaults tested. All other results in this report come from vaults deployed by the project. | Partial | Web UI: https://aegisvault.site (L10); README (L13); Demo recording (L12); Third-party runs: SEP-56 vaults Lumbung (L14, L15), Karsa (L20, L21) and Feng (L22); negative tests: Celengan (L16, L17) and StellarBin (L18, L19) |

## 3. Evidence of Completion (Required)

### 3.1 Evidence Submitted

| Deliverable | Evidence Type | Description |
|---|---|---|
| Deliverable 1 | Repo link + CLI terminal output / recording | Public repository (L01) with the Rust CLI and release v0.5.0 (L02). The recording (L12) shows `sep56-vault-guard --version` printing 0.5.0, a full run against the Reference Vault on Stellar Testnet (11 checks, 10 passed, 1 failed), and the exit code 1. Supporting: the binary smoke-test run on GitHub Actions for Linux and macOS (L11). |
| Deliverable 2 | `VAULT_CHECKS.md` + sample pass/fail reports | `VAULT_CHECKS.md` (L03) with the SEP-56 heading mapping and results on the fixture vaults. Sample reports from CLI v0.5.0: one fully passing run (Positive Control Vault, 11 of 11, L05), one detected failure (`donation_attack` on the Reference Vault, L04), the `rounding_direction` failure on Vault B (in L03), an inconclusive run (Reverting Max Vault, L06), and the preflight error report (L07). `SECURITY.md` (L09) records known findings and limits. |
| Deliverable 3 | Live web UI link + Completion Report + demo recording | Live web UI (L10). This Completion Report, with the same content in the repository. Demo recording of the CLI (L12). The recording also shows downloading the CLI from the web UI. Third-party runs: three SEP-56 vaults from two builders, Lumbung Vault (L14, L15), Karsa Vault (L20, L21) (same builder) and Feng Vault (L22), and two non-SEP-56 contracts used as negative tests, Celengan (L16, L17) and StellarBin (L18, L19); see the recap in 3.2. |

### 3.2 Third-party test runs (recap)

| Vault | SEP-56? | Result | Role in this report | Evidence |
|---|---|---|---|---|
| Lumbung Vault | Yes | 10 passed, 1 failed (`donation_attack`), 0 not applicable; 86 s | SEP-56 validation | L14, L15 |
| Karsa Vault | Yes | 11 passed, 0 failed, 0 not applicable; 56 s | SEP-56 validation (same builder as Lumbung) | L20, L21 |
| Feng Vault | Yes (experimental vault) | 11 passed, 0 failed, 0 not applicable; 62 s | SEP-56 validation (second builder) | L22 |
| Celengan | No (payment splitter) | 0 passed, 7 failed, 4 not applicable; 31 s | Negative test | L16, L17 |
| StellarBin | No (custom vault interface) | 1 passed, 6 failed, 4 not applicable; 36 s | Negative test | L18, L19 |

All five runs were made by the vault builders themselves through the web UI on Stellar Testnet with CLI 0.5.0 (commit 19d4180). Lumbung Vault and Karsa Vault have the same builder.

## 4. Evidence Verification Checklist

| Deliverable | Evidence Present | Evidence Partial | Evidence Missing | Comments |
|---|---|---|---|---|
| Deliverable 1 | ✔ | | | The CLI reaches the chain through the Stellar CLI rather than a direct RPC client; see note 1 below. |
| Deliverable 2 | ✔ | | | The Positive Control Vault is a shallow positive control for `donation_attack` only; see note 3 below. |
| Deliverable 3 | | ✔ | | Validation covers 3 SEP-56 vaults from 2 builders; the projects named in the SOW were not tested; see note 2 below. |

## 5. Supporting Files

| Code | File | Link |
|---|---|---|
| L01 | Public repository | https://github.com/SkyBreak1927/sep56-vault-guard |
| L02 | Release v0.5.0 (binaries and `.sha256` files) | https://github.com/SkyBreak1927/sep56-vault-guard/releases/tag/v0.5.0 |
| L03 | Check catalogue and results (`VAULT_CHECKS.md`) | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/VAULT_CHECKS.md |
| L04 | Sample report: Reference Vault (detected failure) | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/docs/sample-reports/reference-vault.md |
| L05 | Sample report: Positive Control Vault (11 of 11 PASS) | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/docs/sample-reports/positive-control-vault.md |
| L06 | Sample report: Reverting Max Vault (INCONCLUSIVE case) | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/docs/sample-reports/reverting-max-vault.json |
| L07 | Sample report: preflight error | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/docs/sample-reports/preflight-error.md |
| L08 | Sample reports index | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/docs/sample-reports/README.md |
| L09 | Security findings and limits (`SECURITY.md`) | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/SECURITY.md |
| L10 | Web UI | https://aegisvault.site |
| L11 | Binary smoke-test run (Linux and macOS) | https://github.com/SkyBreak1927/sep56-vault-guard/actions/runs/39135199544 |
| L12 | CLI demo recording | https://www.youtube.com/watch?v=Z23eoUJg0IQ |
| L13 | README | https://github.com/SkyBreak1927/sep56-vault-guard/blob/main/README.md |
| L14 | Lumbung Vault (SEP-56, Testnet): tester's public post, 10 passed, 1 failed | https://x.com/lumbungvault/status/2112903355471446311 |
| L15 | Lumbung Vault evidence folder: screen recording, screenshots, report JSON and Markdown, run log | https://drive.google.com/drive/folders/1_3poPGMlCDcKyNYJ79_OmCQYnL34EPvw |
| L16 | Celengan (not SEP-56, negative test): tester's public post, 0 passed, 7 failed, 4 not applicable | https://x.com/celengan_cc/status/2112509316993622024 |
| L17 | Celengan evidence folder: screen recording, result screenshot, report JSON and Markdown, vault intro | https://drive.google.com/drive/folders/10W_-PLFHz0konjBzIIDLFBsa-6BDnVhk |
| L18 | StellarBin (not SEP-56, negative test): tester's public post, 1 passed, 6 failed, 4 not applicable | https://x.com/Stellar_Bin/status/2113207074163511508 |
| L19 | StellarBin evidence folder: screen recording, screenshots, report JSON and Markdown, vault intro | https://drive.google.com/drive/folders/1CxBF990ToKdCwBECbLGUYMjgLyM0z4gt |
| L20 | Karsa Vault (SEP-56, Testnet): tester's public post, 11 passed | https://x.com/karsavault12/status/2114092445558518048 |
| L21 | Karsa Vault evidence folder: screen recording, screenshots, report JSON and Markdown | https://drive.google.com/drive/folders/1D6yH0lp6NNmVcTDqZ1CI0BOwIcZ__4k3 |
| L22 | Feng Vault evidence folder (SEP-56, experimental vault): screen recording of the run | https://drive.google.com/drive/folders/1rJMWL0OmiUVDZwpqf7r7b37xVAm2VGE2 |

## Notes

1. **Chain access.** The CLI calls `stellar contract invoke` and `stellar contract deploy` and funds accounts through the Stellar CLI. Seven local identities are needed (alice, bob, carol, dave, erin, frank, grace). The Linux and macOS binaries ran on GitHub runners, not on the maintainer's machine; the x86_64 half of the macOS universal binary and macOS notarization were not tested.
2. **Real ecosystem vaults.** Partly completed: three SEP-56 vaults built by third parties (two builders) were tested, but the projects named in the SOW (Cushion, Microvault) were not. Results in this report come from the Reference Vault, Demo Vault, Vault A (`decimals_offset = 6`), Vault B (injected rounding bug), Hardened Vault, Blind Vault (custom asset, `decimals_offset = 3`), Positive Control Vault and Reverting Max Vault, all deployed by the project. In addition, external builders ran the web UI against their own contracts: one developer with two SEP-56 vaults, a second developer with one experimental SEP-56 vault, and two other teams with contracts that are not SEP-56.
   - **Lumbung Vault** (SEP-56, Testnet, CLI 0.5.0, 86 s): 7 of 7 conformance checks passed and 3 of 4 security checks passed; `donation_attack` failed on the temporary copy the check deploys (not on the registered vault), the same finding as on the Reference Vault. The attacker lost about 5.0 XLM (49,976,180 stroops), which the report shows separately from the verdict.
   - **Karsa Vault** (SEP-56, Testnet, CLI 0.5.0, 56 s, same builder as Lumbung): 7 of 7 conformance checks and 4 of 4 security checks passed. `donation_attack` passed on the temporary copy the check deploys: the victim received 4,545,454,545 shares (90.9% of the 5,000,000,000 an undisturbed deposit gives) and the attacker lost the 100,000,000 stroops (10 XLM) it donated. The builder states that the vault adds a virtual liquidity reserve larger than that donation; the reserve itself was not tested, and the check uses a single donation size.
   - **Feng Vault** (SEP-56, Testnet, CLI 0.5.0, 62 s, second builder): an experimental vault that its developer built to try the checker, not a production project. 7 of 7 conformance checks and 4 of 4 security checks passed. The builder states that `total_assets` is tracked by internal bookkeeping, so tokens donated directly to the vault are ignored; the results are consistent with this. `donation_attack` therefore passed with the victim receiving 100% of the expected shares, and in `rounding_direction` the deposit test produced an exact multiple, so only the mint test exercised rounding. The `total_assets` check confirms that the function returns a non-negative number; it does not compare that number with the vault's token balance.
   - **Celengan** is a payment splitter that its team states is not a SEP-56 vault (0 passed, 7 failed, 4 not applicable, 31 s): the conformance checks stopped at the first read of `total_assets`, before any state-changing call, and the security checks reported NOT_APPLICABLE because `query_asset` is missing.
   - **StellarBin** is a custom vault with its own interface (`deposit`, `withdraw`, `nav_per_share`) that its team states is not SEP-56 (1 passed, 6 failed, 4 not applicable, 36 s): `total_assets` passed, the six other conformance checks failed because the SEP-56 function was not found ("unrecognized subcommand"), again before any state-changing call, and the four security checks reported NOT_APPLICABLE because `query_asset` is missing. Both runs show the tool reports a missing interface instead of a false PASS.
   - Lumbung, Karsa and Feng count toward SEP-56 vault validation, so the SOW target of two vaults is met, with vaults from two builders (Lumbung and Karsa share one builder).
3. **What a result means.** A PASS means an assertion held in one run on Testnet; it is not a statement that a vault is safe. A FAIL is a finding to investigate. The Positive Control Vault passes `donation_attack` only because its dead-share constant equals the check's donation size; larger donations were not run. The same limit applies to the Karsa Vault: `donation_attack` uses one donation size (10 XLM), so a PASS is not a result for larger donations.
4. **Review.** No third-party security review was carried out. Security findings come from the project's own Testnet runs.
5. **Other limits.** Events are not checked. `convert_to_shares` and `convert_to_assets` rounding checks test a necessary condition only. A `total_supply` that reverts was not tested separately. One smoke-test run on macOS ended INCONCLUSIVE for a reason the tool could not classify; the cause is unknown and a repeat run passed.
6. **Beyond the SOW.** A login account (Supabase) and the hosted runner on Render were added outside the SOW's scope.
7. **Next steps.** Apply for an SCF Build Award, as stated in the SOW. Improvements suggested by the four testers, mostly about wording and display: report a missing interface as "unsupported interface" and detect it at the start of a run; show the victim-side result and the economic outcome together in the `donation_attack` verdict; state clearly that the security checks run on a temporary copy; use "review required" instead of "Remediation needed" in the JSON and Markdown summary; label results with the draft version of SEP-56 on each row; fix the description shown under a FAIL badge; add a structured reason field (for example interface missing or behavior mismatch) to the JSON and keep the raw error text, which includes the CLI usage line and test account names, in a separate field; explain in the summary line that "1 of 7 passed" can mean only that a read function exists; call `approve` and `allowance` in `access_control_probing` positionally, because the check uses the parameter names `owner` and `live_until_ledger` while SEP-41 uses `from` and `expiration_ledger`, which can leave such a vault inconclusive; state in the documentation the constructor parameter names the security checks need (`name`, `symbol`, `asset`, `decimals_offset`).
