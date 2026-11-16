# SOW 2, D2: constructor parameters of the security checks (design)

Status: **design only, no code or other document changed.** Date: 2026-11-16.
Branch `sow2/constructor-docs`, from `dev-sow2` at `083a732`. Network:
**Testnet only**. Request: Feng, document the constructor parameter names the
security checks need.

**TERBUKTI** = read in the code at this commit, or run on Testnet in this work.
**BELUM** = inferred, or not run end to end.

Everything run here was either a read (`contract info`, `balance`,
`decimals`, `query_asset`) or a `stellar contract deploy` of a throwaway copy
with the arguments shown. Two copies were really deployed (section 3). The
failing deploys below stop in the CLI or in simulation, and none was submitted.
No secret key was read or printed; only identity names are used.

## 1. What the four security checks send to the constructor

### 1.1 The call

Each of `donation_attack`, `overflow_protection`, `rounding_direction` and
`access_control_probing` (`cli/src/checks/mod.rs`) does the same two steps:

1. `resolve_target_vault` reads, from the **target**, its Wasm hash
   (`contract info hash`), its underlying asset (`query_asset`), the vault's
   `decimals()` and the asset's `decimals()`. **TERBUKTI** (read)
2. `deploy_checked` runs `stellar contract deploy --wasm-hash <hash>
   --source-account <account> --network testnet --quiet -- --name … --symbol …
   --asset … --decimals_offset …` (`rpc.rs`, `deploy_contract`). **TERBUKTI**
   (read)

The arguments are passed **by name**, as flags. Stellar CLI 28.0.0 takes named
arguments only for constructors as for other functions (same finding as for
`approve`/`allowance`, `design-approve-allowance.md`).

### 1.2 The four arguments

| Name | Type (target spec) | Value | Where it comes from |
|---|---|---|---|
| `name` | `string` | `Donation Attack Check Vault`, `Overflow Test Vault`, `Rounding Test Vault`, `Access Control Test Vault` (one per check) | Hard-coded in each check. Not a flag, not read from the target. |
| `symbol` | `string` | `DACHK`, `OVFCHK`, `RNDCHK`, `ACLCHK` | Hard-coded in each check. |
| `asset` | `address` | the target's underlying asset | `query_asset()` on the target (`resolve_target_vault`). |
| `decimals_offset` | `u32` | `vault.decimals() - asset.decimals()` | Derived; there is no getter. If the vault's `decimals()` is smaller, the check ends NOT_APPLICABLE `not_a_standard_vault` before any deploy. |

The deploying account is fixed per check: `grace`, `carol`, `dave`, `erin`
(`main.rs`). All **TERBUKTI** (read). The CLI has no option to change any of
these: `--help` lists only `--vault`, `--output`, `--status-file`. **TERBUKTI**
(run)

The target's own constructor is declared in its spec, and the preflight spec
read already contains it. The reference vault's `__constructor` reads
`name: string, symbol: string, asset: address, decimals_offset: u32`. Celengan
(another team's contract) declares ten different arguments, starting with
`owner: address, usdc: address, vault: address`. **TERBUKTI** (run). The probe
in `interface.rs` does not look at it, by design (its header says the
constructor, `query_asset` and `decimals` are not probed).

### 1.3 What happens when the target's constructor differs

The first column is the case, the second what the CLI printed (run on Testnet
with the reference vault's Wasm, the checker's exact flags including
`--quiet`), the third what the checker does with that text (read from
`rpc.rs`, `checks/mod.rs`).

| Case | What the CLI printed | Result of the check |
|---|---|---|
| **A. Another name** (`--underlying` instead of `--asset`; `--offset` for `--decimals_offset`) | exit 2, `error: unexpected argument '--underlying' found` and a `Usage: __constructor …` line | NOT_APPLICABLE `constructor_mismatch` (both markers present). CLI text **TERBUKTI**; the mapping is **TERBUKTI** in a unit test, end to end on a real vault **BELUM**. |
| **B. Constructor lacks an argument we pass** (a token's `(admin, name, symbol)` given our four) | exit 2, `unexpected argument '--asset' found` | Same as A. Same status. |
| **C. Constructor needs an argument we do not pass** (`--admin`, or `--decimals_offset` omitted) | exit 1 and **nothing on stderr** with `--quiet`. Without `--quiet`: `Missing required argument 'admin' of type address …` | A deploy is never repeated, so the checker has no text. From the code: INCONCLUSIVE `unclassified_error`, detail `No error text was available.` CLI **TERBUKTI**; the mapping is read from the code, end to end **BELUM**. |
| **D. Right names, wrong type** (`--decimals_offset abc`) | exit 1, nothing on stderr | Same as C. |
| **E. Another order** | none: exit 0, a copy deployed with `decimals` 9 for `decimals_offset 2` on a 7-decimal asset | No effect. Arguments are named. **TERBUKTI** |
| **F. No `query_asset`, or an asset without `decimals`** | not a deploy problem | NOT_APPLICABLE `not_a_standard_vault`, before any deploy. Documented today. |

Two properties of the order of events:

- The mismatch is found **inside each of the four checks**, after their own
  reads, so a vault with another constructor gets four NOT_APPLICABLE rows from
  four separate deploy attempts. **TERBUKTI** (read)
- Only a constructor that rejects an **unexpected** name is recognised. A
  required argument that is **missing** is not (case C).

## 2. What is documented today, and the gaps

| Place | What it says | Gap |
|---|---|---|
| `README.md` ~l.145–157 | The four checks need a constructor of `(name, symbol, asset, decimals_offset)` and `query_asset`; a mismatch gives `constructor_mismatch`; no `query_asset` gives `not_a_standard_vault`. | No types, no source of each value, no mention that names must match exactly, that order does not matter, or that a **missing** argument is not `constructor_mismatch`. |
| `docs/INTEGRATE.md` l.59, l.200 | Same one-line statement, and "A vault with a different constructor gets NOT_APPLICABLE on all four". | Same. Case C gives INCONCLUSIVE, so "NOT_APPLICABLE on all four" is not true for it. |
| Web docs `security.ts` l.18, `limitations.ts` l.28, `output.ts` l.25 and l.153 | Same sentence, and the `constructor_mismatch` row. | Same. Not linked to a longer explanation. |
| `VAULT_CHECKS.md` l.15 | How the clone is built: Wasm hash, asset, derived offset. | Never lists the four arguments or the fixed `name` / `symbol`. |
| `labels.rs` / `reason.message` | "The vault's constructor does not take (name, symbol, asset, decimals_offset), so the security checks cannot deploy their copy." | Says what we pass, not what the target declares or how to fix it. |
| `--help` | Nothing on constructors. | The requirement is invisible from the command line. |
| Test vault descriptions | Every fixture uses the same constructor. | There is no fixture or sample report that shows a non-standard constructor. |

Nowhere is there a way to see **your** vault's constructor, a command that
checks it, or an example of a vault with another one.

## 3. Proposal

### 3.1 Where it goes

- **One main place: a new section in `docs/INTEGRATE.md`**, "Constructor
  requirements for the security checks", after section 3 ("Find the vault's
  asset and its decimals"), which already speaks of `query_asset` and
  `decimals()`.
- **Short pointers**, one sentence each with a link, in `README.md` (the
  paragraph at l.149), `VAULT_CHECKS.md` (l.15), the web docs page `security.ts`
  and `limitations.ts`, and `labels.rs` / `--help` if you choose to touch code
  (decision D4).
- A new heading in the web docs is not needed; the web page links to the repo
  file, as the integration guide is already linked from the README.

### 3.2 Content of the section

1. The requirement, in one sentence: the target's constructor must declare
   `name: string, symbol: string, asset: address, decimals_offset: u32` with
   exactly these names; order does not matter.
2. A table like 1.2: each argument, its type, the value the checks send and
   its source (fixed text, `query_asset()`, derived), and that none can be set
   from the command line.
3. A table like 1.3: the cases A to F, with the status the checker gives, and
   which are shown by a run (**TERBUKTI**) and which are read from the code
   (**BELUM**).
4. How to see your vault's constructor (run):
   ```bash
   stellar contract info interface --contract-id <VAULT_ID> --network testnet --output rust
   ```
   The `fn __constructor(…)` block lists the names and types. Run on the
   reference vault, it printed `name: String, symbol: String, asset: Address,
   decimals_offset: u32`. On Celengan it printed ten other arguments.
5. How to try the same deploy by hand, which is what each security check does
   (run, a copy was deployed: `CAMLQHRC6NR5YF7OSU4KGZMJP6C2BRDY43ZSTCZ7OICEXTM5O6LSSHYQ`):
   ```bash
   stellar contract deploy --wasm-hash <VAULT_WASM_HASH> --source-account dave \
     --network testnet -- --name "Constructor Docs Probe" --symbol CDPRB \
     --asset <ASSET_ID> --decimals_offset 3
   ```
   Get the hash with `stellar contract info hash --contract-id <VAULT_ID>
   --network testnet`. Drop `--quiet` here: with `--quiet` a missing argument
   prints nothing (case C). Run with the Blind asset
   `CCNIPWVK…6SSG` and offset 3 (a custom asset and a non-zero offset),
   it printed the new contract id; its `decimals()` is 10 and `query_asset`
   returns the Blind token. A swapped order (`--decimals_offset 2 --asset …
   --symbol … --name …`) deployed too.
6. What the mismatch looks like, with the two real CLI texts for case A and
   case C, and what the checker reports.
7. What to do: a vault with another constructor cannot be covered by the
   security checks today. The seven conformance checks still run, and the
   vault gets four NOT_APPLICABLE (or INCONCLUSIVE, case C) rows. State this as
   a limit, not as a finding about the vault.

Only commands that were run are written into the section; case C's text and
its mapping stay labelled **BELUM** until a vault shows them.

## 4. Findings (not fixed here)

| # | Finding | Evidence |
|---|---|---|
| F1 | **A missing or mistyped required constructor argument is silent.** With `--quiet` the CLI prints nothing, a deploy is never repeated, and the result (from the code) is INCONCLUSIVE `unclassified_error` with `No error text was available.` The real message (`Missing required argument 'admin' of type address`) shows only without `--quiet`. | CLI behavior: **TERBUKTI** (cases C and D). Checker result: read from `diagnose_with`, **BELUM** end to end. |
| F2 | **`constructor_mismatch` does not say what the target's constructor is**, although the preflight spec read already holds it. The user has to find it out alone. | **TERBUKTI** (spec read has `__constructor`; label text read). |
| F3 | **Raw CLI usage line is misleading.** In case A the `Usage: __constructor …` line lists only the arguments before the unexpected one (two for the reference vault, whose constructor has four). It is stored in `raw_error` and `detail`. | **TERBUKTI** (runs A, B). Third-party text. |
| F4 | **No early stop.** The mismatch is found in each of the four checks, after their own reads; the preflight does not look at `__constructor`, `query_asset` or `decimals` (by design, `interface.rs`). | **TERBUKTI** (read). |
| F5 | **A vault with no `decimals_offset` argument is NOT_APPLICABLE** even though the offset can be derived. The check cannot deploy its copy without it. | Mapping **TERBUKTI** in a unit test fixture; not run on a real vault. |
| F6 | **Stale text.** `docs/INTEGRATE.md` l.167 and l.202 still say the reason code of a short `grace` balance is not accurate. That changed in #62. | **TERBUKTI** (read against #62). |
| F7 | **`name` and `symbol` are fixed.** A constructor that validates them (length, characters) would fail for a reason that is not a mismatch. Not seen. | **BELUM** |

## 5. Decisions for you

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Main place | (a) new section in `docs/INTEGRATE.md`. (b) a new file `docs/CONSTRUCTOR.md`. (c) `VAULT_CHECKS.md`. | **(a)**, next to the existing asset and decimals steps. |
| D2 | Pointers | One sentence plus link in README, VAULT_CHECKS, web `security.ts` and `limitations.ts`. Or README only. | **All four**, so the web page and the repo agree. The web files need your go-ahead (text only). |
| D3 | Cases C and D in the text | Write them as **BELUM** for the checker result. Or run them first on a real vault with an extra required argument. | **Write as BELUM**; a fixture vault with another constructor belongs to a separate task (it needs new contract code). |
| D4 | `--help` and the `reason.message` | (a) leave the code alone. (b) add one line to `--help` and a link in the message. | **(a)** here; list (b) with F1 and F2 as code items, because they change CLI output. |
| D5 | Findings F1–F5 | Fix in later tasks, one branch each. Or drop. | Keep as a list; propose F1 and F2 together (silent missing argument, and show the target's constructor), F4 as its own item. |
| D6 | Stale text F6 | Fix in the same change as the documentation. Or separately. | **Same change**, as it is on the same page. |
| D7 | Wording | Keep the "not a finding about the vault" language for NOT_APPLICABLE and INCONCLUSIVE rows, and follow the Project word rules. | **Yes.** |
| D8 | Example | Use the Blind asset and offset 3 as the non-default example, with the two copies deployed here. Or add a second example with a failing deploy. | **Both**: one success, and the case A text as the failing one. |

Order of work, if accepted: D1/D2 text in a branch of its own, then F6 in the
same change, then a decision on code items (F1, F2, F4).
