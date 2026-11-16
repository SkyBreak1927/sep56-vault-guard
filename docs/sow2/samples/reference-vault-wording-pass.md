# Aegis Vault — SEP-56 Check Report

- Vault: `CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF`
- Network: testnet
- Mode: Testnet. The 7 conformance checks send real transactions to the target vault with Testnet funds and change its state. The 4 security checks run on a temporary copy; the target is only read.
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Scope: checks 7 core SEP-56 functions and four basic security risks, on Testnet. Events are not checked. A result describes the scenarios that were run; it is not a statement that the vault is safe or correct.
- Started: 2026-11-16T10:31:49.784Z
- Completed: 2026-11-16T10:32:39.109Z
- Duration: 49 s
- Result: Review required
- Core function checks: 7 of 7 passed
- Basic security checks: 3 of 4 passed

## Core function checks

| # | Check | Status | Mode | Spec | Runs on | Detail |
|---|---|---|---|---|---|---|
| 01 | `total_assets` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | total\_assets = 623501000 |
| 02 | `deposit` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | deposited 5000000 units of the underlying asset, minted 5000000 shares matching preview\_deposit(), total\_assets 623501000 -\> 628501000; max\_deposit=170141183460469231731687303715884105727, total\_supply 623501000 -\> 628501000 |
| 03 | `mint` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | minted 3000000 shares, pulled 3000000 assets matching preview\_mint(), total\_assets 628501000 -\> 631501000; max\_mint=170141183460469231731687303715884105727, total\_supply 628501000 -\> 631501000 |
| 04 | `withdraw` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | withdrew 2000000 units of the underlying asset, burned 2000000 shares matching preview\_withdraw(), total\_assets 631501000 -\> 629501000; max\_withdraw=481501000, total\_supply 631501000 -\> 629501000 |
| 05 | `redeem` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | redeemed 1000000 shares, received 1000000 assets matching preview\_redeem(), total\_assets 629501000 -\> 628501000; max\_redeem=479501000, total\_supply 629501000 -\> 628501000 |
| 06 | `convert_to_shares` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | convert\_to\_shares(4000000) = 4000000, round-trip convert\_to\_assets(4000000) = 4000000 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 628501000 |
| 07 | `convert_to_assets` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | target vault | convert\_to\_assets(4000000) = 4000000, round-trip convert\_to\_shares(4000000) = 4000000 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 628501000 |

## Basic security checks

| # | Check | Status | Mode | Spec | Runs on | Detail |
|---|---|---|---|---|---|---|
| 08 | `donation_attack` | FAIL | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | Finding in the donation scenario — fresh vault CD2J2FYZ3E7DPGUJGP5WQGMXOAA26CQ4IIHFA32NTJHRMHMFW4RUCCRC (decimals\_offset=0): attacker deposited 1 stroop(s) then donated 100000000 stroops directly (bypassing deposit()); victim then deposited 5000000 stroops and received 0 shares (0% of the 5000000 expected from an undisturbed deposit at this vault's decimals\_offset); attacker P&L: net loss of 47500000 stroops (spent 100000001, redeemed 52500001) |
| 09 | `overflow_protection` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | NOTE: this does not test the vault's own overflow protection. deposit(assets=i128::MAX) on fresh vault CCC664U5KVZSVOOQAL3X4IXNM54FRYMPNDOGMVUTKHOXXNSMJ5TDKXO3 failed cleanly (rejected by the network, with no error text), and total\_assets remained 0 — no wrong result observed. at decimals\_offset=0, the vault's own share math does not overflow for i128::MAX (shares = assets exactly), so this failure is instead triggered by the classic Stellar Asset Contract's own int64 amount ceiling ("spent amount is too large for an i64") on the underlying asset transfer — a limit outside the vault's control, NOT a demonstration of the vault's own overflow protection. |
| 10 | `rounding_direction` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | fresh vault CD4NNSZQ7EZPPUQXJ3C6FY4WIOQ2CQ3FTSUV2B7SUTRLCZVADT4WO3DH at fractional ratio (seed 1000 + donation 500): Test A — deposit(100) minted 66 shares matching preview\_deposit() (floor, favors vault); Test B — mint(100 shares) pulled 151 assets matching preview\_mint() (ceil) and strictly greater than the idealized convert\_to\_assets() (150) — at this ratio, rounding favored the vault in both directions tested |
| 11 | `access_control_probing` | PASS | testnet | SEP-0056 v0.1.2 (Draft) | temporary copy | fresh vault CDVJFS5FKB6FF5GDF3YSHBPX2T2NGURG7WN6RXXRAEL7D2LSAHEA6CTB (decimals\_offset=0): unauthorized withdraw (no approval) correctly rejected; after owner approved operator for 1000000 shares, operator withdrew 500000 shares (allowance 1000000 -\> 500000, decremented exactly); operator's over-allowance withdraw attempt of 1500000 assets (requiring more shares than the remaining 500000-share allowance) correctly rejected with allowance left untouched at 500000 |

_Timestamps are recorded by the CLI when the run starts and when it finishes._
