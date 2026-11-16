# SOW 2, D2: report schema — structured reason, mode and SEP-56 draft label (design)

Status: **design only, no code changed.** Date: 2026-11-16. Branch
`sow2/report-schema`, from `dev-sow2` at `2dc02d3`. Context:
`docs/sow2/changelog.md`, `design-unsupported-interface.md`,
`design-approve-allowance.md`.

**TERBUKTI** = read in the code at that commit. **BELUM** = inferred or not
run.

## 1. The schema today

### 1.1 `--output json`, a run that reached the checks

A **bare JSON array** of 11 rows, built by `JsonCheckResult` in
`cli/src/main.rs`. Field order is fixed by serde. **TERBUKTI**

| Field | Present | Content |
|---|---|---|
| `name` | always | check id, e.g. `deposit` |
| `category` | always | `Positive Conformance` / `Security/Adversarial` |
| `status` | always | `PASS`, `FAIL`, `INCONCLUSIVE`, `NOT_APPLICABLE` |
| `detail` | always | free text; for INCONCLUSIVE/NOT_APPLICABLE it ends in `Raw error: …` |
| `reason_code` | INCONCLUSIVE and NOT_APPLICABLE only | see 1.3 |
| `raw_error` | when the tool captured `stellar` error text (since #57) | the `stellar` text on its own |

No run-level fields exist, because the payload is an array: no network, spec,
version or time. A FAIL row never has `reason_code`, and a unit test pins
that (`p1_a_fail_keeps_its_text_and_has_no_reason_code`).

### 1.2 `--output json`, a run stopped in preflight (exit 2)

A single object: `{error: "preflight_failed", code, problem, fix}`. For
`code: "unsupported_interface"` it also has `missing_functions` and
`mismatched_functions` (since #57). **TERBUKTI**

### 1.3 Reason codes in use

**TERBUKTI**

| Where | Codes |
|---|---|
| Row, INCONCLUSIVE | `insufficient_token_balance`, `network_error`, `unclassified_error` |
| Row, NOT_APPLICABLE | `constructor_mismatch`, `not_a_standard_vault`, `token_interface_mismatch` (#58) |
| Row, FAIL | none |
| Preflight `code` | `stellar_not_found`, `stellar_version_unreadable`, `stellar_version_too_old`, `identities_missing`, `vault_address_malformed`, `vault_not_a_contract`, `unsupported_interface` |

How a FAIL row is produced today:

- 47 `CheckResult::fail` call sites and 14 `Stop::Fail` sites, each with its
  own text.
- `Stop::CommandFail` (#57) is a FAIL from a failed `stellar` command. It is
  produced only when `verdict` returns `None`, which happens only for a
  missing SEP-56 function (`NotAStandardVault` with `na_if_missing: false`).
  Since #57 that can only happen if the preflight spec could not be read.
  **TERBUKTI** (code reading)

### 1.4 `--output markdown`

Built by `cli/src/markdown.rs`. **TERBUKTI**

- Header list: `Vault`, `Network: testnet`, `Spec: SEP-0056 v0.1.2 (Draft)`,
  `Checker`, times, `Result` (e.g. `Remediation needed`), and group lines.
- Two tables: `| # | Check | Status | Detail |`.
- No reason code and no raw error column.
- It mirrors the web's Markdown export (`web/src/lib/report.ts`), which has
  one more column, `Settled at`.

### 1.5 Status file (`--status-file`)

`{vault, updated_at_ms, checks: [{id, group, status, detail, reason_code?}]}`,
from `cli/src/status.rs`. It has no `raw_error`. **TERBUKTI**

### 1.6 Who reads what

| Reader | Reads | Breaks if… |
|---|---|---|
| `server/index.js` | stdout as JSON. An array becomes `result`; an object becomes an error built from `problem` + `fix`. Progress comes from the status file `.checks` only. Rows are not inspected. | **the array becomes an object.** Every run would turn into an error. |
| Web, `web/src/lib/useCheckRun.ts` | status file entries `id, group, status, detail`. Fallback `legacyToChecks` reads `name, category, status, detail` from `result`. **`reason_code` is not used anywhere in the web**; it is only typed in `web/src/services/api.ts`. | a status string changes, or `detail` changes (`findings.ts` parses donation and overflow details with regexes). |
| Web export, `web/src/lib/report.ts` | builds its **own** JSON/MD in the browser from `detail` and `status`, with run-level `network: 'testnet'` and `spec: 'SEP-0056 v0.1.2 (Draft)'`. | nothing in the CLI output; it never sees the new fields unless the web is changed. |
| Web docs, `web/src/docs/pages/output.ts` | documents the JSON fields (`reason_code` "Present only for INCONCLUSIVE and NOT_APPLICABLE"). | it goes out of date (text only). |
| `docs/sample-reports/` | saved CLI 0.5.0 outputs (4 MD, 1 JSON). | they stay as they are: historical v0.5.0 output. New samples would be added, not swapped in. |

## 2. Proposed schema

### 2a. Structured `reason`

Add one object per **non-PASS** row: `reason: {code, message}`.

- `code` is a fixed, documented string. A program branches on it.
- `message` is one short sentence. It contains no raw `stellar` text and no
  test-account names: those stay in `detail` and `raw_error`.

Proposed codes:

| `reason.code` | Status | Meaning | Source today |
|---|---|---|---|
| `behavior_mismatch` | FAIL (conformance) | The function exists but its result broke an assertion | the conformance checks' `CheckResult::fail` / `Stop::Fail` |
| `security_finding` | FAIL (security) | The adversarial scenario succeeded or an invariant was broken | the security checks' FAIL (`VULNERABLE …` etc.) |
| `interface_missing` | FAIL | A SEP-56 function the check calls does not exist (only possible when the preflight spec was unreadable) | `Stop::CommandFail` |
| `insufficient_token_balance` | INCONCLUSIVE | = existing `reason_code` | unchanged |
| `network_error` | INCONCLUSIVE | = existing | unchanged |
| `unclassified_error` | INCONCLUSIVE | = existing | unchanged |
| `constructor_mismatch` | NOT_APPLICABLE | = existing | unchanged |
| `not_a_standard_vault` | NOT_APPLICABLE | = existing | unchanged |
| `token_interface_mismatch` | NOT_APPLICABLE | = existing | unchanged |

How it relates to `reason_code`:

- For INCONCLUSIVE and NOT_APPLICABLE rows, `reason.code` **equals**
  `reason_code`.
- FAIL rows get a `reason` but **no `reason_code`**, so the documented rule
  "`reason_code` only on INCONCLUSIVE / NOT_APPLICABLE" keeps holding.
- `interface_missing` and `behavior_mismatch` are the split StellarBin #2
  asked for: function absent vs function present but wrong. In practice
  "absent" is now reported in preflight (`unsupported_interface`), so
  `interface_missing` rows are rare.

Options for the shape:

- **A1 (recommended): add `reason`, keep `reason_code` and `detail` exactly as
  they are.** Purely additive.
- **A2:** no new object; extend `reason_code` to FAIL rows. This changes a
  documented rule and a pinned test. Consumers that treat "has `reason_code`"
  as "not a verdict" would misread FAIL rows.
- **A3:** replace `reason_code` by `reason`. Breaking; needs a schema version
  (2c).

Options for `message`:

- **M1 (recommended): one fixed sentence per code.** Example for
  `behavior_mismatch`: "The function exists, but its result did not satisfy
  this check's assertion; see detail." This is about 9 strings and touches no
  check body.
- **M2: a specific sentence per call site.** That means about 60 FAIL sites
  plus the `verdict` leads. It is more informative, but much more work and
  more text to keep consistent.

### 2b. Mode and SEP-56 draft label

The JSON array has no run-level place, and making it an object breaks the
server (1.6). So:

- **B1 (recommended for JSON): per-row fields, on every row.**
  - `mode: "testnet"`. Planned later value: `"mainnet_read_only"`.
  - `spec: "SEP-0056 v0.1.2 (Draft)"`. This is the string already in
    `markdown.rs` (`SPEC_REFERENCE`) and in `web/src/lib/report.ts`, so CLI
    and web agree.
  - Alternative B1′: a structured object
    `spec: {id: "SEP-0056", version: "0.1.2", status: "Draft"}`. Easier to
    compare by program, but it differs from the web's string.
- **B2: a versioned envelope behind a new flag.** For example
  `--output json --json-schema 2` gives `{schema_version: 2, run: {vault,
  mode, spec, cli_version, started_at, …}, checks: [...]}`. The default stays
  the array. This is the clean long-term shape, but it is a second format to
  maintain.
- **Markdown:**
  - Always add a header line `- Mode: Testnet (the 7 conformance checks
    change the target vault's state)`. Today there is only `Network: testnet`.
  - **MD1:** also add a `Spec` column to both tables. Each row is then
    labelled, as the testers asked, but it repeats the same value 11 times,
    and the CLI table no longer matches the web export's table until the web
    follows.
  - **MD2:** header only.
- **Preflight object:** add `mode` and `spec` too, additive. The server reads
  only `problem` and `fix`.
- **Status file:** add `reason` (and optionally `mode`/`spec`) to each entry,
  additive. The web reads only `id, group, status, detail`.

Values for Testnet now: `mode = "testnet"`, `spec = "SEP-0056 v0.1.2 (Draft)"`.
Both are constants in the CLI. `mainnet_read_only` is reserved and not
emitted until a Mainnet mode exists.

Not requested, but cheap if wanted (separate tester item): a per-row
`runs_on: "target" | "temporary_copy"`. The 7 conformance checks run on the
target, the 4 security checks on a copy. Left out unless you decide
otherwise.

### 2c. Compatibility with the server and the web on `main`

- **No field is removed or renamed.** `detail` keeps its exact text, so the
  web's regexes in `findings.ts` still match.
- `--output json` stays an array (A1 + B1). The new fields are all extra keys
  on rows, which the server passes through untouched and the web ignores.
- **No new status string.**
- **Exit codes unchanged.**
- **Schema version:**
  - **V1 (recommended): none for these additive changes.** Instead, document
    that new optional fields may be added.
  - **V2:** a per-row `schema_version: 2`. Harmless, but it repeats on every
    row.
  - A real version number belongs with the envelope (B2), if that is ever
    built.
- Tests that pin exact row JSON (`main.rs`: `json_omits_reason_code…`,
  `json_writes_reason_code…`, `json_writes_raw_error…`) change, because every
  row gains `mode`/`spec`. That is an intended test update; no other consumer
  compares rows byte-for-byte. **TERBUKTI** (no such reader in `server/` or
  `web/`).
- Docs to update in the same change:
  - `web/src/docs/pages/output.ts`. This is a **web** text file: it needs your
    go-ahead, since the web is otherwise left untouched.
  - `VAULT_CHECKS.md`, `CLAUDE.md`, `docs/sow2/changelog.md`.

### 2d. Short token balance shown as `unclassified_error`

Recommendation: **not in this change; fix it in the custom-token vault task.**

- This change is meant to be purely additive: identical status, `reason_code`
  and exit code on every fixture.
- The fix changes an existing `reason_code` value (`unclassified_error` →
  `insufficient_token_balance`) on Blind Vault rows. It needs its own trace
  of why the captured text lacks the event log, and its own test with a
  drained custom-token account.
- The new `reason.code` copies `reason_code`, so once that task fixes the
  classification, `reason` follows automatically.

The alternative, fixing it here, mixes a behaviour change into a schema change
and makes the regression no longer a clean "only fields added".

## 3. How to test

### Unit tests

- One test per `reason.code`, from each source: `verdict` cases, `Stop::Fail`
  in a conformance and in a security check, `Stop::CommandFail`.
- `reason.code == reason_code` whenever `reason_code` exists.
- A PASS row has no `reason`.
- Every row carries `mode` and `spec`.
- The preflight object gains `mode`/`spec` and its other keys are unchanged.
- The status-file entry gains `reason`.
- Markdown: the `Mode` line, and the `Spec` column if MD1.

### Testnet regression

Fixtures: the 8 existing ones plus SEP-41 Names
(`CDTVHZ2EGTROAUVERX2YVN6GF7PTRWBMHHLKSWCQYQEYXIUTPXILUEIM`), 9 in all.
Compare the current `dev-sow2` build (`2dc02d3`) with the new build.

- **Must be identical:** every row's `name`, `status`, `reason_code`, and the
  exit code.
- **Only added:** `reason` on non-PASS rows (with `reason.code` = `reason_code`
  where present), and `mode`/`spec` on every row.
- **`detail` may differ** only by run-dependent numbers. Compare its text with
  the digits masked to confirm the wording did not change.

Expected results, same as the current changelog:

- Reference, Demo, Vault A, Hardened, Blind: 10 PASS, 1 FAIL, exit 1.
- Vault B: 9 PASS, 2 FAIL, exit 1.
- Positive Control: 11 PASS, exit 0.
- Reverting Max: 6 PASS, 1 FAIL, 4 INCONCLUSIVE, exit 1.
- SEP-41 Names: 11 PASS, exit 0.

**Before the regression:** `alice`, the Blind asset's mint admin, tops up the
Blind token. Two Blind runs need:

| Account | Needed for 2 runs | Current balance | Top-up |
|---|---|---|---|
| `bob` | 10,000,000 | 0 | +10,000,000 |
| `erin` | 20,000,000 | 0 | +20,000,000 |
| `grace` | ≥ 100,000,001 at the start of each run; one run uses about 50,000,000 | 110,166,739 | +100,000,000 |

Record the balances before and after, as in the changelog.

Preflight: Celengan and StellarBin should still exit 2 with the same `code`
and function lists, now with `mode`/`spec` added.

## 4. Decisions for the user

1. **`reason` shape:** A1 add `reason {code, message}` and keep `reason_code`
   (recommended), A2 extend `reason_code` to FAIL rows, or A3 replace it
   (needs a schema version).
2. **`message`:** M1 one fixed sentence per code (recommended), or M2 a
   specific sentence per call site (about 60 sites).
3. **The FAIL codes themselves:** `behavior_mismatch` (conformance),
   `security_finding` (security), `interface_missing` (`CommandFail`). Keep,
   rename, or merge `behavior_mismatch` and `security_finding` into one code.
4. **Mode and spec in JSON:** B1 per-row string fields (recommended), B1′
   per-row structured `spec`, or B2 a versioned envelope behind a new flag.
5. **Markdown:** MD2 header line `Mode` only (recommended), or MD1 also a
   `Spec` column per row.
6. **Schema version:** V1 none for additive fields (recommended), or V2
   per-row `schema_version`.
7. **Status file:** also carry `reason` (recommended; additive, the web
   ignores it), or leave it unchanged.
8. **`web/src/docs/pages/output.ts`:** update the field documentation in this
   change (a web text file), or leave the web fully untouched and note it as
   open.
9. **Token balance as `unclassified_error`:** in the custom-token task
   (recommended), or here.
10. **Optional `runs_on` per row** (target / temporary copy): add it, or
    leave it out (default).
