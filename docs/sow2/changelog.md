# SOW 2 changelog

Tester requests and what was done about them. Each claim is marked
**TERBUKTI** (run or read in this repository) or **BELUM**. Request numbers
come from the validation tracker of the SOW 1 Final Report.

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
