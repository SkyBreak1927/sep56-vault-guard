# Aegis Vault — SEP-56 Check Report

- Vault: `CAHMH3VSMNCYDCRTCZBJOKJE65HT2LJBZQFQULMRH6E2OGGGPMSNG376`
- Network: testnet
- Mode: Testnet. The 7 conformance checks send real transactions to the target vault with Testnet funds and change its state. The 4 security checks run on a temporary copy; the target is only read.
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Scope: checks 7 core SEP-56 functions and four basic security risks, on Testnet. Events are not checked. A result describes the scenarios that were run; it is not a statement that the vault is safe or correct.
- Started: 2026-11-16T10:33:45.824Z
- Completed: 2026-11-16T10:34:35.254Z
- Duration: 49 s
- Result: All checks passed
- Core function checks: 7 of 7 passed
- Basic security checks: 4 of 4 passed

## Core function checks

| # | Check | Status | Mode | Spec | Runs on | Detail |
|---|---|---|---|---|---|---|
| 01 | `total_assets` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | total\_assets = 72000024 |
| 02 | `deposit` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | deposited 5000000 units of the underlying asset, minted 499999509527845 shares matching preview\_deposit(), total\_assets 72000024 -\> 77000024; max\_deposit=170141183460469231731687303715884105727, total\_supply 7199995437198527 -\> 7699994946726372 |
| 03 | `mint` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | minted 3000000 shares, pulled 1 assets matching preview\_mint(), total\_assets 77000024 -\> 77000025; max\_mint=170141183460469231731687303715884105727, total\_supply 7699994946726372 -\> 7699994949726372 |
| 04 | `withdraw` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | withdrew 2000000 units of the underlying asset, burned 199999801291662 shares matching preview\_withdraw(), total\_assets 77000025 -\> 75000025; max\_withdraw=47000011, total\_supply 7699994949726372 -\> 7499995148434710 |
| 05 | `redeem` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | redeemed 1000000 shares, received 0 assets matching preview\_redeem(), total\_assets 75000025 -\> 75000025; max\_redeem=4499996679779501, total\_supply 7499995148434710 -\> 7499995147434710 |
| 06 | `convert_to_shares` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | convert\_to\_shares(4000000) = 399999602529989, round-trip convert\_to\_assets(399999602529989) = 3999999 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 75000025 |
| 07 | `convert_to_assets` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | convert\_to\_assets(4000000) = 0, round-trip convert\_to\_shares(0) = 0 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 75000025 |

## Basic security checks

| # | Check | Status | Mode | Spec | Runs on | Detail |
|---|---|---|---|---|---|---|
| 08 | `donation_attack` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | In this scenario the vault held up — fresh vault CA4XI4QMOM3LHJTH2QUL64754ACC7ZLWSK4SJOQ76VYXG6BJ6DTJTOLM (decimals\_offset=0): attacker deposited 1 stroop(s) then donated 100000000 stroops directly (bypassing deposit()); victim then deposited 5000000 stroops and received 9999999 shares (199% of the 5000000 expected from an undisturbed deposit at this vault's decimals\_offset); attacker P&L: net loss of 50000000 stroops (spent 100000001, redeemed 50000001) |
| 09 | `overflow_protection` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | NOTE: this does not test the vault's own overflow protection. deposit(assets=i128::MAX) on fresh vault CAM5DV53EY6UXITLFOKDG4ZWWHRICCUPL4EF3FDV4HUITQW3ESITVQJR failed cleanly (rejected by the network, with no error text), and total\_assets remained 0 — no wrong result observed. at decimals\_offset=0, the vault's own share math does not overflow for i128::MAX (shares = assets exactly), so this failure is instead triggered by the classic Stellar Asset Contract's own int64 amount ceiling ("spent amount is too large for an i64") on the underlying asset transfer — a limit outside the vault's control, NOT a demonstration of the vault's own overflow protection. |
| 10 | `rounding_direction` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | fresh vault CBDUVJVNIPYH6G7PQ5CZM6UCNMXH3I67OTZZVMIJTJLLCRDPRYL6ISRG at fractional ratio (seed 1000 + donation 500): Test A — deposit(100) minted 6668887475 shares matching preview\_deposit() (floor, favors vault); Test B — mint(100 shares) pulled 1 assets matching preview\_mint() (ceil) and strictly greater than the idealized convert\_to\_assets() (0) — at this ratio, rounding favored the vault in both directions tested |
| 11 | `access_control_probing` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | fresh vault CBGD56SAQXMM7KSXJC36LGE2225ROJRV7QMRXPI4SW4YHQJRS6UNML7I (decimals\_offset=0): unauthorized withdraw (no approval) correctly rejected; after owner approved operator for 100000001000000 shares, operator withdrew 50000000500000 shares (allowance 100000001000000 -\> 50000000500000, decremented exactly); operator's over-allowance withdraw attempt of 1500000 assets (requiring more shares than the remaining 50000000500000-share allowance) correctly rejected with allowance left untouched at 50000000500000 |

_Timestamps are recorded by the CLI when the run starts and when it finishes._
