# SOW 2, D2: vault with a custom-token underlying asset (results)

Date: 2026-11-16. Network: **Testnet only**. Vault: Blind
`CCW5GTIFMGRPURESMVVFDFRQHX5ZBW3BTDKVPFNV2KFWY6Q7MVZLHGV7`, asset
`CCNIPWVKCN225GVSFC77LBI6Y4TZLQRR3LUTS7JLGBXED3Y2PMDI6SSG` (stellar-tokens
0.7.2, not a Stellar Asset Contract, 7 decimals, `decimals_offset = 3`).
Design: `docs/sow2/design-custom-token.md`.

**TERBUKTI** = run on Testnet in this work. **BELUM** = not run.

## 1. What changed in the CLI

When a call that moves tokens (`deposit`, `mint`, or `transfer` on the asset)
fails with `Error(Contract, #N)` and the text rules did not classify it, the
CLI now reads the paying account's `balance` of the underlying asset (read-only).
If the balance is below the amount the call needed, the row is INCONCLUSIVE with
`reason_code` and `reason.code` = `insufficient_token_balance`, and its `detail`
gains one sentence: `The account holds X of the underlying asset and needs Y.`
If the balance cannot be read, or is enough, nothing changes. `detail` of every
other row is unchanged. Status and exit code are unchanged.

## 2. Blind with no balance: before and after the change

Same starting state for both runs: `alice`, `bob`, `dave`, `erin` hold 0 of the
token, `grace` holds about 110,214,000. **TERBUKTI**

| Check | Before (`dev-sow2`) | After (this change) |
|---|---|---|
| `total_assets`, `withdraw`, `redeem`, `convert_to_shares`, `convert_to_assets` | PASS | PASS |
| `deposit` (`alice`) | INCONCLUSIVE `unclassified_error` | INCONCLUSIVE `insufficient_token_balance`, holds 0, needs 5,000,000 |
| `mint` (`alice`) | INCONCLUSIVE `unclassified_error` | INCONCLUSIVE `insufficient_token_balance`, holds 0, needs 3,000 |
| `donation_attack` (victim `bob`) | INCONCLUSIVE `unclassified_error` | INCONCLUSIVE `insufficient_token_balance`, holds 0, needs 5,000,000 |
| `overflow_protection` | PASS | PASS |
| `rounding_direction` (`dave`) | INCONCLUSIVE `unclassified_error` | INCONCLUSIVE `insufficient_token_balance`, holds 0, needs 1,000 |
| `access_control_probing` (`erin`) | INCONCLUSIVE `unclassified_error` | INCONCLUSIVE `insufficient_token_balance`, holds 0, needs 10,000,000 |
| Exit code | 3 | 3 |

Also seen after the change, with `grace` at 10,214,377 and the others at 0:
`donation_attack` INCONCLUSIVE `insufficient_token_balance` on the donation
`transfer`. **TERBUKTI**

Note: `withdraw` and `redeem` pay tokens to `alice`, so a second run starts with
`alice` no longer at 0. `alice` was emptied again before each run.

## 3. Which checks run, and which cannot without a token balance

| # | Check | Account | Balance needed per run | Runs with balance | Short balance |
|---|---|---|---|---|---|
| 1 | `total_assets` | `alice` | 0 | yes | runs (read only) |
| 2 | `deposit` | `alice` | 5,000,000 | yes | cannot run: INCONCLUSIVE |
| 3 | `mint` | `alice` | 3,000 | yes | cannot run: INCONCLUSIVE |
| 4 | `withdraw` | `alice` | 0 tokens, needs shares | yes | runs while `alice` holds shares |
| 5 | `redeem` | `alice` | 0 tokens, needs shares | yes | runs while `alice` holds shares |
| 6 | `convert_to_shares` | `alice` | 0 | yes | runs (read only) |
| 7 | `convert_to_assets` | `alice` | 0 | yes | runs (read only) |
| 8 | `donation_attack` | `grace`, `bob` | `grace` 100,000,001 at the start (49,976,180 used); `bob` 5,000,000 | yes | cannot run: INCONCLUSIVE |
| 9 | `overflow_protection` | `carol` | 0 | yes | runs, see limits |
| 10 | `rounding_direction` | `dave` | 1,601 | yes | cannot run: INCONCLUSIVE |
| 11 | `access_control_probing` | `erin`, `frank` | `erin` 10,000,000; `frank` 0 | yes | cannot run: INCONCLUSIVE |

"Cannot run" is **TERBUKTI** for rows 2, 3, 8, 10 and 11 (section 2). "Runs" for
rows 1, 4–7 and 9 is shown by the "before" column of section 2 (PASS with the
accounts at 0). Balances were measured over two funded runs: `dave` 110,000 →
108,399 → 106,798; `bob` and `erin` spend all of theirs; `grace` 160,000,001 →
110,023,821 → 60,047,641; `alice` net 3,002,000.

## 4. Limits, as they are

- **`overflow_protection` on a custom token at `decimals_offset = 0`.** The
  check calls `deposit(i128::MAX)` and counts any failure as a clean rejection.
  With a custom token at offset 0 that failure is an ordinary short balance on
  the depositor, not the vault's own overflow protection. The row is PASS with
  the text `NOTE: this does not test the vault's own overflow protection.` No
  fixture has a custom token at offset 0 (Blind has offset 3, where the vault's
  own math overflows first). **BELUM** run on such a vault.
- **`donation_attack` on Blind.** It is a FAIL on Blind (the reference
  finding). So the case "custom token and a vault that resists the donation" has
  no fixture; Positive Control resists it but uses native XLM.
- **One token library.** The balance read does not depend on an error code, but
  only stellar-tokens 0.7.2 was run. A token whose `balance` argument is named
  neither `account` nor `id` is **BELUM**.
- **Native XLM.** The older rule for the native asset (a negative resulting
  balance in the failed transfer) is kept as a fallback and is **BELUM** seen to
  match in a real run. A Testnet XLM account cannot be drained to try it.
- Not tried: tokens with other than 7 decimals, classic assets with trustlines.

## 5. Regression, 9 fixtures

`scripts/regress-testnet.sh --before <dev-sow2 build> --after <this build>`,
each fixture run with both binaries, `--output json`. Compared per row: name,
status, `reason_code`, `reason`, keys, and `detail` / `raw_error` with numbers and
addresses masked. **TERBUKTI**

| Fixture | Before | After | Same? |
|---|---|---|---|
| Reference | 10 PASS, 1 FAIL, exit 1 | same | Yes |
| Demo | 10 PASS, 1 FAIL, exit 1 | same | Yes |
| Vault A | 10 PASS, 1 FAIL, exit 1 | same | Yes |
| Vault B | 9 PASS, 2 FAIL, exit 1 | same | Yes |
| Hardened | 10 PASS, 1 FAIL, exit 1 | same | Yes |
| Blind (funded) | 10 PASS, 1 FAIL, exit 1 | same | Yes |
| Positive Control | 11 PASS, exit 0 | same | Yes |
| Reverting Max | 6 PASS, 1 FAIL, 4 INCONCLUSIVE `unclassified_error`, exit 1 | same | Yes |
| SEP-41 Names | 11 PASS, exit 0 | same | Yes |

Reverting Max stays `unclassified_error` on its four rows: `alice` holds enough
XLM, so the balance read finds no shortfall.
