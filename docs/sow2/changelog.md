# SOW 2 changelog

Tester requests and what was done about them. Each claim is marked
**TERBUKTI** (run or read in this repository) or **BELUM**. Request numbers
come from the validation tracker of the SOW 1 Final Report.

## 2026-11-17 — Read-only gate for Mainnet, PR 1 of 8 (Deliverable 1)

Branch `sow2/mainnet-policy`. Design: `docs/sow2/design-mainnet-readonly.md`
(sections 2 and 8). **No Mainnet code and no new flag yet:** this change is
the rule that later code has to pass, and its tests. The CLI's behaviour on
Testnet is unchanged.

| Item | What was done | Status |
|---|---|---|
| The gate | New `cli/src/net.rs` with `mainnet_policy`. `run_stellar` (the only place that starts a process) calls it before it starts one. A list with exactly one `--network testnet` and no RPC URL is Testnet-class and passes untouched; every other list must be on an allow-list or no process is started. Allowed: `--version`, `contract info hash\|interface`, `contract fetch`, `contract id asset`, `network info\|health`, `keys address <name>`, and `contract invoke` with exactly one `--send=no`, one `G…` public key as the source, `--rpc-url` and `--network-passphrase`, no `--network`, and none of `--build-only`, `--view`, `--sign-with…`, another `--send…`. Refused: everything else, including `contract deploy\|upload\|install\|bump\|extend\|restore`, `tx …`, `keys generate\|fund\|add\|rm\|show\|secret`, an identity name, an `S…` secret key, a muxed account or a seed phrase as the source. | TERBUKTI (unit tests) |
| Environment | For a list that is not Testnet-class the process loses `STELLAR_ACCOUNT`, `STELLAR_AUTH_MODE`, `STELLAR_CONTRACT_ID`, `STELLAR_INVOKE_VIEW`, `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL`, `STELLAR_SEND`, `STELLAR_SIGN_WITH_KEY`, `STELLAR_SIGN_WITH_LAB`, `STELLAR_SIGN_WITH_LEDGER` (the `[env: …]` names in the CLI's `--help`). `STELLAR_RPC_HEADERS` is kept: it carries an RPC key and cannot make anything send. Testnet lists keep their environment as before. | TERBUKTI (unit test) |
| Recording runner | In tests, `run_stellar` writes the argument list down and takes its reply from a small fake vault instead of starting `stellar`. All 11 checks run against it (about 100 calls, every write path reached: deploy, deposit, mint, withdraw, redeem, transfer, approve, allowance). Every recorded call passes the gate on Testnet; **pointed at Mainnet, the gate refuses every `invoke` and `deploy` the checks make**, and lets only the read forms through. | TERBUKTI |
| Source scan | A test reads `cli/src` and **fails when a process is started anywhere but in `run_stellar`**, when `run_stellar` does not call the gate before it starts one, or when it does not scrub the environment. A second test fails on any Horizon URL that is not Testnet. Both were checked to fail on a planted violation (a second spawn site; the gate call removed). | TERBUKTI |

Also: two old comments that held a word the project does not use were
reworded (`rpc.rs`, `checks/mod.rs`; comments only).

Unit tests: 149 in total (113 before, 36 new in `net.rs`), all passing.
`clippy` reports the one warning that already existed. Web: lint and 103 tests
pass (no web change).

**Regression, 9 Testnet fixtures**, `scripts/regress-testnet.sh` without a text
map, the `dev-sow2` build (`7de0ecb`) against this branch: all rows identical
(name, status, `reason_code`, `reason`, keys, `detail` and `raw_error` after
masking numbers and addresses) and the same exit codes. **TERBUKTI**

| Fixture | Result | Same? |
|---|---|---|
| Reference, Demo, Vault A, Hardened, Blind | 10 PASS, 1 FAIL, exit 1 | Yes |
| Vault B | 9 PASS, 2 FAIL, exit 1 | Yes |
| Positive Control, SEP-41 Names | 11 PASS, exit 0 | Yes |
| Reverting Max | 6 PASS, 1 FAIL, 4 INCONCLUSIVE, exit 1 | Yes |

No call to Mainnet was made for this change; every proof is a unit test.

## 2026-11-16 — Wording pass on the report texts (Deliverable 2)

Branch `sow2/wording-pass`. Design: `docs/sow2/design-wording.md`. CLI, the
web docs page `output.ts`, tests, samples and the README example only. The
web export and page strings are a separate branch (`sow2/wording-web`).
Decisions: `Review required` as the headline for a FAIL; a `Scope:` line; no
verdict words in `detail`; one name for the copy ("temporary copy").

| Tester request | What was done | Status |
|---|---|---|
| **StellarBin #1**: "Remediation needed" does not fit | The headline for a run with a FAIL is now `Review required`. The report title is `Aegis Vault — SEP-56 Check Report` (it was `Conformance Verification Report`), and the two tables carry the group names of the summary (`Core function checks`, `Basic security checks`). | TERBUKTI (9 fixtures and 3 Markdown runs) |
| **Lumbung #2**: state clearly that only the security checks run on a temporary copy | The `Mode:` line now says the 7 conformance checks send real transactions to the target vault with Testnet funds and change its state, and the 4 security checks run on a temporary copy while the target is only read. A new `Scope:` line says what the run covers (7 core SEP-56 functions and four basic security risks, events not checked) and that a result describes the scenarios that were run. | TERBUKTI |
| Wording of PASS, FAIL and the reasons (handoff item) | `detail`: `VULNERABLE` became `Finding`, `resilient to … attack` became `In this scenario the vault held up`, "always favor" became a statement about the ratio tested, and `stroops` became `units of the underlying asset` in the deposit and withdraw rows. `reason.message` reworded for `behavior_mismatch`, `security_finding`, `unclassified_error`, `constructor_mismatch`, `token_interface_mismatch`. `output.ts` follows, with a note that `reason.message` may be reworded and programs should use `reason.code`. | TERBUKTI |

No field, status, `reason_code`, `reason.code`, key, row order or exit code
changed. The sentence the web parses in the donation row, the P&L sentence and
the `NOTE:` prefix are unchanged.

Tests: 113 in total, all passing (4 new in `labels.rs`; the tests pinning the
old Markdown texts and one JSON message were updated). `clippy` reports the one
warning that already existed. Web: lint, 96 tests, build pass.

**Regression, 9 Testnet fixtures**, `scripts/regress-testnet.sh --text-map
scripts/text-maps/wording-pass.json`, the `dev-sow2` build against this branch:
all rows identical in name, status, `reason_code`, `reason.code`, keys and exit
code; `reason.message` and `detail` differ only as the map lists (5 to 8
changes per fixture). Blind top-up was done by the script. Markdown runs on
Reference, Positive Control and Reverting Max differ only in the title, the
`Mode:`, `Scope:` and `Result:` lines, the table headings and the mapped
`detail` text. **TERBUKTI**

New samples: `docs/sow2/samples/*-wording-pass.*`. `docs/sample-reports/` is
kept as CLI 0.5.0 history and labelled.

## 2026-11-16 — Constructor requirements of the security checks documented (Deliverable 2)

Branch `sow2/constructor-docs`. Design: `docs/sow2/design-constructor-params.md`.
Documentation only: no Rust code changed. Decisions: the main text in
`docs/INTEGRATE.md`, one-sentence pointers from the README and two web docs
pages (text only), findings F1–F5 kept as a backlog, stale balance text fixed.

| Tester request | What was done | Status |
|---|---|---|
| **Feng Vault**: document the constructor parameter names the security checks need | New subsection "Constructor requirements for the security checks" in `docs/INTEGRATE.md`: the four named arguments (`name`, `symbol`, `asset`, `decimals_offset`), their types, where each value comes from, that none can be set from the command line, how to read a vault's own constructor, a deploy-by-hand example with a custom token and offset 3, and what each kind of mismatch looks like. One-sentence pointers in `README.md`, `web/src/docs/pages/security.ts` and `limitations.ts`. | Commands: TERBUKTI (run on Testnet). Checker result for a constructor that requires an extra argument: BELUM |
| Stale text found while writing it | `docs/INTEGRATE.md` still said the reason code of a short `grace` balance is not accurate. Replaced with the behavior since #62 (`insufficient_token_balance`, balance read). | TERBUKTI (read against #62) |

Findings F1–F5 are in the design document as a backlog and were not fixed.

## 2026-11-16 — Short token balance classified as `insufficient_token_balance` (Deliverable 2)

Branch `sow2/custom-token-classification`. Design: `docs/sow2/design-custom-token.md`.
Results: `docs/sow2/custom-token-results.md`. Decisions: C1 (balance read),
token-moving calls only, `detail` changes only on reclassified rows, native rule
kept as a fallback.

| Item | What was done | Status |
|---|---|---|
| Finding of the unsupported-interface entry: a short token balance gave `unclassified_error` | Cause traced: the repeat call prints one line (`Error(Contract, #100)`) in Stellar CLI 28.0.0, without the event text the old rule needs. Fix: after a rejected `deposit`, `mint` or asset `transfer`, the CLI reads the payer's `balance`; if it is below the amount needed the row is INCONCLUSIVE `insufficient_token_balance` with `holds X, needs Y` in `detail`. Blind with no balance: 5 rows changed from `unclassified_error`; exit code 3 both times. | TERBUKTI |
| `dave`'s need for `rounding_direction` | Measured 1,601 per run. | TERBUKTI |
| Native-XLM rule | Kept as a fallback; never seen to match in a real run. | BELUM |
| `scripts/regress-testnet.sh` | New: Testnet-only guard, identity names only, idempotent capped top-up of the Blind token from `alice`, balances printed before and after, 9-fixture comparison through `scripts/regress-compare.mjs`. | TERBUKTI (run once) |
| Web docs text | `custom-token.ts`, `limitations.ts`, `output.ts` (text only). | lint, 96 tests, build pass |

Unit tests: 109 in total, all passing (5 new). Regression, 9 fixtures: all
identical to the `dev-sow2` build, including `detail` after masking numbers and
addresses.

## 2026-11-16 — Structured reason, mode, SEP-56 label and `runs_on` on every row (Deliverable 2)

Branch `sow2/report-schema`. Design: `docs/sow2/design-report-schema.md`.
Decisions:

- A1: a `reason {code, message}` object; `reason_code` and `detail`
  unchanged.
- M1: one fixed sentence per code.
- FAIL codes `behavior_mismatch` / `security_finding` / `interface_missing`.
- B1: `mode` and `spec` per row.
- MD1: `Mode` and `Spec` columns per Markdown row, plus a header line.
- V1: no schema version.
- The status file carries `reason`.
- The web docs text (`web/src/docs/pages/output.ts`) is updated.
- The token-balance classification is left to the custom-token task.
- `runs_on` per row.

| Tester request | What was done | Status |
|---|---|---|
| **StellarBin #3**: a structured reason field (for example interface missing vs behavior mismatch), with the raw error text, which includes the CLI usage line and test account names, kept in a separate field | Every non-PASS row in `--output json` and in the status file now has `reason: {code, message}`. **FAIL codes:** `behavior_mismatch` (a conformance check: the function exists but its result broke the assertion), `security_finding` (a security check), and `interface_missing` (a SEP-56 function the vault does not declare; normally caught before the run as `unsupported_interface`, see #57). **INCONCLUSIVE and NOT_APPLICABLE rows:** `reason.code` equals the existing `reason_code`. `message` is one fixed sentence per code and holds no raw `stellar` text or account names. The raw text is in `raw_error` (added in #57) and still in `detail`. FAIL rows still have no `reason_code`, as documented. | TERBUKTI |
| **Lumbung #4**: label each result row with the SEP-56 draft version | Every JSON row has `mode: "testnet"` and `spec: "SEP-0056 v0.1.2 (Draft)"`, and so does the preflight object. Every Markdown table row has `Mode` and `Spec` columns, and the header has a `Mode:` line. | TERBUKTI |
| **Lumbung #2**: state clearly that the security checks run on a temporary copy | Every JSON row has `runs_on`: `target` (checks 1–7) or `temporary_copy` (checks 8–11). Every Markdown row has a `Runs on` column (`target vault` / `temporary copy`), and the header's `Mode:` line says the same. | TERBUKTI |

Unit tests: 104 in total, all passing. New tests cover:

- each `reason.code` from its source: conformance FAIL, security FAIL,
  `CommandFail`, and each INCONCLUSIVE / NOT_APPLICABLE code;
- a PASS row has no `reason`;
- every code has its own message, without raw text;
- `runs_on` per check;
- `mode` / `spec` on JSON rows and on the preflight object;
- the status file `reason`, written through `run_tracked`;
- the Markdown header line and columns.

Web docs: `web/src/docs/pages/output.ts` (text only) documents the new fields
and codes. `npm run lint` shows no errors, `npm test` passes 96 tests, and
`npm run build` succeeds. Looking at the rendered page in a browser was not
done (**BELUM**): the `web` entry in `.claude/launch.json` points to
`web/serve.ps1`, which does not exist.

Sample reports with every new field: `docs/sow2/samples/reference-vault-report-schema.json`
and `.md`.

### Regression: 9 Testnet fixtures, `dev-sow2` build vs this change

The two builds were run one after the other with `--output json` on Testnet
on 2026-11-16:

- "Before" is the `dev-sow2` build (`2dc02d3`).
- "After" is this branch.

Checked per row:

1. `name`, `status` and `reason_code` are identical, and so is the exit code.
2. No key was removed, and the only added keys are `reason`, `mode`, `spec`
   and `runs_on`.
3. Every row has `mode`, `spec` and `runs_on`.
4. `reason` is present exactly on the non-PASS rows.
5. `reason.code` = `reason_code` wherever `reason_code` exists.
6. `detail` reads the same once numbers and addresses are masked, so its
   wording did not change.

**TERBUKTI**

| Fixture | `dev-sow2` | This change | Same? | `reason` codes seen |
|---|---|---|---|---|
| Reference `CAMDXP2Q…YTNF` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes | FAIL `security_finding` |
| Demo `CAPH3KBZ…JBNQ` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes | FAIL `security_finding` |
| Vault A `CAWUBSRH…4VTA` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes | FAIL `security_finding` |
| Vault B `CAZBXMYP…P6HV` | 9 PASS, 2 FAIL, exit 1 | same, exit 1 | Yes | FAIL `security_finding` (×2) |
| Hardened `CCVC5VLA…JUVG` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes | FAIL `security_finding` |
| Blind `CCW5GTIF…HGV7` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes | FAIL `security_finding` |
| Positive Control `CAHMH3VS…G376` | 11 PASS, exit 0 | same, exit 0 | Yes | none |
| Reverting Max `CBMB3D7H…H5O4` | 6 PASS, 1 FAIL, 4 INCONCLUSIVE, exit 1 | same, exit 1 | Yes | FAIL `security_finding`; INCONCLUSIVE `unclassified_error` (×4) |
| SEP-41 Names `CDTVHZ2E…UEIM` | 11 PASS, exit 0 | same, exit 0 | Yes | none |

No fixture produces `behavior_mismatch` or `interface_missing` today. Those
two codes are covered by unit tests only.

**Blind-token balances.** Before this regression, `alice` minted:

- `bob`: +10,000,000 (tx `f360cd53…d6e4`);
- `erin`: +20,000,000 (tx `48903de1…b086`);
- `grace`: +100,000,000 (tx `ac2bdbb4…83ed`).

| Balance | Before the top-up | After the top-up | After both Blind runs |
|---|---|---|---|
| `bob` | 0 | 10,000,000 | 0 |
| `erin` | 0 | 20,000,000 | 0 |
| `grace` | 110,166,739 | 210,166,739 | 110,214,379 |

`bob` and `erin` are at 0 again.

## 2026-11-16 — `approve` / `allowance` called by the target's own parameter names (Deliverable 2)

Branch `sow2/approve-allowance`. Design: `docs/sow2/design-approve-allowance.md`.
Decisions:

- b1: names from the preflight spec, mapped by position;
- b-anchored;
- no fit → NOT_APPLICABLE `token_interface_mismatch`;
- fixture based on the positive control.

| Tester request | What was done | Status |
|---|---|---|
| **Feng Vault**: `access_control_probing` calls `approve`/`allowance` with the names `owner` and `live_until_ledger`, while SEP-41 uses `from` and `expiration_ledger`. A vault with SEP-41 names is left INCONCLUSIVE. The suggestion was to call them positionally. | **Positional calls are not possible:** Stellar CLI v28 takes named arguments only. `approve --help` prints `Usage: approve [OPTIONS]`, and `allowance G… G…` fails with `unexpected argument 'G…'`. These were simulations with `--send=no` on our reference vault. **TERBUKTI.** So the parameter names are now read from the target's spec, during the same preflight read as the interface probe, and the check's values are passed under those names **by position**: `approve(owner, spender, amount, expiry)`, `allowance(owner, spender)`. The types must be `address, address, i128, u32` and `address, address -> i128`, and the second argument must be named `spender`. Anything else, or an unreadable spec, makes the check NOT_APPLICABLE with `reason_code: "token_interface_mismatch"` instead of INCONCLUSIVE `unclassified_error`. With OpenZeppelin's names, the arguments are byte-for-byte the same as before (unit test). | TERBUKTI |
| New fixture: **SEP-41 Names Vault** `CDTVHZ2EGTROAUVERX2YVN6GF7PTRWBMHHLKSWCQYQEYXIUTPXILUEIM` (`contracts/sep41-names-vault`). A copy of the positive control whose `approve`/`allowance` use SEP-41 names. Deployed by `alice`. | **CLI 0.5.0:** 10 PASS, `access_control_probing` INCONCLUSIVE `unclassified_error` (raw error `unexpected argument '--owner' found`), exit 3. **This change:** 11 PASS, exit 0. The Feng Vault itself was not run. | TERBUKTI |

Unit tests added (92 in total, all passing):

- names read from the reference spec (`owner`, `live_until_ledger`) and from
  the new fixture's spec (`from`, `expiration_ledger`);
- any other names accepted when the types fit and `spender` is second;
- a second argument not named `spender` → no names (→
  `token_interface_mismatch`);
- other types or a missing function → no names;
- an unreadable spec → no names;
- the argument lists built from OpenZeppelin names equal the old hard-coded
  ones;
- SEP-41 names are passed by position;
- the NOT_APPLICABLE result's reason code and detail.

### Regression: 8 Testnet fixtures, v0.5.0 vs this change

Both binaries were run one after the other with `--output json` on Testnet on
2026-11-16. "Before" is CLI v0.5.0 (`cli/` identical to tag `v0.5.0`).
"After" is this branch, which also contains the unsupported-interface
change. Name, `status` and `reason_code` are compared per check, plus the
exit code. **TERBUKTI**

| Fixture | v0.5.0 | This change | Same? |
|---|---|---|---|
| Reference `CAMDXP2Q…YTNF` | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | same, exit 1 | Yes |
| Demo `CAPH3KBZ…JBNQ` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes |
| Vault A `CAWUBSRH…4VTA` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes |
| Vault B `CAZBXMYP…P6HV` | 9 PASS, 2 FAIL (`donation_attack`, `rounding_direction`), exit 1 | same, exit 1 | Yes |
| Hardened `CCVC5VLA…JUVG` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes |
| Blind `CCW5GTIF…HGV7` | 10 PASS, 1 FAIL, exit 1 | same, exit 1 | Yes |
| Positive Control `CAHMH3VS…G376` | 11 PASS, exit 0 | same, exit 0 | Yes |
| Reverting Max `CBMB3D7H…H5O4` | 6 PASS, 1 FAIL, 4 INCONCLUSIVE `unclassified_error`, exit 1 | same, exit 1 | Yes |

All 8 OpenZeppelin-named fixtures call `approve`/`allowance` exactly as
before, and `access_control_probing` passes on every one of them.

**Blind-token balances.** Before this regression, `alice` (the Blind asset's
mint admin) topped up the Blind token for:

- `bob`: +10,000,000 (tx `0609d120…1a80`);
- `erin`: +20,000,000 (tx `e0d3b608…325a`);
- `grace`: +100,000,000 (tx `35a83398…0814`).

| Balance | Before the top-up | After the top-up | After both Blind runs |
|---|---|---|---|
| `bob` | 0 | 10,000,000 | 0 |
| `erin` | 0 | 20,000,000 | 0 |
| `grace` | 110,119,099 | 210,119,099 | 110,166,739 |

`bob` and `erin` are back at 0 and need a top-up before the next Blind run.

## 2026-11-16 — Unsupported interface detected at the start of a run (Deliverable 2)

Branch `sow2/unsupported-interface`. Design: `docs/sow2/design-unsupported-interface.md`.
Decisions:

- option P: stop like a preflight;
- exit code 2;
- probe by name + argument names + types;
- add `raw_error`, leave `detail` as it is;
- "Remediation needed" is handled separately, not in this change.

| Tester request | What was done | Status |
|---|---|---|
| **Celengan #1**: report the FAIL / N/A results for missing functions as one "unsupported interface" result | A contract without the SEP-56 functions the conformance checks call now ends in preflight with `code: "unsupported_interface"` and exit code 2, instead of 7 FAIL and 4 NOT_APPLICABLE rows. Text output says `Unsupported interface: …`, Markdown says `Result: Unsupported interface, no checks were run`. Celengan after the change: exit 2, 16 of 16 functions missing (`docs/sow2/samples/celengan-unsupported-interface.*`). Before: 0 passed, 7 failed, 4 not applicable, exit 1 (Completion Report L16–L17). | TERBUKTI |
| **Celengan #2**: detect the interface at the start of a run | New `cli/src/interface.rs`. One read of the contract spec (`stellar contract info interface --output json`) runs in preflight, before any check. A call log of every `stellar` command on the Celengan and StellarBin runs shows 10 calls: `--version`, 7 × `keys address`, `contract info hash`, `contract info interface`. None of them is `invoke`, `deploy` or `upload`. A run now takes about 2 s instead of 31–36 s. | TERBUKTI |
| **StellarBin #1**: "Remediation needed" does not fit a vault that is not SEP-56; detect the interface at the start, e.g. "SEP-56 interface not detected (6 of 7 required functions missing)" | Detection at the start: done, as for Celengan #2. StellarBin after the change: exit 2. The message reads `… does not have the SEP-56 vault interface this tool checks. Missing (13 of the 16 functions the checks call): …`, followed by the two functions declared differently (`docs/sow2/samples/stellarbin-unsupported-interface.*`). The count is of functions (16), not of checks (7), because one check calls several functions. Such a run no longer produces a "Remediation needed" headline, since no check runs. **The "Remediation needed" wording itself is deliberately left for a separate change (decision 5).** | Detection: TERBUKTI. Wording: separate change |
| **StellarBin #2**: missing functions are treated inconsistently (security N/A, conformance FAIL); tell "function does not exist" apart from "exists but gives a wrong result" | A function that does not exist, or that is declared with other argument names or types, is now reported before any check as `missing_functions` / `mismatched_functions` in the preflight object (`mismatched_functions` gives `expected` and `found` signatures). FAIL is left for functions that exist and behave wrongly. StellarBin: 13 missing, plus `deposit(depositor: address, amount: i128)` and `withdraw(caller: address, shares: i128)` declared differently. | TERBUKTI |

Also in this change (decision 4, from the tester feedback list in
`COMPLETION_REPORT.md`, Notes item 7): a new optional `raw_error` field in
`--output json` rows.

- It holds the `stellar` error text the tool captured for that result.
- It is written only when there is one, so existing rows keep their exact
  shape.
- `detail` is unchanged on purpose. The status file and the web are
  unchanged.

Status: TERBUKTI in unit tests. No run on a real vault has produced a
`raw_error` row yet: BELUM.

### Regression: 8 Testnet fixtures, v0.5.0 vs this change

Both binaries were run one after the other with `--output json` on Testnet
on 2026-11-16. "Before" is the CLI at `3f8c7d2`, whose `cli/` is identical to
tag `v0.5.0` (`git diff v0.5.0 -- cli/` is empty). For every check the
comparison covers name, `status` and `reason_code`, plus the exit code.
`detail` is not compared, because it holds amounts that change from run to
run. **TERBUKTI**

| Fixture | Before (v0.5.0) | After (this change) | Same? |
|---|---|---|---|
| Reference `CAMDXP2Q…YTNF` | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | Yes |
| Demo `CAPH3KBZ…JBNQ` | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | same, exit 1 | Yes |
| Vault A `CAWUBSRH…4VTA` | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | same, exit 1 | Yes |
| Vault B `CAZBXMYP…P6HV` | 9 PASS, 2 FAIL (`donation_attack`, `rounding_direction`), exit 1 | same, exit 1 | Yes |
| Hardened `CCVC5VLA…JUVG` | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | same, exit 1 | Yes |
| Blind `CCW5GTIF…HGV7` (after topping up its test token, see below) | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | same, exit 1 | Yes |
| Positive Control `CAHMH3VS…G376` | 11 PASS, exit 0 | 11 PASS, exit 0 | Yes |
| Reverting Max `CBMB3D7H…H5O4` | 6 PASS, 1 FAIL (`donation_attack`), 4 INCONCLUSIVE `unclassified_error` (`deposit`, `mint`, `withdraw`, `redeem`), exit 1 | same, exit 1 | Yes |

All 8 match `CLAUDE.md` and `VAULT_CHECKS.md`. All 8 also pass the new probe,
so none of them stops at `unsupported_interface`.

**Blind Vault and its test-token balance.**

The first Blind pair did **not** match, because the test accounts ran out of
the Blind test token (`CCNIPWVK…6SSG`), not because of the code:

- Before (v0.5.0): 9 PASS, 1 FAIL, 1 INCONCLUSIVE, exit 1.
- After (this change): 9 PASS, 2 INCONCLUSIVE, exit 3.

What happened:

- `erin` held 0 tokens. `access_control_probing` was INCONCLUSIVE in
  **both** runs, with `Error(Contract, #100)` on `deposit`.
- `grace` held 50,071,459 tokens after the v0.5.0 run. The donation needs
  100,000,001, so `donation_attack` in the second run was INCONCLUSIVE, with
  `Error(Contract, #100)` on `transfer`.
- In `stellar-tokens` 0.7.2, `#100` is `InsufficientBalance`.

Fix:

1. The token admin was read from the asset's instance storage. It is
   `alice`, whose key is on this machine.
2. `alice` minted:
   - 160,000,000 to `grace` (tx `fa851c56…a486`);
   - 20,000,000 to `erin` (tx `be549c64…be81`);
   - 5,000,000 to `bob` (tx `9f2800cd…2a9f`).
3. Blind was run again, one binary after the other.

Balances before each re-run:

| Balance | Before the v0.5.0 run | Before the new run | After both runs |
|---|---|---|---|
| `grace` | 210,071,459 | 160,095,279 | 110,119,099 |
| `bob` | 10,000,000 | 5,000,000 | 0 |
| `erin` | 20,000,000 | 10,000,000 | 0 |

Both re-runs gave identical results: 10 PASS, 1 FAIL, exit 1. **TERBUKTI**

One full Blind run uses:

- about 49,976,180 tokens from `grace`;
- all 5,000,000 of `bob`'s;
- all 10,000,000 of `erin`'s.

So `bob` and `erin` are now at 0 and need a top-up before the next Blind run.

### Finding (not fixed here; for the D2 custom-token vault item)

On a custom-token vault, a test account that holds too little of the token
gives `INCONCLUSIVE` with `reason_code: "unclassified_error"`, not
`insufficient_token_balance`. **TERBUKTI**

It was seen on Blind Vault with `Error(Contract, #100)`:

- on `access_control_probing`, account `erin`, call `deposit`;
- on `donation_attack`, account `grace`, call `transfer`.

The likely cause is in `classify_error_text` (`cli/src/rpc.rs`). It maps `#100`
to `InsufficientTokenBalance` only when the text also shows the failed
cross-contract `transfer` (`["contract call failed", transfer, …]`). Here the
captured text was the single line
`transaction simulation failed: HostError: Error(Contract, #100)`, without the
event log. **BELUM** (cause inferred from the code, not traced).

The status is right (no verdict about the vault). Only the reason code is
not, as the web docs already note for `donation_attack`
(`web/src/docs/pages/custom-token.ts`).

### Unchanged on purpose

- Exit codes 0/1/3 and the JSON array for every vault that passes the probe.
- `query_asset`, `decimals` and the constructor, used only by the security
  checks, are not probed. Those checks still give NOT_APPLICABLE without them.
- `server/`, `render.yaml` and `web/`: no change.
  - Server: an object on stdout becomes `status: 'error'` with
    `problem` + `fix`, from `server/index.js`, the branch for a non-array
    result.
  - Web: `getJob` turns the 502 into `{status: 'error', error}`, and
    `VerificationReport` shows it as the run's message.

  Read in the code: TERBUKTI. A local server and web run with the new CLI:
  BELUM.
