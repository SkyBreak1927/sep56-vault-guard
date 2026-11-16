# SOW 2, D2: vault with a custom-token underlying asset (design)

Status: **design only, no code changed.** Date: 2026-11-16. Branch
`sow2/custom-token-vault`, from `dev-sow2` at `2f07b61`. Network: **Testnet
only**. Context: `docs/sow2/changelog.md`, `handoff.md`,
`design-report-schema.md`, `feasibility.md`.

**TERBUKTI** = read in the code at this commit, or run in this session.
**BELUM** = inferred, or not run end to end.

Everything run for this document was read-only: `query_asset`, `decimals`,
`balance`, `contract info hash`, and `deposit` / `transfer` calls from an
account with no tokens, which fail at simulation (`--send=no` or rejected
before submit). No token was minted, no state of any vault changed.

## 1. Which fixture already uses a custom token

I read `query_asset` on all 9 fixtures and compared it with
`stellar contract id asset --asset native --network testnet`
(`CDLZFC3S…GYSC`). **TERBUKTI**

| Fixture | Underlying asset |
|---|---|
| Reference, Demo, Vault A, Vault B, Hardened, Positive Control, SEP-41 Names, Reverting Max | native XLM |
| **Blind** `CCW5GTIF…HGV7` | **custom**: `CCNIPWVK…6SSG` |

So **Blind is the only custom-token fixture.** Facts about it:

- The asset has Wasm of its own (hash `6e1d1def…3ac7`), so it is not a Stellar
  Asset Contract. **TERBUKTI**
- Asset `decimals` = 7, vault `decimals` = 10, so `decimals_offset` = 3.
  **TERBUKTI**
- The asset is `contracts/blind-asset`: stellar-tokens, an admin-gated
  `mint()`, no cap. The vault is an unmodified reference-vault clone.
  **TERBUKTI** (source read); the admin being `alice` is from the changelog
  (read from instance storage), not re-read here.
- Today's balances of the Blind token **TERBUKTI**: `alice` 84,023,640,
  `bob` 0, `carol` 10,000,000, `dave` 80,788, `erin` 0, `frank` 6,000,000,
  `grace` 110,214,379. So `bob` and `erin` need a top-up before a funded run.

**Is Blind enough?** Recommendation: **yes for D2, no new fixture now.**

- It is a real, non-SAC custom token on a deployed vault, with a recorded
  baseline (10 PASS, 1 FAIL, exit 1) and regression history.
- It is the only way to see a real "account holds none of the asset" case;
  `feasibility.md` Part A could not (native XLM cannot be at 0 on an existing
  account).
- What it does **not** cover (limits to state in the D2 write-up):
  1. `overflow_protection` at `decimals_offset = 3` fails in the vault's own
     math before any transfer, so Blind does not exercise the
     "custom token at offset 0" path (section 2, row 9). No fixture does.
  2. Only one token library (stellar-tokens 0.7.2) is present, so error
     codes are proven for that library only (section 3.2).
  3. `donation_attack` is a FAIL on Blind, so the "custom token and a
     resilient vault" combination is not covered. The Positive Control is
     native.
- Adding a second fixture (custom token, offset 0) would close limit 1 at
  the cost of a deploy plus another entry in the regression table. See
  decision D1.

## 2. The 11 checks and the token balance each needs

Accounts come from `cli/src/main.rs` (`SOURCE_ACCOUNT`, `VICTIM_ACCOUNT`,
`DONATION_ATTACKER_ACCOUNT` and the others) and amounts from the constants in
`cli/src/checks/mod.rs`. "Short" means the account holds less than the amount.

"Today" is what the **current** `dev-sow2` build gives. Rows marked
**TERBUKTI run** were seen in a real run in `changelog.md` (Blind, 2026-11-16).
Rows marked **code** follow from the same code path; no end-to-end run.

| # | Check | Account | Token needed (Blind, offset 3) | Result today when short |
|---|---|---|---|---|
| 1 | `total_assets` | `alice` | 0 (read) | Not balance-dependent. |
| 2 | `deposit` | `alice` | `5,000,000` (`DEPOSIT_AMOUNT`) | INCONCLUSIVE `unclassified_error`. **code** |
| 3 | `mint` | `alice` | `preview_mint(3,000,000 shares)`, about `3,000` here | INCONCLUSIVE `unclassified_error`. **code** |
| 4 | `withdraw` | `alice` | 0 tokens; needs shares from check 2 or 3 | Not a token shortage. A missing-shares error is a vault error (`#407` seen in `feasibility.md` row 6). |
| 5 | `redeem` | `alice` | 0 tokens; needs shares | Same as 4. |
| 6 | `convert_to_shares` | `alice` | 0 (read) | Not balance-dependent. |
| 7 | `convert_to_assets` | `alice` | 0 (read) | Not balance-dependent. |
| 8 | `donation_attack` | `grace` (attacker), `bob` (victim) | `grace` ≥ `100,000,001` (1 dust deposit + 100,000,000 donation); one run keeps about half back (changelog: about 49,976,180 used). `bob` `5,000,000`, all used. | `grace` short at the donation `transfer`: INCONCLUSIVE `unclassified_error`. **TERBUKTI run** (changelog: `Error(Contract, #100)` on `transfer`, exit 3). `bob` short at the victim deposit: same path. **code** |
| 9 | `overflow_protection` | `carol` | 0. `deposit(i128::MAX)` is built to fail. | **Never INCONCLUSIVE for a balance.** It calls `invoke_contract` directly, so any failure counts as "rejected" and the check PASSes. At offset ≥ 1 the vault's own math overflows first. At offset 0 with a custom token it PASSes with `NOTE: this does not test the vault's own overflow protection`. **code** |
| 10 | `rounding_direction` | `dave` | about `1,601` (seed 1,000 + donation 500 + deposit 100 + mint of 100 shares, rounded up). Derived from the constants, not measured. | INCONCLUSIVE `unclassified_error`. **code** |
| 11 | `access_control_probing` | `erin` (owner), `frank` (operator) | `erin` `10,000,000` (seed deposit), all used. `frank` 0 (only receives). | `erin` short at the seed deposit: INCONCLUSIVE `unclassified_error`. **TERBUKTI run** (changelog: `Error(Contract, #100)` on `deposit`). The two "must fail" steps use `invoke_contract`, so a failure there is read as the expected rejection, never as a shortage. |

Accounts that need the token: **`alice`, `bob`, `dave`, `erin`, `grace`**.
`carol` and `frank` need none. This matches the table in
`web/src/docs/pages/custom-token.ts`. Only `alice`, `bob`, `erin` and `grace`
amounts are backed by runs; `dave`'s is derived from code.

Two consequences of a shortage:

- The status is already right (INCONCLUSIVE, never FAIL), because every
  token-moving step goes through `invoke_checked`. Only the **reason code** is
  wrong.
- The exit code follows the status. With `donation_attack` INCONCLUSIVE and no
  FAIL, the run exits **3**, not 1 (changelog: 9 PASS, 2 INCONCLUSIVE, exit 3).

## 3. Why a short balance is `unclassified_error`, and a fix

### 3.1 Cause (TERBUKTI)

The changelog marked this as inferred. I reproduced the whole chain on Blind
with `erin` (balance 0):

1. The checker's call is `stellar contract invoke … --quiet`. It fails, and
   **stderr is empty** (reproduced: exit 1, empty stderr).
2. Because stderr is empty, `diagnose_invoke` repeats the call without
   `--quiet` and with `--send=no` (`rpc.rs`, `diagnose_with`). In Stellar CLI
   28.0.0 the repeat prints **one line only**:
   `error: transaction simulation failed: HostError: Error(Contract, #100)`.
   The same one line comes from a direct `transfer` on the token (reproduced).
3. `classify_error_text` only returns `InsufficientTokenBalance` when the text
   also contains `["contract call failed", transfer,` (`failed_transfer`,
   `rpc.rs:392`). Those events are **not** in the default output. With
   `--verbose` they are printed, but as base64 XDR (`DEBUG
   soroban_cli::log::event: 0: AAAA…`), not as the decoded text the rule
   searches for. The text-form fixture `A_TOKEN_BALANCE_ZERO` in `rpc.rs`
   (decoded `[Diagnostic Event] … topics:[error, Error(Contract, #100)]`) is
   not what 28.0.0 prints by default. Which CLI or flag produced it: BELUM.
4. So the rule never matches and the result is `Unclassified`. A unit test
   pins exactly this single-line text as `Unclassified`
   (`rpc.rs`, "#100 and simulation failed without a failed transfer around
   it").

The native-XLM rule (`resulting balance is not within the allowed range`) has
the same dependency on event text. `feasibility.md` row A3 shows the same single
line (`Error(Contract, #10)`), so it probably never matches in a real run
either. End to end: BELUM. It cannot be reproduced on Testnet without
draining an XLM account.

### 3.2 Token error codes that are proven

| Code | Meaning | Evidence |
|---|---|---|
| `#100` | `FungibleTokenError::InsufficientBalance` | Source: `stellar-tokens-0.7.2/src/fungible/mod.rs:284`. On-chain: `erin` (0 tokens) gets `#100` from `transfer` on the Blind token and from `deposit` on the Blind vault. **TERBUKTI**, for stellar-tokens 0.7.2 only. |
| `#101` | `InsufficientAllowance` | same source. Not a balance problem. |
| `#103` | `LessThanZero` | same source. Not a balance problem. |
| `#10` (native SAC) | probably "balance not in allowed range" | Only in the repo fixture and `feasibility.md` A3. Not re-derived: **BELUM**. |

Trap: the vault is itself a `FungibleToken`, so it can return its own `#100`
for **shares**. A bare `#100` therefore does not say which balance is short.
That is why the old rule also asked for a failed `transfer`.

### 3.3 Options

- **C1 (recommended): confirm with a balance read.** When a token-moving
  call fails and the repeat gives `Error(Contract, #N)`:
  1. find the underlying asset (`query_asset` on the vault, or the contract
     itself when the failed call was a `transfer` on the asset);
  2. read `balance` of the paying account on that asset (`--send=no`, read-only);
  3. if `balance < needed`, class `InsufficientTokenBalance`. `needed` is
     `--assets` for `deposit`, `preview_mint` for `mint`, `--amount` for a
     `transfer`.
  If any step cannot be done (no `balance`, other argument names, a read
  fails) the result stays `Unclassified`. Never a guess.
  - Library-independent: no table of error codes.
  - The balance and the needed amount go into the detail.
  - Costs 2 to 3 reads, only on a failure.
  - Risk: the argument name of `balance` differs between tokens. I saw `--id`
    rejected and `--account` accepted on the Blind token. The SEP-41 name is
    `id`. It needs the same "read the name from the spec" step as
    `approve`/`allowance` (#58), or a try of both.
- **C2: decode the `--verbose` events.** Repeat with `--verbose`, decode each
  event with `stellar xdr decode`, and restore the old rule on the decoded
  text. Keeps the code-number dependency, needs one decode per event, and
  depends on the CLI's log format. Not recommended.
- **C3: a rule on code and function.** `Error(Contract, #100)` from `deposit`,
  `mint` or an asset `transfer` means insufficient balance. Cheap, no extra
  call, but correct only for stellar-tokens and not checked against any other
  library. Not recommended as the main fix. Acceptable only as a
  fallback if C1 cannot read the balance.

### 3.4 Result shape after the fix

- Status **INCONCLUSIVE**, never FAIL. `reason_code` =
  `insufficient_token_balance`, and `reason.code` the same (PR #59 copies it).
- `reason.message` already exists (`labels.rs`: "A test account holds too
  little of the vault's underlying asset. Fund it and run again. Not a finding
  about the vault."). **No label change.**
- The detail lead in `verdict` (`checks/mod.rs`) already says to fund the
  account. Under C1 it can add "holds X, needs Y".
- Exit codes follow the status and do not change: 3 if no FAIL, 1 if any FAIL.
- Where to implement (not built): the failure path of `invoke_checked`, which
  has the function, arguments, account and contract. The class
  `ErrorClass::InsufficientTokenBalance` and its reason code already exist.
- Unit tests: a single-line `#100` with a short balance becomes
  `InsufficientTokenBalance`; the same text with enough balance stays
  `Unclassified`; a balance read that fails stays `Unclassified`; the existing
  test pinned to the single line is changed on purpose.
- Docs, after the fix (web text, needs your go-ahead):
  `web/src/docs/pages/custom-token.ts` says `insufficient_token_balance` and
  exit `3` for a short account. That is not what the CLI does today. It also
  carries a caveat about `donation_attack` and `unclassified_error` to remove.

## 4. Effect on the 9-fixture regression

### 4.1 Must stay identical

For every fixture, with the accounts funded: each row's `name`, `status`,
`reason_code`, `reason`, and the exit code, as in the table in `CLAUDE.md`.
Expected: Reference, Demo, Vault A, Hardened, Blind 10 PASS + 1 FAIL (exit 1);
Vault B 9 PASS + 2 FAIL; Positive Control and SEP-41 Names 11 PASS (exit 0).

- **Reverting Max**: 6 PASS, 1 FAIL, 4 INCONCLUSIVE `unclassified_error`
  (`deposit`, `mint`, `withdraw`, `redeem`), exit 1, **must not move to
  `insufficient_token_balance`**. These are not balance failures. Under C1
  this holds because `alice` holds plenty of XLM, so the read would show a
  sufficient balance. Make it an explicit assertion.
- The 8 native fixtures cannot hit the new path. XLM accounts are not short.

### 4.2 Allowed to change

- Only a row that is INCONCLUSIVE because a token balance is short:
  `reason_code` and `reason.code` from `unclassified_error` to
  `insufficient_token_balance`, and `detail` (balance and needed amount).
  `status` and exit code stay the same.
- Only Blind with a short account can show it. It needs a new test:
  **unfunded Blind** (`bob` and `erin` at 0, as they are today).
  - Before the fix (expected, from the changelog): 9 PASS, 2 INCONCLUSIVE
    `unclassified_error` (`donation_attack`, `access_control_probing`), exit 3.
  - After the fix: same, with `insufficient_token_balance` on both.
- Unit tests in `rpc.rs` and `checks/mod.rs` that pin the old single-line
  behavior.

### 4.3 Automating the Blind top-up

There is no regression script in the repo. `git ls-files` shows only
`docker-entrypoint.sh`. The regressions in `changelog.md` were run by hand, and
the top-up is the manual `mint` in `handoff.md` §4. So the plan is a new script,
not a change to one.

Proposal (not built):

- `scripts/regress-testnet.sh`, run with Git Bash (WSL is not used on this PC).
  Testnet is hard-coded; there is no network option.
- Input: the fixture table (name, address, expected PASS/FAIL/INCONCLUSIVE
  counts, exit code), plus `--before <binary>` and `--after <binary>`.
- Per row compare `name`, `status`, `reason_code`, exit code, and the added
  keys, as in the earlier regressions.
- **Blind top-up**, before each Blind run:
  1. read each account's balance with `balance --account <G>` on
     `CCNIPWVK…6SSG`, using the address from `stellar keys address <name>`;
  2. compare with a per-run need: `alice` 5,003,000, `bob` 5,000,000, `dave`
     1,601, `erin` 10,000,000, `grace` 100,000,001;
  3. mint only the shortfall, times the number of runs left (2 for a
     before/after pair), plus a margin, from the admin `alice`;
  4. cap one mint (for example 500,000,000) and stop if a `mint` fails;
  5. print balances before and after, and the tx hashes, for the changelog.
- Idempotent: a funded account gets nothing.
- `--no-topup` for the unfunded-Blind scenario, so the negative control can be
  run on purpose.
- It prints only identity names and public addresses. It never reads or prints
  a key. It writes nothing into the repo except its report (outside the tree or
  ignored).
- Not done by the script: any other contract, any Mainnet call.

## 5. Decisions for you

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Fixture for the custom-token vault | (a) Blind only. (b) Blind plus a new fixture with a custom token at `decimals_offset = 0`. (c) Blind plus a non-stellar-tokens token. | **(a).** It is enough for D2. Record the three limits of section 1 in the write-up. Choose (b) only if you want `overflow_protection` on a custom token at offset 0 seen in a run. |
| D2 | Classification method | C1 balance read. C2 decode `--verbose`. C3 rule on code and function. | **C1**, with C3 only as the fallback when the balance cannot be read. |
| D3 | Which calls the balance read applies to | (a) token-moving calls only: `deposit`, `mint`, asset `transfer`. (b) every failed invoke. | **(a).** It keeps Reverting Max's four `unclassified_error` rows as they are. |
| D4 | Detail text | Add "holds X, needs Y". Or keep the current text. | **Add it.** Only `detail` of the affected INCONCLUSIVE rows changes; `raw_error` is the same. |
| D5 | Native XLM short-balance rule | Keep the existing rule as a fallback, or drop it. | **Keep it** as a fallback, and let C1 cover native too. End to end it stays BELUM. Say so in the changelog. |
| D6 | Where the fix lives | A new branch `sow2/custom-token-classification` after this design is accepted. Or in this branch. | **New branch.** One branch per task; this one stays a document. |
| D7 | Regression script | (a) `scripts/regress-testnet.sh` in the repo. (b) PowerShell. (c) local only, not committed. | **(a)**, Git Bash, as in section 4.3. |
| D8 | Top-up policy | (a) The script mints the shortfall by itself, capped. (b) The script prints the `mint` commands and waits for you. | **(a)** for the Blind token only. It is a test token with no value, and the same step has been done by hand. |
| D9 | `overflow_protection` PASS on a custom token at offset 0 | Leave the logic and the `NOTE` text. Or change the result. | **Leave it.** The rule is not to change the result logic of the 11 checks. Document it as a limit. |
| D10 | Web docs (`custom-token.ts`, `output.ts`) | Update their text in the fix PR. Or leave the web untouched. | **Update the text only**, in the fix PR, with your go-ahead. |
| D11 | D2's "which checks run, which cannot" record | (a) A table in a new `docs/sow2/custom-token-results.md`, from a funded and an unfunded Blind run. (b) A section in `VAULT_CHECKS.md`. | **(a)**, linked from `changelog.md`. |

Order of work, if accepted: D6 branch, then the fix and unit tests, then the
script, then the regression (9 fixtures funded, plus unfunded Blind before and
after), then the docs.

## 6. Keputusan Pandebu 16 Nov

D1–D11 disetujui sesuai rekomendasi di bagian 5, dengan tambahan berikut.

| # | Keputusan | Tambahan |
|---|---|---|
| D1 | Fixture | Hanya Blind. |
| D2 | Metode | C1, baca saldo. |
| D3 | Cakupan | Hanya panggilan yang memindahkan token. |
| D4 | Detail | Teks `detail` **hanya** boleh berubah pada baris yang direklasifikasi ke `insufficient_token_balance`. Semua detail lain harus identik. |
| D5 | Aturan native `#10` | Dipertahankan sebagai cadangan, dan ditandai **BELUM terbukti** di dokumen. |
| D6 | Lokasi perbaikan | Branch `sow2/custom-token-classification`. |
| D7 | Skrip regresi | `scripts/regress-testnet.sh`. Hanya jalan di Testnet (abort bila bukan), hanya memakai nama identity (tanpa secret key atau seed di repo), idempoten, ada batas per mint, dan mencetak saldo sebelum dan sesudah. |
| D8 | Isi ulang | Otomatis, hanya token Blind, dari `alice`, dengan syarat D7. |
| D9 | `overflow_protection` | Batas "PASS kosong pada token kustom offset 0" dan batas `donation_attack` pada Blind ditulis apa adanya di `docs/sow2/custom-token-results.md`, siap dipakai di coverage matrix. Kata yang tidak dipakai: audit, sertifikasi, menjamin, kesesuaian penuh, 100% aman. |
| D10 | Docs web | Hanya teks di `web/src/docs/pages/`, tanpa komponen web lain. |
| D11 | Catatan hasil | `docs/sow2/custom-token-results.md`. |

Urutan: Langkah A (dokumen ini, PR ke `dev-sow2`), lalu Langkah B
(implementasi di `sow2/custom-token-classification`: ukur kebutuhan `dave`,
skenario Blind tanpa saldo sebelum perbaikan, C1 dan unit test, skrip,
skenario ulang, regresi 9 fixture, dokumen hasil, teks docs web, changelog).
