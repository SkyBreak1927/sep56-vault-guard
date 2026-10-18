# Aegis Vault — Conformance Verification Report

- Vault: `CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF`
- Network: testnet
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Started: 2026-10-18T13:24:47.232Z
- Completed: 2026-10-18T13:26:29.466Z
- Duration: 102 s
- Result: Remediation needed
- Core function checks: 7 of 7 passed
- Basic security checks: 3 of 4 passed

## Conformance checks

| # | Check | Status | Detail |
|---|---|---|---|
| 01 | `total_assets` | PASS | total\_assets = 502501000 |
| 02 | `deposit` | PASS | deposited 5000000 stroops, minted 5000000 shares matching preview\_deposit(), total\_assets 502501000 -\> 507501000; max\_deposit=170141183460469231731687303715884105727, total\_supply 502501000 -\> 507501000 |
| 03 | `mint` | PASS | minted 3000000 shares, pulled 3000000 assets matching preview\_mint(), total\_assets 507501000 -\> 510501000; max\_mint=170141183460469231731687303715884105727, total\_supply 507501000 -\> 510501000 |
| 04 | `withdraw` | PASS | withdrew 2000000 stroops, burned 2000000 shares matching preview\_withdraw(), total\_assets 510501000 -\> 508501000; max\_withdraw=385501000, total\_supply 510501000 -\> 508501000 |
| 05 | `redeem` | PASS | redeemed 1000000 shares, received 1000000 assets matching preview\_redeem(), total\_assets 508501000 -\> 507501000; max\_redeem=383501000, total\_supply 508501000 -\> 507501000 |
| 06 | `convert_to_shares` | PASS | convert\_to\_shares(4000000) = 4000000, round-trip convert\_to\_assets(4000000) = 4000000 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 507501000 |
| 07 | `convert_to_assets` | PASS | convert\_to\_assets(4000000) = 4000000, round-trip convert\_to\_shares(4000000) = 4000000 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 507501000 |

## Security checks

| # | Check | Status | Detail |
|---|---|---|---|
| 08 | `donation_attack` | FAIL | VULNERABLE to donation/inflation attack — fresh vault CBHAH75E7EO2TEIKZOXC6LEDINH6M62LSKOSBMD2NXBUEX5MFCIIC546 (decimals\_offset=0): attacker deposited 1 stroop(s) then donated 100000000 stroops directly (bypassing deposit()); victim then deposited 5000000 stroops and received 0 shares (0% of the 5000000 expected from an undisturbed deposit at this vault's decimals\_offset); attacker P&L: net loss of 47500000 stroops (spent 100000001, redeemed 52500001) |
| 09 | `overflow_protection` | PASS | NOTE: this does not test the vault's own overflow protection. deposit(assets=i128::MAX) on fresh vault CA3ZZUZB64BNM26YJSDKRQYA3FUU3SR3PLH52Q53WJDCABMUGIHUYZ4C failed cleanly (rejected by the network, with no error text), and total\_assets remained 0 — no silent-wrong-result observed. at decimals\_offset=0, the vault's own share math does not overflow for i128::MAX (shares = assets exactly), so this failure is instead triggered by the classic Stellar Asset Contract's own int64 amount ceiling ("spent amount is too large for an i64") on the underlying asset transfer — a limit outside the vault's control, NOT a demonstration of the vault's own overflow protection. |
| 10 | `rounding_direction` | PASS | fresh vault CA76DC4JYN4Y6GCYGAWAPU6QLDG2A4Y2ZTTATL3WE4XAHGSDDDDOKARV at fractional ratio (seed 1000 + donation 500): Test A — deposit(100) minted 66 shares matching preview\_deposit() (floor, favors vault); Test B — mint(100 shares) pulled 151 assets matching preview\_mint() (ceil) and strictly greater than the idealized convert\_to\_assets() (150) — rounding direction confirmed to always favor the vault over the user |
| 11 | `access_control_probing` | PASS | fresh vault CCS6YJJHAPEZTR3WI3XFNIUTLF6EGTUKQC43CYJ3KLFT4U2CV6XH72P7 (decimals\_offset=0): unauthorized withdraw (no approval) correctly rejected; after owner approved operator for 1000000 shares, operator withdrew 500000 shares (allowance 1000000 -\> 500000, decremented exactly); operator's over-allowance withdraw attempt of 1500000 assets (requiring more shares than the remaining 500000-share allowance) correctly rejected with allowance left untouched at 500000 |

_Timestamps are recorded by the CLI when the run starts and when it finishes._
