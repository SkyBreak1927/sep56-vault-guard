# SOW 2, Deliverable 2: detecting an unsupported interface at the start of a run (design)

Status: **design only, no code changed.** Date: 2026-11-16. Branch
`sow2/unsupported-interface`, from `dev-sow2` at `3f8c7d2`.

**TERBUKTI** = read in the code at that commit, or run in this session
(read-only, Testnet). **BELUM** = inferred, or not run yet.

## 1. How it works today

### 1.1 A missing function: FAIL in conformance, NOT_APPLICABLE in security

1. Every contract call goes through `invoke_checked`
   (`cli/src/checks/mod.rs:237`). On error it runs `diagnose_invoke`
   (`cli/src/rpc.rs:491`), which classifies the `stellar` error text.
   **TERBUKTI**
2. A function the contract does not have makes `stellar` print
   `error: unrecognized subcommand '<fn>'`. `classify_error_text` maps that
   text to `ErrorClass::NotAStandardVault` (`cli/src/rpc.rs:349`).
   **TERBUKTI**
3. `verdict` (`cli/src/checks/mod.rs:155`) then decides the status by who
   asked for the function, using the `na_if_missing` flag:
   - `na_if_missing: true` is set only for functions that are not SEP-56
     but that the tool needs: `query_asset` on the vault and `decimals` on
     the underlying asset, both inside `resolve_target_vault`
     (`mod.rs:1944`, `mod.rs:1977`). The result is
     `Stop::NotApplicable { reason: "not_a_standard_vault" }`
     (`mod.rs:182`). **TERBUKTI**
   - Every SEP-56 function (`total_assets`, `max_*`, `preview_*`,
     `deposit`, …) is called with `na_if_missing: false`. `verdict` returns
     `None` for that case (`mod.rs:190`), so `invoke_checked` keeps the
     original error as `Stop::Fail` (`mod.rs:249`). **TERBUKTI**
4. All 4 security checks call `resolve_target_vault` before anything else,
   so a missing `query_asset` makes all 4 NOT_APPLICABLE. The 7 conformance
   checks call the SEP-56 functions directly, so each one FAILs at the first
   missing function. **TERBUKTI**
5. The two non-SEP-56 contracts from the completion report match this
   (CLI 0.5.0, runs by their builders):
   - Celengan: 0 passed, 7 failed, 4 not applicable.
   - StellarBin: 1 passed (`total_assets`), 6 failed, 4 not applicable.

   **TERBUKTI** as recorded in `COMPLETION_REPORT.md` 3.2 (L16–L19). Not
   re-run in this session.
6. A function that exists with different argument names is a different
   case. `stellar` then prints `unexpected argument '--assets'`. For an
   `invoke`, no rule matches that text, so it becomes `Unclassified`, which
   means INCONCLUSIVE `unclassified_error`, not FAIL. StellarBin does not
   reach this case, because `max_deposit` is missing first. **BELUM** (from
   reading the code only)

The FAIL detail also carries the raw `stellar` text: the usage line, plus the
test-account name in an INCONCLUSIVE detail (`Raw error: …`,
`mod.rs:214`). This is the "raw error" the testers asked to move into its
own field. **TERBUKTI**

### 1.2 Where "Remediation needed" comes from

The same rule is written in two places, and the two must stay in step:

- CLI Markdown: `summary_title` (`cli/src/markdown.rs:105`) prints
  `Remediation needed` whenever at least one result is FAIL.
- Web report: `summaryTitle` (`web/src/lib/report.ts:16`) prints it on
  fail or warn. **TERBUKTI**

For Celengan and StellarBin, the 7 or 6 FAILs come only from missing
functions, so the report says "Remediation needed" about a contract that
never claimed to be SEP-56. Text output and JSON have no headline: JSON
consumers derive one themselves from the statuses.

### 1.3 Exit code and readers

- `exit_code` (`cli/src/main.rs:127`): 1 if anything failed, else 3 if
  anything was inconclusive, else 0. NOT_APPLICABLE does not count. Exit 2
  is only for preflight. Celengan and StellarBin therefore exit 1 today.
  **TERBUKTI**
- Server (`server/index.js:268–310`) ignores the exit code:
  - If stdout is a JSON array, it is the `result`.
  - If stdout is an object, it is shown as an error made from
    `problem` + `fix` (the preflight shape).
  - Progress comes from the status file's `.checks` only. **TERBUKTI**
- Web:
  - `useCheckRun.ts:33` turns an unknown status string into `pending`,
    which never becomes final.
  - `legacyToChecks` (`useCheckRun.ts:50`) turns any status other than
    PASS / INCONCLUSIVE / NOT_APPLICABLE into `fail`.
  - So a **new status string would break the live web.** A new
    `reason_code` value would not. **TERBUKTI** (code reading)

## 2. Proposed design

### 2a. Probe at the start of a run

**Method.** Make one read-only call before any check:

```bash
stellar contract info interface --contract-id <vault> --network testnet --output json --quiet
```

It reads the contract spec (`SCSpecEntry`s) from the Wasm on the ledger:

- no source account
- no simulation
- no state change
- no transaction

Then compare each function's name, argument names and types, and output
type with what the checker calls. Argument names matter because the
checker calls by flag name (`--assets`, `--receiver`, …).

**Prototype result.** A throwaway script outside the repo (not repo code)
gave the following results on Testnet. **TERBUKTI**

| Contract | Missing | Mismatched |
|---|---|---|
| Reference, Demo, Vault A, Vault B, Hardened, Blind, Positive Control, Reverting Max (all 8 project fixtures) | none | none |
| Celengan `CCM6TNVN…RWD2O` | all 16 SEP-56 functions the checker calls, plus `query_asset`, `decimals` | `__constructor(owner, usdc, vault, blend_pool, …)` |
| StellarBin `CCDVBRMT…KU7VI` | `total_supply`, `convert_to_*`, `preview_*`, `max_*`, `mint`, `redeem`, `query_asset`, `decimals`, `__constructor` | `deposit(depositor, amount)`, `withdraw(caller, shares)` |
| Native XLM SAC (already stopped by preflight with exit 2) | most | `mint(to, amount)` |

So the probe gives no false "unsupported" on any vault that is supported
today.

**Function sets.**

| Set | Functions | If missing or mismatched |
|---|---|---|
| **Core (SEP-56, used by the 7 conformance checks)** | `total_assets`, `total_supply`, `convert_to_shares(assets)`, `convert_to_assets(shares)`, `preview_deposit(assets)`, `preview_mint(shares)`, `preview_withdraw(assets)`, `preview_redeem(shares)`, `max_deposit(receiver)`, `max_mint(receiver)`, `max_withdraw(owner)`, `max_redeem(owner)`, `deposit(assets, receiver, from, operator)`, `mint(shares, receiver, from, operator)`, `withdraw(assets, receiver, owner, operator)`, `redeem(shares, receiver, owner, operator)` | Unsupported interface (see 2b) |
| **Clone (not SEP-56, used by the 4 security checks)** | `query_asset`, `decimals`, `__constructor(name, symbol, asset, decimals_offset)` | Stays as today: those 4 checks become NOT_APPLICABLE, now known before they start |

`approve` and `allowance` (used by `access_control_probing`) are left out of
the probe for now. There is a separate tester item about their argument names
(`owner` / `live_until_ledger` vs SEP-41 `from` / `expiration_ledger`).
**BELUM**

**When the spec cannot be read** (the call fails, the spec is empty or
stripped, or the JSON cannot be parsed), the run falls back to exactly what
it does today, with a `[WARN]` on stderr. The probe must never be the reason
a supported vault stops running. **BELUM** (no such contract tried)

**Cost.** One extra `stellar` call, about 1–2 s. **BELUM** (not timed)

### 2b. Result when the interface is incomplete

Three options. Each one changes nothing for a vault whose core set is
complete.

| | **P — stop like a preflight** | **R — report, all checks skipped** | **R′ — report, run what is present** |
|---|---|---|---|
| What runs | Nothing | Nothing | Checks whose functions all exist (StellarBin: `total_assets`) |
| Output | Preflight-shaped object: `{error, code: "unsupported_interface", problem, fix, missing_functions, mismatched_functions}` | Normal 11-row array. Every row `NOT_APPLICABLE` with `reason_code: "unsupported_interface"` and a list of that check's missing functions | Array: present checks run as normal; the rest `NOT_APPLICABLE` / `unsupported_interface` |
| Status file | Not written (as for preflight today) | Written: all 11 settle at once. New top-level `interface` object | Written |
| Writes to target | None | None | Possible (a check with all its functions present runs for real) |
| "1 of 7 passed" problem | Gone | Gone | Remains for StellarBin |
| New status string | No | No | No |

The core set is all-or-nothing in P and R: one missing core function makes
the whole run unsupported. A per-check rule is R′.

**Recommendation: P.** It needs:

- no new status, no new exit code, and no change to the JSON array;
- no server change, because the server already shows `problem` + `fix`.

It also never invokes anything on a contract that is not SEP-56. R is the
choice if the per-check rows on the report page matter more than zero web or
server change.

### 2c. Exit code

The promise is: for a vault that is supported today, exit codes 0/1/2/3 do
not change. All three options keep that promise, because a supported vault
never reaches the new path (prototype: all 8 fixtures complete).
**TERBUKTI** for the fixtures.

| Option | Exit | Notes |
|---|---|---|
| **E2: reuse 2** | 2 | Fits P. Exit 2 already covers a target problem (`vault_not_a_contract`), so "2 = no check ran, see `code`" stays true. A consumer that already handles 2 gets the right meaning. |
| E1: keep 1 | 1 | Unsupported looks the same as a real finding. This is the confusion the testers reported. |
| E4: new code 4 | 4 | Needed for R or R′: with all-NOT_APPLICABLE rows the current rule gives 0, which would read as a pass. A new code means the docs must be updated (README, `web/src/docs/pages/output.ts`, `CLAUDE.md`). |

Do not combine exit 2 with an array: today exit 2 always means "the JSON is an
error object".

### 2d. JSON and Markdown

**JSON.** Only additive fields:

- **P:** the preflight object gains `missing_functions: string[]` and
  `mismatched_functions: [{name, found_args, expected_args}]`. Existing keys
  stay the same, and `error` stays `"preflight_failed"`.
- **R / R′:** each row may gain `missing_functions` (only on
  `unsupported_interface` rows). The array shape stays.
- **Structured reason and raw error (tester items).**
  - `reason_code` already is the structured reason.
  - Add `reason_code: "unsupported_interface"` to the documented list.
  - Add an optional `raw_error` field holding the `stellar` text that today
    is appended to `detail` as `Raw error: …`.
  - Step 1: write `raw_error` and leave `detail` unchanged.
  - Step 2, a separate decision: remove `Raw error: …` from `detail`. This
    changes the text of existing INCONCLUSIVE rows, but no status or exit
    code.

**Markdown** (`cli/src/markdown.rs`, kept in step with
`web/src/lib/report.ts`):

- **P:** `preflight_report` uses `- Result: Unsupported interface, no checks
  were run`. Its Problem section lists the missing and mismatched
  functions.
- **R:** new headline `Unsupported interface` (checked before the FAIL
  rule). The group lines read `Core function checks: not applicable
  (unsupported interface)`.
- **"Remediation needed" → "Review required":** this is a separate tester
  item. If it is wanted, change both places in one commit. It changes the
  headline text for supported vaults (not a status or exit code), so the
  sample reports in `docs/sample-reports/` must be regenerated.

**Text output:**

- **P:** `Unsupported interface: …` on stderr, then `No checks were run.`,
  as for preflight.
- **R:** rows `[NOT_APPLICABLE] … - unsupported interface: missing …`, and
  the summary line keeps its pattern (`, 11 not applicable`).

### 2e. Server and web

Rules that apply:

- Web and server are deployed from `main`.
- `server/` and `render.yaml` stay untouched until the Render dashboard
  values arrive (local rule).
- So the CLI change must be readable by the **current** server and web.

| | Server (`server/index.js`) | Live web (unchanged) | Web follow-up (optional, same PR) |
|---|---|---|---|
| **P** | No change. Object → `status: 'error'` with `problem` + `fix`. **TERBUKTI** (code reading) | Shows the error message, no report rows. Works today. | Optional: recognise `code: "unsupported_interface"` in the error and show the function list. That needs the server to pass `code` through, so it waits for the server rule. |
| **R** | No change. Array → `result`, status file → `checks`. Extra top-level status-file key ignored (`readStatusFile` reads `.checks` only). **TERBUKTI** (code reading) | All 11 rows "Not applicable", headline "No applicable checks". Correct but vague. | `summaryTitle`: `Unsupported interface` when every row has `reason_code` `unsupported_interface`. `StatusBadge`: unchanged. Add a vitest case. |
| **R′** | As R | As R, plus StellarBin shows 1 PASS | As R |

**Never introduce a new status string** (for example `UNSUPPORTED_INTERFACE`
as a status). The live web would leave such rows on `pending`, or count them
as `fail` in the fallback path (`useCheckRun.ts:33`, `:54`).

Docs to update with the code:

- `VAULT_CHECKS.md`
- `README.md`
- `web/src/docs/pages/output.ts` and `limitations.ts` (reason-code table,
  exit codes)
- `CLAUDE.md`: still lists exit codes 0/1/2 only; 3 is already missing.

## 3. How to test

The `Expected after` column below describes option P.

**Unit tests (no network)**

- Save the spec JSON of Reference, Celengan and StellarBin as fixtures and
  test the comparison function: complete → supported; Celengan → missing
  list; StellarBin → missing + mismatched (`deposit(depositor, amount)`).
- Unreadable or empty spec → fallback.
- Existing tests in `main.rs`, `markdown.rs`, `rpc.rs` and `preflight.rs`
  stay green.

**Testnet, before and after**

| Target | Before (CLI at `3f8c7d2`) | Expected after | Writes? |
|---|---|---|---|
| Celengan `CCM6TNVNYYFUYXDON5HAGWMBL6IWMWIOZJFUNEWDUAJAGSJE326RWD2O` | 0 pass, 7 fail, 4 NA, exit 1 (L16–L17) | exit 2, `code: unsupported_interface`, 18 missing + `__constructor` mismatched | None in either version (see note) |
| StellarBin `CCDVBRMT3BI65JV2C7AQJOSIGT76MNNTXSVYDKGXKPBSOKVWQRGKU7VI` | 1 pass, 6 fail, 4 NA, exit 1 (L18–L19) | exit 2, `deposit`/`withdraw` mismatched, 16 missing | None in either version |
| 7 fixtures in `CLAUDE.md` + Reverting Max Vault | As recorded in `VAULT_CHECKS.md` | **Identical** statuses, reason codes and exit codes | As today (own fixtures) |
| Preflight cases (`stellar` missing / < v28, missing identity, not a contract) | exit 2 with their codes | Unchanged; the probe runs after them | — |

Note on the third-party contracts:

- The "before" numbers come from the builders' own runs
  (`COMPLETION_REPORT.md`).
- A new "before" run by us would invoke SEP-56 function names on their
  contracts. Those calls fail at argument parsing or simulation, before
  anything is sent, but `CLAUDE.md` says conformance runs belong only on our
  own deployments. **Ask the builders, or skip the "before" run and use
  L16–L19.**
- The "after" run makes no `invoke` at all under P or R, so it is safe.

**Server / web flow**

- Run the server locally:
  - `POST /api/check` with Celengan. Under P, the job ends `status: 'error'`
    with the problem/fix text.
  - Under R, it ends `complete`, with 11 `not_applicable` rows.
  - A queue request and `GET /health` behave as before.
- Web: `npm test`, `npm run lint`, `npm run build`.

## 4. Decisions for the user

1. **Result shape:** P (stop like a preflight), R (11 NOT_APPLICABLE rows),
   or R′ (run what is present). Recommendation: P.
2. **Exit code:** 2 (with P), or 4 (with R/R′). Recommendation: 2.
3. **Strictness:** compare names only, or names + argument names + types.
   Recommendation: names + argument names + types, because the checker calls
   by argument name.
4. **`raw_error` field:** add now and keep `detail` unchanged (recommended),
   or also strip `Raw error: …` from `detail`.
5. **"Remediation needed" → "Review required":** in this change, or as a
   separate change.
6. **Before-runs on Celengan/StellarBin:** reuse the builders' evidence
   (L16–L19), or ask the builders to allow a new run.
