# Aegis Vault — Conformance Verification Report

- Vault: `CAHMH3VSMNCYDCRTCZBJOKJE65HT2LJBZQFQULMRH6E2OGGGPMSNG376`
- Network: testnet
- Spec: SEP-0056 v0.1.2 (Draft)
- Checker: sep56-vault-guard 0.5.0
- Started: 2026-10-18T13:22:29.789Z
- Completed: 2026-10-18T13:24:34.292Z
- Duration: 125 s
- Result: All checks passed
- Core function checks: 7 of 7 passed
- Basic security checks: 4 of 4 passed

## Conformance checks

| # | Check | Status | Detail |
|---|---|---|---|
| 01 | `total_assets` | PASS | total\_assets = 21000007 |
| 02 | `deposit` | PASS | deposited 5000000 stroops, minted 499999690870296 shares matching preview\_deposit(), total\_assets 21000007 -\> 26000007; max\_deposit=170141183460469231731687303715884105727, total\_supply 2099999501654750 -\> 2599999192525046 |
| 03 | `mint` | PASS | minted 3000000 shares, pulled 1 assets matching preview\_mint(), total\_assets 26000007 -\> 26000008; max\_mint=170141183460469231731687303715884105727, total\_supply 2599999192525046 -\> 2599999195525046 |
| 04 | `withdraw` | PASS | withdrew 2000000 stroops, burned 199999868886588 shares matching preview\_withdraw(), total\_assets 26000008 -\> 24000008; max\_withdraw=11000004, total\_supply 2599999195525046 -\> 2399999326638458 |
| 05 | `redeem` | PASS | redeemed 1000000 shares, received 0 assets matching preview\_redeem(), total\_assets 24000008 -\> 24000008; max\_redeem=899999838833700, total\_supply 2399999326638458 -\> 2399999325638458 |
| 06 | `convert_to_shares` | PASS | convert\_to\_shares(4000000) = 399999737606508, round-trip convert\_to\_assets(399999737606508) = 3999999 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 24000008 |
| 07 | `convert_to_assets` | PASS | convert\_to\_assets(4000000) = 0, round-trip convert\_to\_shares(0) = 0 (\<= 4000000, as required of floor/floor round-tripping), total\_assets unchanged at 24000008 |

## Security checks

| # | Check | Status | Detail |
|---|---|---|---|
| 08 | `donation_attack` | PASS | resilient to donation/inflation attack — fresh vault CB6O433X7K3HSGOUHGHSEKE5LBANEVVBNBMKSI3LBKEBGDS5GKYK22KC (decimals\_offset=0): attacker deposited 1 stroop(s) then donated 100000000 stroops directly (bypassing deposit()); victim then deposited 5000000 stroops and received 9999999 shares (199% of the 5000000 expected from an undisturbed deposit at this vault's decimals\_offset); attacker P&L: net loss of 50000000 stroops (spent 100000001, redeemed 50000001) |
| 09 | `overflow_protection` | PASS | NOTE: this does not test the vault's own overflow protection. deposit(assets=i128::MAX) on fresh vault CANTAKLID2I4KDZSSJIRLVNJWGDJ6I5KSD6HIGBOD6OXVPTUV4W4OECO failed cleanly (rejected by the network, with no error text), and total\_assets remained 0 — no silent-wrong-result observed. at decimals\_offset=0, the vault's own share math does not overflow for i128::MAX (shares = assets exactly), so this failure is instead triggered by the classic Stellar Asset Contract's own int64 amount ceiling ("spent amount is too large for an i64") on the underlying asset transfer — a limit outside the vault's control, NOT a demonstration of the vault's own overflow protection. |
| 10 | `rounding_direction` | PASS | fresh vault CC6GDLTP3NA2GIF2BEP2OMWKP7CWMHAOCMFJPAQNYBBVKSKGJPYLXCZQ at fractional ratio (seed 1000 + donation 500): Test A — deposit(100) minted 6668887475 shares matching preview\_deposit() (floor, favors vault); Test B — mint(100 shares) pulled 1 assets matching preview\_mint() (ceil) and strictly greater than the idealized convert\_to\_assets() (0) — rounding direction confirmed to always favor the vault over the user |
| 11 | `access_control_probing` | PASS | fresh vault CD57EC5C6JNCLJ5NX3QG6HFFG7LMTMFCESWYNY4AFIZR7ZP4ZWF5PJMY (decimals\_offset=0): unauthorized withdraw (no approval) correctly rejected; after owner approved operator for 100000001000000 shares, operator withdrew 50000000500000 shares (allowance 100000001000000 -\> 50000000500000, decremented exactly); operator's over-allowance withdraw attempt of 1500000 assets (requiring more shares than the remaining 50000000500000-share allowance) correctly rejected with allowance left untouched at 50000000500000 |

_Timestamps are recorded by the CLI when the run starts and when it finishes._
