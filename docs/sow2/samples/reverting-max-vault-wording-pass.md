# Aegis Vault — SEP-56 Check Report

- Vault: `CBMB3D7H22CARRIQX3CXEABXBY7QXSYCG4JJ5LL5DD3T3DHE46GNH5O4`
- Network: testnet
- Mode: Testnet. The 7 conformance checks send real transactions to the target vault with Testnet funds and change its state. The 4 security checks run on a temporary copy; the target is only read.
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Scope: checks 7 core SEP-56 functions and four basic security risks, on Testnet. Events are not checked. A result describes the scenarios that were run; it is not a statement that the vault is safe or correct.
- Started: 2026-11-16T10:35:32.064Z
- Completed: 2026-11-16T10:36:18.726Z
- Duration: 47 s
- Result: Review required
- Core function checks: 3 of 7 passed
- Basic security checks: 3 of 4 passed
- Inconclusive: 4

## Core function checks

| # | Check | Status | Mode | Spec | Runs on | Detail |
|---|---|---|---|---|---|---|
| 01 | `total_assets` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | total\_assets = 0 |
| 02 | `deposit` | INCONCLUSIVE | testnet | SEP-0056 v0.1.2 (Draft) | target vault | the call to max\_deposit() failed for a reason the tool could not classify. No finding about the vault. Raw error: ❌ error: transaction simulation failed: HostError: Error(WasmVm, InvalidAction) |
| 03 | `mint` | INCONCLUSIVE | testnet | SEP-0056 v0.1.2 (Draft) | target vault | the call to max\_mint() failed for a reason the tool could not classify. No finding about the vault. Raw error: ❌ error: transaction simulation failed: HostError: Error(WasmVm, InvalidAction) |
| 04 | `withdraw` | INCONCLUSIVE | testnet | SEP-0056 v0.1.2 (Draft) | target vault | the call to max\_withdraw() failed for a reason the tool could not classify. No finding about the vault. Raw error: ❌ error: transaction simulation failed: HostError: Error(WasmVm, InvalidAction) |
| 05 | `redeem` | INCONCLUSIVE | testnet | SEP-0056 v0.1.2 (Draft) | target vault | the call to max\_redeem() failed for a reason the tool could not classify. No finding about the vault. Raw error: ❌ error: transaction simulation failed: HostError: Error(WasmVm, InvalidAction) |
| 06 | `convert_to_shares` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | convert\_to\_shares(4000000) = 4000000, round-trip convert\_to\_assets(4000000) = 4000000 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 0 |
| 07 | `convert_to_assets` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | convert\_to\_assets(4000000) = 4000000, round-trip convert\_to\_shares(4000000) = 4000000 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 0 |

## Basic security checks

| # | Check | Status | Mode | Spec | Runs on | Detail |
|---|---|---|---|---|---|---|
| 08 | `donation_attack` | FAIL | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | Finding in the donation scenario — fresh vault CDFF7RC6CBQATR3TDHX3WY36RL7666FTBDLCEINE2CIWCFENUIGNSQCW (decimals\_offset=0): attacker deposited 1 stroop(s) then donated 100000000 stroops directly (bypassing deposit()); victim then deposited 5000000 stroops and received 0 shares (0% of the 5000000 expected from an undisturbed deposit at this vault's decimals\_offset); attacker P&L: net loss of 47500000 stroops (spent 100000001, redeemed 52500001) |
| 09 | `overflow_protection` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | NOTE: this does not test the vault's own overflow protection. deposit(assets=i128::MAX) on fresh vault CAZEPTUYZ5O7TKBMHJJXQBKQ4EYJYIGHAITQPJF6IRU6Y7FEUWAMRMBB failed cleanly (rejected by the network, with no error text), and total\_assets remained 0 — no wrong result observed. at decimals\_offset=0, the vault's own share math does not overflow for i128::MAX (shares = assets exactly), so this failure is instead triggered by the classic Stellar Asset Contract's own int64 amount ceiling ("spent amount is too large for an i64") on the underlying asset transfer — a limit outside the vault's control, NOT a demonstration of the vault's own overflow protection. |
| 10 | `rounding_direction` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | fresh vault CBGS6ARK6646D5KJJ7TSTJJE4YSFLLZIJ5WOM7WF6G323B5OIYZI5WRE at fractional ratio (seed 1000 + donation 500): Test A — deposit(100) minted 66 shares matching preview\_deposit() (floor, favors vault); Test B — mint(100 shares) pulled 151 assets matching preview\_mint() (ceil) and strictly greater than the idealized convert\_to\_assets() (150) — at this ratio, rounding favored the vault in both directions tested |
| 11 | `access_control_probing` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | fresh vault CDZTCRRVPRFF3EJA7SKUB72NNJ7GRAEJF576NF6MX3JKAOWCI3OGQXR5 (decimals\_offset=0): unauthorized withdraw (no approval) correctly rejected; after owner approved operator for 1000000 shares, operator withdrew 500000 shares (allowance 1000000 -\> 500000, decremented exactly); operator's over-allowance withdraw attempt of 1500000 assets (requiring more shares than the remaining 500000-share allowance) correctly rejected with allowance left untouched at 500000 |

_Timestamps are recorded by the CLI when the run starts and when it finishes._
