# SOW 2, D2: wording pass on the report texts (design)

Status: **design only, no code or other document changed.** Date: 2026-11-16.
Branch `sow2/wording-pass`, from `dev-sow2` at `2533410`. Context:
`handoff.md` §5 ("Wording pass"), `design-report-schema.md`,
`design-unsupported-interface.md` (the "Remediation needed" item).

**TERBUKTI** = read in the code at this commit. **BELUM** = inferred or not run.
Line numbers are from `dev-sow2` at `2533410`.

## 0. Rules the new texts follow

1. Coverage is described only as: **"checks 7 core SEP-56 functions and four
   basic security risks"**. Nothing says or hints that the whole standard, the
   whole vault, or "everything" was checked. Events are not checked (README,
   `VAULT_CHECKS.md`).
2. The **7 conformance checks change the state of the target vault**, with
   Testnet funds. Only the **4 security checks** use a temporary copy, and they
   only read the target. No text may read as if all checks leave the vault
   alone.
3. A **FAIL on a security check is a finding in the scenario that was run**. It
   is not proof that the vault is exploitable, and a PASS is not proof that it
   is safe.
4. The words banned by the Project word rules (English and Indonesian) are not
   used, in the new texts or in this document.
5. One name for the copy: **"temporary copy"**.

## 1. Inventory

Columns: where, the text now, and the problem. Problem tags: **M** misleading,
**A** ambiguous, **B** does not match behavior, **J** jargon, **S** too strong
as a claim. "Mirror" means the same text lives in a second place that must stay
in step.

### 1.1 Report frame (Markdown)

| # | Where | Text now | Problem |
|---|---|---|---|
| W1 | `markdown.rs:29` `TITLE`; mirror `web/src/lib/report.ts:90`, `output.ts:96` | `# Aegis Vault — Conformance Verification Report` | **S**: "Verification" reads as a verdict on the vault. **A**: the report also holds security checks, which are not conformance. |
| W2 | `markdown.rs:17` `MODE_LINE` | `- Mode: testnet (the 7 conformance checks change the target vault's state; the 4 security checks run on a temporary copy)` | Accurate. Gap: does not say "Testnet funds" or that the security checks read the target. |
| W3 | `markdown.rs:115-127` `summary_title`; mirror `report.ts:13-21`, `VerificationReport.tsx` | `Remediation needed` (any FAIL) | **M**: says something must be fixed. A security FAIL is a finding in a tested scenario, and a conformance FAIL is a difference from what the check expects. Also raised by StellarBin (#1) and in `design-unsupported-interface.md` l.212 ("Review required"). |
| W4 | same | `All checks passed` / `All applicable checks passed` | **S**: with no scope next to it, "all checks passed" can be read as "the vault is correct". |
| W5 | same | `Some checks could not finish`, `No applicable checks` | Fine. Kept. |
| W6 | `markdown.rs:156-157`, `report.ts:10` | group lines `Core function checks`, `Basic security checks`; tables at `markdown.rs:166` are headed `Conformance checks`, `Security checks` | **A**: two names for the same group in one report. |
| W7 | `markdown.rs` `header()` | no line says what the run covers | **M** by omission: nothing next to the headline states what is and is not checked. |
| W8 | `markdown.rs:194,234` | `Result: Unsupported interface, no checks were run` / `No checks were run.` | Fine. Kept. |

### 1.2 `reason.message` (JSON, status file; `labels.rs:65-98`)

| # | Code | Text now | Problem |
|---|---|---|---|
| W9 | `behavior_mismatch` (:68) | The function exists, but its result did not satisfy this check's assertion. See detail. | **J**: "assertion". |
| W10 | `security_finding` (:71) | The scenario this check runs on a temporary copy of the vault was not handled as expected. See detail. | **A**: "handled as expected" by what? **M**: does not say it is about the tested scenario only. |
| W11 | `interface_missing` (:74) | The vault does not declare a SEP-56 function this check calls. | Fine. |
| W12 | `insufficient_token_balance` (:76) | A test account holds too little of the vault's underlying asset. Fund it and run again. Not a finding about the vault. | Fine since #62. Pinned by a test (`main.rs:459`). |
| W13 | `network_error` (:79) | The RPC or network could not be reached. Run again later. Not a finding about the vault. | Fine. |
| W14 | `unclassified_error` (:81) | A call failed for a reason the tool could not classify. Not a finding about the vault. See raw_error. | **B**: `raw_error` is absent when the CLI printed nothing (design-constructor-params F1), so "See raw_error" can point at nothing. |
| W15 | `constructor_mismatch` (:85) | The vault's constructor does not take (name, symbol, asset, decimals_offset), so the temporary copy could not be deployed. Not a finding about the vault. | **A**: does not say the names must match. A constructor that needs an extra argument gets a different code (F1), which the sentence also seems to cover. |
| W16 | `not_a_standard_vault` (:89) | The vault does not expose what this check needs (query_asset, decimals, or Wasm code of its own). Not a finding about the vault. | The code name judges ("not standard"); the sentence is fine. The code is a contract with consumers and stays. |
| W17 | `token_interface_mismatch` (:93) | approve or allowance is not declared in a form this check can call (address, address, i128, u32 with spender second). Not a finding about the vault. | **J**: type list without argument roles. |

### 1.3 `detail` texts a reader meets, by status (`checks/mod.rs`)

`detail` is free text, one per call site. The rows below are the ones with a
wording problem; the rest (for example `total_assets = N`) are plain values.

| # | Where | Text now | Problem |
|---|---|---|---|
| W18 | :1342 `donation_attack` PASS | `resilient to donation/inflation attack — fresh vault …` | **S**: one donation size, one victim deposit. `SECURITY.md` already records that a vault that passes one size was not tried at others. |
| W19 | :1340 `donation_attack` FAIL | `VULNERABLE to donation/inflation attack — …` | **S**/**M**: says the vault is vulnerable; it is a result for one scenario. |
| W20 | :1448, :1454 `overflow_protection` FAIL | `VULNERABLE: deposit(assets=i128::MAX) unexpectedly SUCCEEDED … possibly-wrong result` | **S**, as W19. |
| W21 | :1510 `overflow_protection` PASS | `… failed cleanly (…), and total_assets remained 0 — no silent-wrong-result observed. …` | **J**: "silent-wrong-result". The `NOTE:` at offset 0 (:1507) is accurate and stays. |
| W22 | :1744-1750 `rounding_direction` PASS | `… rounding direction confirmed to always favor the vault over the user` | **S**: "always"; one ratio and two amounts were tried. |
| W23 | :1860, :1956, :1980, :2004 `access_control_probing` FAIL | `VULNERABLE: operator withdrew …` | **S**, as W19. |
| W24 | :2010-2012 `access_control_probing` PASS | `… correctly rejected …` | Fine. |
| W25 | :589, :707, :826, :945 conformance PASS | `deposited 5000000 stroops …`, `withdrew 2000000 stroops …` | **B**: "stroops" is the unit of native XLM; on a custom token (Blind) the unit is the token's smallest unit. |
| W26 | :216 insufficient balance lead | `… which appears to be insufficient balance on the account paying for it …` followed, since #62, by `The account holds X … and needs Y.` | **A**: "appears to be" next to a measured figure. |
| W27 | :230 constructor lead | `this check deploys a comparison copy of the vault …` | **A**: "comparison copy"; everywhere else it is "temporary copy". |
| W28 | `FAIL` rows of other checks | `could not read max_deposit: …`, `… invoke failed: …` | Plain; the reason is in `reason`. Kept. |

### 1.4 Web docs text (`web/src/docs/pages/output.ts`)

| # | Where | Text now | Problem |
|---|---|---|---|
| W29 | :17 | `PASS`: The check's assertions held. | **S** without scope: no sentence says a PASS is a result for what the check ran, not for the whole vault. |
| W30 | :18 | `FAIL`: At least one assertion did not hold. This is a finding about the vault. | **S**/**M**: for a security check this is a finding in the tested scenario. |
| W31 | :21, :25 | INCONCLUSIVE and NOT_APPLICABLE rows | Fine. |
| W32 | reason table (:134-160) | mirrors W9, W10, W15, W17 | Follows the labels. |
| W33 | :82 or :96, :103, :107 | title, summary, table headings | Mirrors W1, W3, W6. |

### 1.5 Other places that carry the same text

| # | Where | Text now | Problem |
|---|---|---|---|
| W34 | `web/src/lib/report.ts:10-21,90`, `VerificationReport.tsx:111-121,144`, `StatusBadge.tsx:3-9` | the web report and page: `Remediation needed`, `All 11 checks passed`, badge `Pass`, `Live Soroban testnet execution` | Mirror of W1, W3, W4. Pinned by `web/src/lib/test/report.test.ts` (l.52, 120, 131-136, 152-153, 195, 198). |
| W35 | `README.md:88` (example block) | `Result: Remediation needed` | Mirror of W3. |
| W36 | `docs/sample-reports/*.md`, `docs/sow2/samples/*.md` | saved reports with the old title and headline | History (CLI 0.5.0). Not rewritten in place. |
| W37 | `docs/sample-reports/README.md` | "Passing checks describe behaviour observed in these runs on testnet. They are not a formal third-party security review." | Good wording to reuse in the scope line. |

## 2. Proposed texts

Same numbering. "Keep" means no change.

### 2.1 Report frame

| # | Proposal |
|---|---|
| W1 | `# Aegis Vault — SEP-56 Check Report` |
| W2 | `- Mode: Testnet. The 7 conformance checks send real transactions to the target vault with Testnet funds and change its state. The 4 security checks run on a temporary copy; the target is only read.` |
| W3 | `Review required` (a FAIL). Same words as the tester suggested, and as the web page's own line `N checks failed — review required`. |
| W4 | Keep the two headlines, and add W7 next to them. |
| W6 | Use the group names `Core function checks` and `Basic security checks` for the tables too (`## Core function checks`, `## Basic security checks`). |
| W7 | A new header line: `- Scope: checks 7 core SEP-56 functions and four basic security risks, on Testnet. Events are not checked. A result describes the scenarios that were run; it is not a statement that the vault is safe or correct.` |

### 2.2 `reason.message`

| # | Proposal |
|---|---|
| W9 | The function exists, but what it returned or changed did not match what this check expects. See detail. |
| W10 | In the scenario this check ran on a temporary copy of the vault, the result is one the check treats as a finding. This describes that scenario only, not the vault as a whole. See detail. |
| W14 | A call failed for a reason the tool could not classify. Not a finding about the vault. See detail, and raw_error when present. |
| W15 | The vault's constructor does not accept the arguments (name, symbol, asset, decimals_offset) under these names, so the temporary copy could not be deployed. Not a finding about the vault. |
| W17 | approve or allowance is declared in a form this check cannot call. It needs approve(address, address, i128, u32) and allowance(address, address), with the second argument named spender. Not a finding about the vault. |
| W11, W12, W13, W16 | Keep. |

### 2.3 `detail`

| # | Proposal |
|---|---|
| W18 | `In this scenario the vault held up — fresh vault …` (the sentence after the dash is unchanged). |
| W19 | `Finding in the donation scenario — fresh vault …` |
| W20, W23 | Replace `VULNERABLE:` by `Finding:` and leave the rest. W20 also drops "possibly-wrong result" for "an unexpected result". |
| W21 | `… no wrong result observed.` |
| W22 | `… at this ratio, rounding favored the vault in both directions tested.` |
| W25 | `deposited 5000000 units of the underlying asset …`, `withdrew 2000000 units …` |
| W26 | When figures are present: `… because the account holds less than the call needed.` Without figures (the old rule), keep `appears to be`. |
| W27 | `this check deploys a temporary copy of the vault …` |

### 2.4 Web docs (`output.ts`)

| # | Proposal |
|---|---|
| W29 | `PASS`: The check's assertions held in the scenario it ran. This does not say the vault is safe or correct overall. |
| W30 | `FAIL`: At least one assertion did not hold. For a conformance check this is a difference from what the check expects; for a security check it is a finding in the scenario that was run. Either way it is a result about that behavior, not proof about the whole vault. |
| W32, W33 | Follow W1, W3, W6, W9, W10, W15, W17. Add one sentence: `reason.message` wording can be improved over time; branch on `reason.code`. |

### 2.5 Mirrors

| # | Proposal |
|---|---|
| W34 | The same strings, in the same PR, so the web export and the CLI Markdown stay identical in the frame (see decision D1). The heading `All 11 checks passed` becomes `All 11 checks passed (see scope)`; the page already shows a scope-like line on the same card. |
| W35 | The README example is regenerated from a new run. |
| W36 | Not rewritten. New samples are added under `docs/sow2/samples/`. |

## 3. Technical impact

### 3.1 What changes

- **JSON**: only the text of `reason.message` (W9, W10, W14, W15, W17), and
  `detail` for the rows in 2.3. No field is added or removed. No `status`,
  `reason_code`, `reason.code`, `category`, `mode`, `spec`, `runs_on` or exit
  code changes. **TERBUKTI** (the texts are string constants and call-site
  strings; nothing branches on them in the CLI).
- **Status file**: carries `reason` (message text), so the same message text
  changes. The web reads only `id, group, status, detail`.
- **Markdown**: title, `Result:` line, `Mode:` line, one new `Scope:` line, the
  two table headings; the 11 table rows change only through `detail`.
- **Text output** (`[PASS] name - detail`, `Summary: …`): `detail` only. The
  `Summary:` line keeps its shape (the server and a test depend on it).

### 3.2 What must not change

- **Web parsers.** `web/src/lib/findings.ts` matches three things:
  `DONATION_RE` (`attacker deposited N stroop(s) then donated N stroops … victim
  then deposited N stroops and received N shares (N% of the`), `PNL_RE`
  (`attacker P&L: …`) and `NOTE_RE` (`^NOTE: …`). So the body of the donation
  sentence, the P&L sentence and the `NOTE:` prefix stay as they are. The
  prefix words `VULNERABLE …` and `resilient …` are not matched (the regex is
  not anchored), so W18 and W19 are safe. The unit words `stroop(s)` /
  `stroops` **inside the donation sentence** also stay, which is why W25 changes
  only the conformance texts. **TERBUKTI** (read).
- `server/index.js` does not read any of these texts. **TERBUKTI** (grep).

### 3.3 Tests that pin the old text

| Test | Pins | Change |
|---|---|---|
| `markdown.rs` tests: title (l.311, 416), `- Mode:` (l.316), `Result:` lines (l.321, 354, 367, 379, 387), no-`Remediation needed` check (l.464) | W1, W2, W3, W6 | Updated with the new texts. |
| `main.rs:459` | the `insufficient_token_balance` message in a JSON row | Unchanged (W12 keeps). |
| `labels.rs` tests | only uniqueness and "no raw text" of the messages | Run as they are; add one that pins the new `security_finding` sentence. |
| `checks/mod.rs` tests | `not a finding about the vault`, `holds`, `Raw error:` | Unchanged. A new test for W26 (figures present or not). |
| `web/src/lib/test/report.test.ts` | W34 | Updated if D1 includes the web. |
| `web/src/docs/test/docs.test.ts` | the banned-word patterns; run against the new texts | No change. |

**BELUM**: whether any test pins `VULNERABLE` or `resilient` was checked by
grep and none was found in the CLI or the web tests.

## 4. Verification plan

1. `cargo test -p sep56-vault-guard`, `npm run lint`, `npm test`, `npm run build`
   in `web/` (if D1 includes the web).
2. **Regression of the 9 fixtures** with `scripts/regress-testnet.sh` (before =
   `dev-sow2` build, after = the new build), `--output json`. The comparer
   (`scripts/regress-compare.mjs`) gets a **text map**: a small file listing
   the agreed replacements, as exact old → new strings, for `reason.message`
   per code and for the `detail` phrases in 2.3.
   - Must be identical: row count and order, `name`, `status`, `reason_code`,
     `reason.code`, key set, exit code.
   - Allowed to differ: `reason.message` only as the map says; `detail` only
     when, after applying the map to the "before" text and masking numbers and
     addresses, it equals the "after" text. Any other difference fails.
   - Expected effect per fixture: the FAIL row of `donation_attack`
     (Reference, Demo, Vault A, Hardened, Blind, Vault B) and Vault B's
     `rounding_direction` change text; PASS rows of `rounding_direction` and
     the conformance rows (`stroops` → `units`) change text; Reverting Max's
     four `unclassified_error` rows change `reason.message` (W14).
3. **Markdown**: run `--output markdown` on Reference (FAIL), Positive Control
   (all PASS) and Reverting Max (INCONCLUSIVE); the only differing lines are
   the title, `Mode:`, `Result:`, the new `Scope:`, the table headings and the
   mapped `detail` text. Check by `diff` against the before output.
4. **Banned words**: grep in `docs/`, `web/src/docs/` and the CLI strings is
   empty.
5. **Samples**: one new set under `docs/sow2/samples/`; the README example block
   regenerated from it.

## 5. Decisions for you

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Scope of this pass | (a) CLI texts and `output.ts` only. (b) (a) plus the web export and page strings (`report.ts`, `VerificationReport.tsx`, their tests). | **(b).** The CLI Markdown is written to follow the web export (`markdown.rs` header); changing one alone breaks that. Needs your go-ahead for `web/src/lib` and `sections`, which earlier tasks kept untouched. |
| D2 | Headline for a FAIL | `Review required`, `Findings to review`, keep `Remediation needed`. | **`Review required`** (tester's wording, and already the web page's phrase). |
| D3 | Report title | `Aegis Vault — SEP-56 Check Report`, or keep. | **Change** (W1). |
| D4 | Scope line in the Markdown header | Add the line of W7, or none. | **Add.** It is the one place the coverage sentence lives. |
| D5 | Change `detail` at all | (a) No: only `reason.message` and the frame. (b) Yes, for W18–W23, W25–W27 as in 2.3. | **(b).** The "VULNERABLE" and "always" wording is the strongest claim in the report. W25 is a plain error for custom tokens. The donation sentence that the web parses stays. |
| D6 | The `Scope` sentence and "not proof" wording in `FAIL` and `PASS` docs | As W29, W30, or shorter. | **As written**; shorter loses the security-finding point. |
| D7 | Group names in the Markdown tables | `Core function checks` / `Basic security checks` in both places, or keep two names. | **Use one pair.** |
| D8 | Old samples and README block | Keep `docs/sample-reports/` as CLI 0.5.0 history; add a new set; regenerate the README example. Or regenerate everything. | **Keep and add.** |
| D9 | `reason.message` stability | Say in `output.ts` that messages may be reworded and programs should use `reason.code`. | **Say it.** |
| D10 | `not_a_standard_vault` code name | Keep the code, as it is a contract with consumers. | **Keep**; only the sentence is documented as is. |
| D11 | Branches | One branch for CLI text, then one for the web text. Or one together. | **One for the CLI plus `output.ts`, one for the web strings**, if D1 is (b), so each can be reviewed alone. |

Order of work, if accepted: D11 first branch (labels, markdown, detail texts,
tests, the text map and comparer), then the 9-fixture regression, then the web
branch, then samples and the README example.
