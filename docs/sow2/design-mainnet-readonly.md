# SOW 2, D1: Mainnet read-only mode in the CLI (design)

Status: **design only, no code changed.** Date: 2026-11-16. Branch
`sow2/mainnet-readonly`, from `dev-sow2` at `9a10671`. Context:
`feasibility.md`, `design-constructor-params.md` (F4, F5), `design-wording.md`,
`design-report-schema.md`, `handoff.md`.

**TERBUKTI** = read in the code at this commit, or run in this session.
**BELUM** = inferred, or not run.

## 0. What was run on Mainnet for this document

Authorised exception: **read calls only**, through a public RPC
(`https://mainnet.sorobanrpc.com`, the same endpoint as `feasibility.md` Part B).
Nothing was sent, deployed or signed on Mainnet. No secret key was used or
asked for. The only address used as a transaction source is a **public key**
(`GCPIX7OU…2554`, the public address of the Testnet identity `alice`; it has no
secret in any command and does not exist on Mainnet). Every command and its
result is in section 7.1.

## 1. Network configuration

### 1.1 Today

The network is hard-coded in five places. **TERBUKTI** (read):

| Where | What |
|---|---|
| `rpc.rs` `invoke_args`, `deploy_contract`, `info_hash_args` | `--network testnet` |
| `interface.rs:271`, `preflight.rs:269` | `--network testnet` |
| `rpc.rs:232` `fetch_current_ledger_sequence` | Horizon `https://horizon-testnet.stellar.org/` |
| `preflight.rs:356` `native_balance` | Horizon testnet account read |
| `labels.rs:16`, `markdown.rs` | `MODE = "testnet"`, `- Network: testnet` |

All subprocesses go through **one function**, `run_stellar` (`rpc.rs:73`, the
only `Command::new` in `cli/src`). **TERBUKTI** (grep). That is the place for
the read-only gate (section 2).

### 1.2 Proposal

- New flag `--network <testnet|mainnet>`, **default `testnet`**. Without it
  nothing changes: the argument lists stay byte-identical (the existing tests in
  `rpc.rs` pin them) and the 9-fixture regression must stay identical.
- **A Mainnet run also uses Testnet.** The four security checks deploy their copy
  on Testnet (section 6), and need the Testnet identities. So there is not one
  network per process but **one target per call**: calls that read the Mainnet
  vault carry the Mainnet RPC URL and passphrase; calls for the copy carry
  `--network testnet`, exactly as today. The gate (section 2) decides from the
  argument list itself, so a call cannot be mislabelled.
- A small `Network` value (new `cli/src/net.rs`), set once at start and read by
  `rpc.rs`, `interface.rs`, `preflight.rs`, `labels.rs`, `markdown.rs`. A
  process-wide setting, not a new parameter on the roughly 100 call sites.
  Unit tests that do not set it get Testnet.
- **Mainnet settings:**
  - `--rpc-url <URL>` or the environment variable `AEGIS_MAINNET_RPC_URL`. No
    network is built into the Stellar CLI for Mainnet: `stellar network ls`
    shows `RPC url: Bring Your Own`, and `stellar network health --network
    mainnet` fails with `Invalid URL`. **TERBUKTI** (run).
  - The passphrase is **fixed in code**: `Public Global Stellar Network ;
    September 2015`. It is not a setting, so a typo cannot point the tool at
    another network.
  - The commands then carry `--rpc-url <URL> --network-passphrase "<…>"` in
    place of `--network testnet`.
- **Check of the endpoint before any check:** `stellar network info --rpc-url …
  --network-passphrase …` prints `Passphrase:` and `Network Id`; the tool
  compares them with the fixed Mainnet values and stops with a preflight error
  on a mismatch (section 5). On the public endpoint it printed
  `Passphrase: Public Global Stellar Network ; September 2015`, `Network Id
  7ac33997…a979`. **TERBUKTI** (run).
- Horizon: in Mainnet mode **no Horizon call is made** (the balance warning and
  the ledger sequence are only used by Testnet checks).
- The report says the network in the existing places: `Network:` line and the
  `mode` field (section 3).

## 2. The read-only guarantee

Rule: **in Mainnet mode no command that can send a transaction can leave the
process.** The tool enforces it in code, in layers, and tests prove each layer.

### 2.1 Layers

1. **One gate in `run_stellar`.** Before spawning, a pure function
   `mainnet_policy(args) -> Result<(), Refusal>` runs on every argument list.
   An argument list is **Testnet-class** only if it contains `--network
   testnet` and no `--rpc-url`; every other list is policed as Mainnet. A list
   that is not on the allow-list is refused with an error and **nothing is
   spawned**:
   - allowed: `--version`; `contract info hash|interface|…`; `contract fetch`;
     `contract id asset`; `network info|health`; and `contract invoke`
     **only if** it contains `--send=no`, and its `--source-account` value is a
     valid public key (`G…` strkey, not an identity name, not an `S…` secret,
     not a seed phrase), and it contains none of `--build-only`,
     `--sign-with-key`, `--send=yes`, `--send=default`, `--view`;
   - allowed, local only: `keys address <name>` (prints a public address, no
     network; the Testnet copy needs the Testnet identities);
   - refused: `contract deploy`, `contract upload`, `contract install`,
     `contract bump|extend|restore`, `tx …`, `keys generate|fund|rm|add|…`, and
     every other subcommand, whenever the list is not Testnet-class.
2. **Explicit `--send=no` on every invoke, never relied on from a default.**
   The default is `--send=default`: it sends when the simulation shows writes,
   events or auth. **TERBUKTI** (`stellar contract invoke --help`).
3. **Environment scrub.** The spawned process gets `env_remove` for
   `STELLAR_SEND`, `STELLAR_INVOKE_VIEW`, `STELLAR_ACCOUNT`, `STELLAR_NETWORK`,
   `STELLAR_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE` and any signing variable of
   the CLI. Reason, from a run: with `STELLAR_SEND=yes` in the environment and
   **no** `--send` flag the CLI took the send path (it looked the source account up and stopped at `Account not
   found`, instead of only simulating). With the same variable and
   an explicit `--send=no` it simulated and printed the result. So the
   environment is honoured when the flag is absent, and an explicit flag wins.
   **TERBUKTI** (run, G1 and G2 in section 7.1).
4. **Only public keys, never a signer, on Mainnet.** No Mainnet call carries an
   identity name, and the tool refuses a `--holder` /
   `--depositor` value that is not a `G…` address. The CLI's own help says that
   with a public key as the source "trying to sign with public key will fail".
   **TERBUKTI** (help text; the failure itself was seen in G1: the run stopped
   at the account lookup).
5. **Optional cross-check against local identities** (decision D6): refuse a
   supplied address that equals the public address of any identity in the local
   key store, so a real key can never be the source. **BELUM** whether the CLI
   would sign for a bare public key that also exists as a local identity; the
   cross-check removes the question.
6. **A command log.** `--command-log <file>` writes every argument list
   passed to `run_stellar`, one per line. The text has no secrets because none
   is used. It is evidence, not enforcement.

### 2.2 Proof, in code

Unit tests (new, in `net.rs`), table-driven:

- every refused form above is refused: deploy, upload, invoke without
  `--send=no`, `--send=yes`, `--send=default`, identity name as source, an `S…`
  secret as source, a seed phrase, `--sign-with-key`, `--build-only`, `keys
  generate`, `tx send`, and a deploy that carries a Mainnet `--rpc-url`;
- a deploy with `--network testnet` and no `--rpc-url` is Testnet-class and
  allowed, so the security checks keep working;
- every allowed form is allowed, and `contract invoke` with `--send=no` and a
  `G…` source is allowed;
- the Mainnet argument builder always places `--send=no` and
  `--rpc-url`/`--network-passphrase`, and never `--network testnet`;
- the environment-scrub list contains the six variables above;
- **a recording runner:** `run_stellar` is given a small trait object that
  records the argument list instead of spawning (default: the real spawner).
  Each of the 11 checks is run in Mainnet mode against it with canned replies,
  and **every recorded argument list must pass `mainnet_policy`**. A new check
  that builds a forbidden command fails this test.
- in Testnet mode the policy is not applied and the existing argument tests
  pass unchanged.

### 2.3 Proof, by a real read-only run

- The **command log** of a Mainnet run: no `deploy`, `upload` or `keys`, and
  every `invoke` has `--send=no` and a `G…` source.
- **Account evidence** (the SOW's ask): for each address used as a source, the
  Horizon (Mainnet) account record and its latest transaction before and after
  the run. Today's proof of the method: the public address used in section 7.1
  returns HTTP 404 for both `accounts/<G>` and `accounts/<G>/transactions`,
  before and after the simulations. **TERBUKTI** (run). For a funded holder
  address the same two reads give the sequence number and the latest
  transaction id, which must be equal before and after. **BELUM** (needs a real
  SEP-56 vault, section 7.2).

## 3. Vault summary at the start of the report

### 3.1 Fields and reads

All reads are simulations with `--send=no` and a public source address. The
reads below were run on the Testnet Blind vault with a public address, and
`decimals` / `symbol` on the Mainnet native asset (section 7.1). **TERBUKTI**

| Field | Read | Seen (Blind vault, Testnet) |
|---|---|---|
| Vault address, network, RPC ledger | given; `network info` | n/a |
| Wasm hash | `contract info hash` | `8e9f12ca…f60b3d` (Blind), `8b31ad8d…334e` (the one Mainnet contract looked at) |
| Name, symbol | `name`, `symbol` | `Blind Vault`, `BLNDV` |
| Vault decimals | `decimals` | `10` |
| Underlying asset | `query_asset` | `CCNIPWVK…6SSG` |
| Asset name, symbol, decimals | `name`, `symbol`, `decimals` on the asset | `Blind Asset`, `BLND`, `7` |
| Derived `decimals_offset` | vault decimals − asset decimals | `3` |
| Total assets, total supply | `total_assets`, `total_supply` | `40031000`, `40031000000` |
| Share price | `convert_to_assets(10^vault_decimals)` | `10000000` assets for one whole share (= 1.0 token at 7 decimals) |
| Deposit limit shown | `max_deposit(<public address>)` | `170141183460469231731687303715884105727` |
| SEP-56 functions declared | the spec read of preflight | 16 of 16 |

A function the vault lacks (for example `name`) gives an empty field, never an
error.

### 3.2 Shape

- **Markdown**: a new section `## Vault summary` after the header list, as a
  two-column table. Added in every run (Testnet too), since the reads exist
  there. Markdown is not parsed by the server or the web.
- **JSON**: `--output json` stays a **bare array of 11 rows** (the server turns
  any other shape into an error; `design-report-schema.md` §1.6). The summary
  goes to `--summary-file <path>` as one JSON object. **BELUM** whether to add
  the same object to the status file (the web ignores unknown top-level keys).
- **Per-row labels** (existing `mode`, `spec`, `runs_on`):
  - `mode`: `"mainnet_read_only"` (the value already reserved in `labels.rs`);
  - `spec`: unchanged;
  - `runs_on`: the existing `target` and `temporary_copy`, and **one new value,
    `simulation`**, for the four checks that call write functions on a Mainnet
    vault (section 4). Additive.
- **Texts** (they follow the rules of `design-wording.md`):
  - `Mode:` for Mainnet: `Mainnet read-only. No transaction is sent to Mainnet
    and no key is used. The conformance checks that call write functions
    (deposit, mint, withdraw, redeem) are simulated on the Mainnet vault; a
    simulation does not check signatures. The 4 security checks run on a
    temporary copy of the vault's Wasm deployed on Testnet.`
  - `Scope:` for Mainnet: `checks 7 core SEP-56 functions and four basic
    security risks. On Mainnet, deposit, mint, withdraw and redeem are
    simulated, not executed. The security checks ran on a Testnet copy of the
    same code, not on the Mainnet instance. Events are not checked. A result
    describes the scenarios that were run; it is not a statement that the vault
    is safe or correct.`
  - `Network:` line: `mainnet` (read only).

## 4. The 11 checks on Mainnet

"Simulated" means the call is run with `--send=no`: the node executes it against
the current ledger and returns the result, and **nothing is written**. A
simulation **does not check signatures**: it records which authorisations the
call needs, so a successful simulation does not prove that a real signature
would be accepted (`feasibility.md`, finding 4; **BELUM**).

Inputs: `--holder <G…>` (a public address that holds shares of the vault) and
`--depositor <G…>` (a public address that holds the underlying asset). They may
be the same address.

| # | Check | On Mainnet | Needs | Assertions kept / dropped | Status |
|---|---|---|---|---|---|
| 1 | `total_assets` | **runs** (read of the target) | none | kept: returns a non-negative number | Read works on Mainnet (native asset read, 7.1); on a SEP-56 vault **BELUM** |
| 2 | `deposit` | **simulated** on the target | `--depositor` with at least 5,000,000 of the asset | kept: returned shares = `preview_deposit`; `max_deposit` is not smaller. **Dropped: `total_assets` and `total_supply` deltas** (a simulation changes nothing) | A write simulated from a public address, balance respected: Testnet **TERBUKTI** (`feasibility.md` rows 3, A1, A3); Mainnet vault **BELUM** |
| 3 | `mint` | **simulated** | `--depositor` | as 2, with `preview_mint` | as 2 |
| 4 | `withdraw` | **simulated** | `--holder` with enough shares | kept: returned shares = `preview_withdraw`; `max_withdraw` not smaller. Dropped: deltas | `withdraw` simulated from a share holder: Testnet **TERBUKTI** (rows 1, 6) |
| 5 | `redeem` | **simulated** | `--holder` | as 4, with `preview_redeem` | as 4 |
| 6 | `convert_to_shares` | **runs** (read) | none | kept in full (no state is involved) | read: **BELUM** on a vault |
| 7 | `convert_to_assets` | **runs** (read) | none | kept in full | **BELUM** on a vault |
| 8 | `donation_attack` | **temporary copy on Testnet** | funded Testnet identities (as today) | scenario unchanged | section 6 |
| 9 | `overflow_protection` | temporary copy on Testnet | as 8 | unchanged | section 6 |
| 10 | `rounding_direction` | temporary copy on Testnet | as 8 | unchanged | section 6 |
| 11 | `access_control_probing` | temporary copy on Testnet | as 8, and a readable `approve`/`allowance` spec | unchanged | section 6 |

Notes:

- The four simulated checks are **weaker** than their Testnet versions: they
  cannot test state changes. The report says so in the row (`runs_on:
  simulation`) and in the `Mode:` / `Scope:` lines. They are not called
  "executed".
- Checks 1, 6 and 7 are plain reads on the target, as on Testnet, so their
  `runs_on` stays `target`.
- The balance probe of #62 (`confirm_short_balance`) also works in simulation
  mode: it only reads `balance`. **BELUM** on Mainnet.

## 5. Missing prerequisites

Exit codes keep their meaning: **0** no failure and nothing inconclusive, **1**
a FAIL, **2** nothing ran (preflight), **3** no FAIL but something inconclusive.

| Situation | Where | Status, reason code | Exit | Message (summary) |
|---|---|---|---|---|
| `--network mainnet` without an RPC URL | preflight | new `mainnet_rpc_missing` | 2 | Give `--rpc-url` or `AEGIS_MAINNET_RPC_URL`. |
| The RPC's passphrase is not Mainnet's | preflight | new `network_mismatch` | 2 | The endpoint reports another network; nothing was run. |
| RPC unreachable | preflight | existing `vault_not_a_contract` family (RPC could not be reached) | 2 | as today, saying Mainnet. |
| The address is not a contract on Mainnet | preflight | existing `vault_not_a_contract` | 2 | text names Mainnet. |
| No SEP-56 interface | preflight | existing `unsupported_interface` | 2 | no `invoke` was made; this is the same read-only probe as on Testnet. |
| A supplied address is not a `G…` public key | preflight | new `mainnet_address_refused` | 2 | Mainnet mode takes public addresses only. |
| An address equals a local identity (if D6 = yes) | preflight | `mainnet_address_refused` | 2 | |
| `--holder` missing | checks 4, 5 | INCONCLUSIVE, new `missing_input` | 3 | "This check needs a public address that holds shares of the vault; none was given. Not a finding about the vault. Pass --holder." |
| `--depositor` missing | checks 2, 3 | INCONCLUSIVE, `missing_input` | 3 | same, for the underlying asset |
| The holder has fewer shares than needed | 4, 5 | INCONCLUSIVE, new `insufficient_shares` | 3 | `holds X shares, needs Y` (balance read of the vault's own token). |
| The depositor holds too little of the asset | 2, 3 | INCONCLUSIVE, existing `insufficient_token_balance` | 3 | `holds X, needs Y` (the #62 balance read). |
| Wasm of the vault cannot be reproduced on Testnet | 8–11 | INCONCLUSIVE, new `copy_not_reproducible` | 3 | "The vault's code could not be reproduced on Testnet (constructor arguments or the underlying asset could not be determined). The Mainnet vault was not tested for this risk." |
| The constructor has other argument names | 8–11 | NOT_APPLICABLE, existing `constructor_mismatch` | no effect | as in `design-constructor-params.md` case A |
| A simulation fails for another reason | any | INCONCLUSIVE, existing `unclassified_error` | 3 | raw error kept |
| A network error | any | INCONCLUSIVE, existing `network_error` | 3 | |

A FAIL can only come from a result that broke an assertion, as before. A
missing input never gives a FAIL. All new reason texts follow the wording rules
(no verdict about the vault). Mapping of the new codes: **BELUM** (design only).

## 6. Security checks on a Testnet copy of the Mainnet Wasm

This is the part that `design-constructor-params.md` F4 and F5 warned about: a
Wasm taken from Mainnet comes with the constructor its owner wrote.

1. **Get the code (read only).** `contract info hash --contract-id <vault>
   --rpc-url … --network-passphrase …` gives the hash; `contract fetch` can save
   the Wasm. Both are reads and worked on a Mainnet contract in `feasibility.md`
   Part B (`B1`, `B2`). **TERBUKTI** (Soroswap Router); a SEP-56 vault **BELUM**.
2. **Put it on Testnet.** `contract upload` on Testnet (skipped by the CLI when
   the same Wasm is already there, as in `B4`), then `contract deploy
   --wasm-hash` on Testnet. The deployed copy had the **same hash** as the
   Mainnet code (`B5`–`B7`). **TERBUKTI** for a contract without constructor
   arguments; for a vault with them **BELUM**.
3. **Constructor arguments.** Read `__constructor` from the Mainnet spec (it is
   in the spec read; **TERBUKTI**, section 7.1 of `design-constructor-params.md`
   and the Testnet reads there).
   - If it declares exactly `(name, symbol, asset, decimals_offset)`: fill them
     as today (fixed `name`/`symbol` per check).
   - If it declares other names: NOT_APPLICABLE `constructor_mismatch` (existing).
   - If it needs another argument the tool does not send: today a silent
     failure (F1). In Mainnet mode the spec read lets the tool see this **before**
     deploying, and report INCONCLUSIVE `copy_not_reproducible` with the
     argument list found. This depends on the F1/F2/F4 work (decision D8).
4. **Underlying asset on Testnet.** The Mainnet asset does not exist on Testnet.
   The copy needs a stand-in with the **same decimals**, because
   `decimals_offset = vault.decimals() − asset.decimals()` is read on Mainnet and
   passed on. Proposal: use the **Testnet native asset contract** when the
   Mainnet asset has 7 decimals; every test identity already holds XLM there, so
   no token funding is needed. Another decimal count: `copy_not_reproducible`
   (**BELUM** whether a stand-in token for other decimals is worth building).
5. **What the copy is, and is not.** It is a fresh instance of the same code with
   our own asset. It has none of the Mainnet vault's storage (roles, fees,
   positions, any state the constructor does not set). So a result describes the
   **code under the four scenarios**, not the Mainnet instance. The row says:
   `runs_on: temporary_copy`, and its detail begins `On a Testnet copy of the
   Mainnet code (hash …):`. A new field `copy_on` is not proposed; the detail
   and the `Scope:` line carry it (decision D5).
6. **Open results are reported open.** If any of steps 1–4 fails the row is
   INCONCLUSIVE `copy_not_reproducible`, exit 3. A Mainnet vault is never
   reported as passing a risk that was not run.

All of step 2 changes only Testnet. Mainnet is touched by reads only.

## 7. Test plan without spending anything

### 7.1 Mainnet read calls run for this document (evidence)

RPC `https://mainnet.sorobanrpc.com`; passphrase `Public Global Stellar
Network ; September 2015`; public address
`GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554`. **TERBUKTI**.

| # | Command (shortened) | Result |
|---|---|---|
| A | `stellar network health --rpc-url … --network-passphrase …` | `Healthy`, latest ledger `65508270` |
| A2 | `stellar network info --rpc-url … --network-passphrase …` | `Passphrase: Public Global Stellar Network ; September 2015`, `Network Id 7ac33997…a979`, RPC version 29.0.1, protocol 29 |
| B | `stellar contract id asset --asset native …` (local computation) | `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` |
| C | `stellar contract info interface --contract-id CDXELK3C…O4IF … --output json` | 9 functions (`burn, mint, approve, metadata, transfer, allowance, balance_of, initialize, transfer_from`); **1 of the 16 SEP-56 functions** declared, so the CLI's probe would give `unsupported_interface` |
| D | `stellar contract info hash --contract-id CDXELK3C…O4IF …` | `8b31ad8d075f5b300a062d79fb010dfea11a7138f756ecf994499808618e334e` |
| E1 | `stellar contract invoke --id CAS3J7GY…OWMA --source-account GCPIX7OU… … --send=no -- decimals` | `7` |
| E2 | same, `symbol` | `"native"` |
| E3 | same, `balance --id GCPIX7OU…` | simulation error `Error(Contract, #6)`, event text `account entry is missing` |
| G1 | `STELLAR_SEND=yes stellar contract invoke … -- decimals` (no `--send` flag) | `Account not found: GCPIX7OU…`, exit 1: the environment variable changed the CLI's path |
| G2 | same environment, with `--send=no` | `7`, exit 0: the explicit flag wins |
| G3 | `… --send=no -- transfer --from <G> --to <G> --amount 1` (a write function) | simulation error `Error(Contract, #6)`, exit 1; nothing sent |
| F, H | Horizon (Mainnet) `GET accounts/<G>` and `accounts/<G>/transactions`, before and after A–G | `404` and `404` every time |

Also closed by E3: `feasibility.md` row 8 had `#6` as an unconfirmed guess
("probably from the native asset contract"). The event text names the native
asset contract and `account entry is missing`. **TERBUKTI**.

The Mainnet contract in C and D comes from a third-party registry search (the
`scout.listContracts` result for the text "vault"); the registry is not an
authority and the contract's behaviour was **not** judged beyond reading its
interface. The CLI's own statement of what it declares is the evidence.

### 7.2 A public SEP-56 vault on Mainnet

**None was found that can be verified.** Searches for tokenized-vault and
SEP-56 repositories returned several candidates (for example repositories
named `TrustLine-id/stellar-vault`, `BootNodeDev/strata-vault-kit`,
`agamafinance/agama-soroban`, `soterika/aura-vault-protocol`); for none of them
did the registry list a Mainnet contract, and a `vault` query returned only the
contract in C and D, which is not a SEP-56 vault (1 of 16 functions). **BELUM**:
whether any SEP-56 vault is live on Mainnet. No address is guessed here.

### 7.3 Plan

1. **Same code, Testnet fixtures, read-only mode.** Add the read-only
   behaviour as `--read-only` that can also be used with `--network testnet`.
   Then the simulated checks 2–5 and the summary run against the 9 Testnet
   fixtures, and their results are compared with the real checks (`deposit`
   simulated must return what the real call returned). This tests everything
   except the network name, without any Mainnet vault. The guard has its own
   tests (2.2).
2. **Mainnet, mechanism only.** Run the CLI in Mainnet mode against the two
   real Mainnet contracts above: the native asset contract and the contract in
   C. Expected: `unsupported_interface` (exit 2) for both, with a command log
   that has no `invoke`, only `info` reads. Needs the code of PR 1.
3. **Mainnet, a real vault.** Needs one SEP-56 vault address and two public
   holder addresses chosen by you. The evidence the SOW asks for:
   - the command log;
   - the Horizon account record and latest transaction of each address, before
     and after (equal);
   - the 11-check coverage matrix, one row per check with `runs_on`, status and
     reason, as in section 4;
   - the 9-fixture Testnet regression, identical (`scripts/regress-testnet.sh`).
4. **Coverage matrix.** One table per run, generated from the JSON: check, mode,
   `runs_on`, status, reason code, "simulated / read / copy". Kept in
   `docs/sow2/`.

## 8. Work split and effect on the 113 tests

| PR | Content | Tests |
|---|---|---|
| 1 | `net.rs`: `Network`, `--network`, `--rpc-url`/env, the policy, the env scrub, the recording runner, `--command-log`, Mainnet preflight (RPC check, passphrase check, contract check, interface probe). Testnet unchanged. | About 30 new. 0 existing change. |
| 2 | Vault summary reads, `## Vault summary`, `--summary-file`. | About 10 new. |
| 3 | `--read-only`, simulated checks 2–5, `missing_input`, `insufficient_shares`, `mainnet_read_only` mode and `simulation` runs-on, Mainnet `Mode:` / `Scope:` texts. | About 20 new; **5 to 8 existing touched**: the tests pinning `MODE`/the `Mode:` line (`labels.rs`, `markdown.rs`, `main.rs`) because `mode` stops being a constant. |
| 4 | Security checks on a Testnet copy of the Mainnet Wasm, `copy_not_reproducible`. Depends on the F1/F2/F4 work. | About 15 new. |
| 5 | Regression script and docs: `output.ts`, README, `INTEGRATE.md`, samples, coverage matrix. | docs tests only. |

The 113 existing tests stay green: Testnet argument lists, the Markdown
header and the JSON shape do not change when `--network` is not given. The
exception is the 5–8 above, which change only to read `mode` from the setting.
Server and web: not touched (`server/` waits for the Render values; the web
shows none of these fields yet).

## 9. Decisions for you

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Default Mainnet RPC | (a) none: `--rpc-url` or `AEGIS_MAINNET_RPC_URL` is required. (b) built-in public endpoint (`mainnet.sorobanrpc.com`) as the default. | **(a).** A built-in default would send every user's queries to one third party, and the Stellar CLI itself leaves it blank. The README gives the endpoint used here as an example. |
| D2 | How strict the gate is | (a) allow-list as in 2.1. (b) deny-list of write commands. | **(a).** A new command is refused until someone allows it. |
| D3 | `--read-only` also on Testnet | Yes, as in 7.3 step 1. Or Mainnet only. | **Yes.** It is the only way to test the simulated checks against fixtures and compare with the real checks. |
| D4 | Summary shape | (a) Markdown section plus `--summary-file`. (b) a versioned JSON envelope behind a flag. (c) Markdown only. | **(a).** The JSON array must stay an array. |
| D5 | Label of the Testnet copy | (a) `runs_on: temporary_copy` plus text in the detail and `Scope:`. (b) a new field `copy_on`. (c) a new `runs_on` value. | **(a)**, additive and no new field. |
| D6 | Local-identity cross-check | Refuse a supplied address that equals a local identity's public address. Or not. | **Yes.** It costs one read per identity and removes the question in 2.1 layer 5. |
| D7 | Missing inputs | INCONCLUSIVE `missing_input` (exit 3). Or NOT_APPLICABLE. | **INCONCLUSIVE.** The vault was not fully checked, and exit 3 says so. |
| D8 | Security checks on a copy | (a) wait for F1/F2/F4, then do PR 4. (b) do PR 4 with only the checks in section 6 steps 1–4. | **(a).** The spec read before deploy is the key part, and F4 is the same item. |
| D9 | Stand-in asset | Native XLM on Testnet for 7-decimal assets only. Or build stand-in tokens for other decimals. | **Native only**; other decimals are reported `copy_not_reproducible`. |
| D10 | A real Mainnet vault for the final evidence | You choose a SEP-56 vault and two public holder addresses. Or demonstrate with Testnet fixtures plus the Mainnet mechanism runs (7.3 step 2). | **You choose.** Without it the SOW's Mainnet evidence is the mechanism only. None was found that I can verify. |
| D11 | Web and server | Later, after the CLI. | **Later.** `server/` and `render.yaml` stay untouched until the Render values come. |
| D12 | Order of work | As in section 8. Or PR 3 before PR 2. | **As in section 8.** |

Order of work, if accepted: PR 1, the mechanism runs of 7.3 step 2, PR 2, PR 3
with the Testnet read-only comparison, then PR 4 after F1/F2/F4, then docs.
