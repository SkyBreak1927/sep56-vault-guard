# Vault Checks

Documentation of the 11 conformance/security checks implemented by the `sep56-vault-guard` CLI, and how each one maps to the official [SEP-0056 "Tokenized Vault Standard"](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0056.md) specification.

**Spec reference used for this document**: `stellar/stellar-protocol`, file `ecosystem/sep-0056.md`, `Version: 0.1.2`, `Status: Draft` (as published at the time of writing). SEP-56 has no numbered clauses — it is organized by named headings (`## Interface`, `## Security Concerns`, etc.), so citations below reference those headings rather than section numbers.

## Architecture

The CLI (`cli/`) is a generic SEP-56 conformance checker, not a tool hardcoded to one vault:

- **`--vault <contract_address>`** selects the target vault to check (defaults to our own reference vault deployment if omitted). All checks operate against whatever address is passed here.
- The 7 **Positive Conformance** checks call read/write functions directly on the target vault and inspect real state changes (`total_assets()`, share balances, etc.) — they touch the target vault's live state.
- The 4 **Security/Adversarial** checks never touch the target vault's own state. Each one first resolves the target vault's Wasm hash (`fetch_wasm_hash()`, via `stellar contract info hash`), underlying asset (`query_asset()`), and **actual `decimals_offset`** (derived as `vault.decimals() - underlying_asset.decimals()`, since the vault exposes no direct getter for it), then **deploys its own fresh, throwaway clone** built from that exact configuration, and runs the adversarial scenario against the clone. This makes the security checks safe to run against any real, in-use vault without risking its funds or state, while still testing the exact contract code, asset, and offset the target actually uses — see [Demo/Validation Vaults](#demovalidation-vaults) below for evidence this generalization actually works, not just for the default `decimals_offset = 0` case.
- All checks are implemented in `cli/src/checks/mod.rs`; the subprocess wrapper around the `stellar` CLI lives in `cli/src/rpc.rs`.

---

## Category: Positive Conformance Checks

These validate that the target vault correctly implements the seven core read/write functions defined in SEP-56's `## Interface` section (the `TokenizedVault` trait).

### 1. `total_assets`

- **Function**: `check_total_assets` — [cli/src/checks/mod.rs:17](cli/src/checks/mod.rs#L17)
- **Validates**: `total_assets()` can be called successfully and returns a valid non-negative `i128`.
- **SEP-56 reference** (`## Interface`, `fn total_assets`):
  > "Returns the total amount of underlying assets held by the vault. This represents the vault's balance of the underlying asset, which determines the conversion rate between shares and assets."
- **Category**: Positive Conformance

### 2. `deposit`

- **Function**: `check_deposit` — [cli/src/checks/mod.rs:43](cli/src/checks/mod.rs#L43)
- **Validates**: Depositing a fixed amount of underlying assets mints shares matching `preview_deposit()` computed just before execution (not a hardcoded 1:1 assumption, so this holds on vaults at any share:asset ratio), and `total_assets()` increases by exactly the deposited amount.
- **SEP-56 reference** (`## Interface`, `fn deposit`):
  > "Deposits underlying assets into the vault and mints vault shares to the receiver, returning the amount of vault shares minted."

  Also `## Events` → `### Deposit Event`, which defines the `Deposit` event topics (`operator`, `from`, `receiver`) and data (`assets`, `shares`) that this operation must emit.
- **Category**: Positive Conformance

### 3. `mint`

- **Function**: `check_mint` — [cli/src/checks/mod.rs:160](cli/src/checks/mod.rs#L160)
- **Validates**: Minting a fixed amount of shares pulls in assets matching `preview_mint()` computed just before execution, and `total_assets()` increases by exactly the assets pulled.
- **SEP-56 reference** (`## Interface`, `fn mint`):
  > "Mints a specific amount of vault shares to the receiver by depositing the required amount of underlying assets, returning the amount of assets deposited."
- **Category**: Positive Conformance

### 4. `withdraw`

- **Function**: `check_withdraw` — [cli/src/checks/mod.rs:276](cli/src/checks/mod.rs#L276)
- **Validates**: Withdrawing a fixed amount of underlying assets burns shares matching `preview_withdraw()` computed just before execution, and `total_assets()` decreases by exactly the withdrawn amount.
- **SEP-56 reference** (`## Interface`, `fn withdraw`):
  > "Withdraws a specific amount of underlying assets from the vault by burning the required amount of vault shares from the owner, returning the amount of vault shares burned."

  Also `## Events` → `### Withdraw Event` (topics `operator`, `receiver`, `owner`; data `assets`, `shares`).
- **Category**: Positive Conformance

### 5. `redeem`

- **Function**: `check_redeem` — [cli/src/checks/mod.rs:393](cli/src/checks/mod.rs#L393)
- **Validates**: Redeeming a fixed amount of shares returns assets matching `preview_redeem()` computed just before execution, and `total_assets()` decreases by exactly the assets received.
- **SEP-56 reference** (`## Interface`, `fn redeem`):
  > "Redeems a specific amount of vault shares for underlying assets, returning the amount of underlying assets received."
- **Category**: Positive Conformance

### 6. `convert_to_shares`

- **Function**: `check_convert_to_shares` — [cli/src/checks/mod.rs:527](cli/src/checks/mod.rs#L527)
- **Validates**: Round-trip bound — `convert_to_assets(convert_to_shares(x))` does not *exceed* `x` — rather than a hardcoded 1:1 expectation, so it stays meaningful on vaults at any share:asset ratio or `decimals_offset`; and that `convert_to_shares()` is read-only (does not change `total_assets()`).
  **Note (updated during hardened-vault testing):** this was originally an exact-equality check. Composing two floor divisions is only ever guaranteed to lose precision, never gain it — `floor(floor(x·n/d)·d/n) <= x` holds for any positive integers `x, n, d` — so exact equality only ever held by coincidence, at ratios that happen to divide evenly (a fresh 1:1 vault, or an exact power-of-ten `decimals_offset`). Testing `contracts/hardened-vault` (a non-1:1, non-power-of-ten ratio by design) exposed this: the round trip legitimately landed 1 unit below the original, which the old exact check flagged as a false FAIL. The bound is now `<=`, which still catches an actual defect — a round trip that *creates* value — and still fails a vault that rounds up instead of down (its round trip is provably `>= x` instead), just as `contracts/rounding-bug-vault` continues to demonstrate via [`rounding_direction`](#10-rounding_direction).
- **SEP-56 reference** (`## Interface`, `fn convert_to_shares`):
  > "Converts an amount of underlying assets to the equivalent amount of vault shares (rounded down)."
- **Category**: Positive Conformance

### 7. `convert_to_assets`

- **Function**: `check_convert_to_assets` — [cli/src/checks/mod.rs:615](cli/src/checks/mod.rs#L615)
- **Validates**: Round-trip bound in the other direction — `convert_to_shares(convert_to_assets(x))` does not *exceed* `x` — and that `convert_to_assets()` is read-only (no change to `total_assets()`). See the note under [`convert_to_shares`](#6-convert_to_shares) above for why this is `<=` rather than exact equality.
- **SEP-56 reference** (`## Interface`, `fn convert_to_assets`):
  > "Converts an amount of vault shares to the equivalent amount of underlying assets (rounded down)."
- **Category**: Positive Conformance

---

## Category: Security / Adversarial Checks

These probe the security properties SEP-56 explicitly calls out in its `## Security Concerns` and `## Notes On Decimals Offset` sections. Each deploys its own throwaway vault clone (see Architecture above) rather than touching the target vault.

### 8. `donation_attack` — ⚠️ Known Finding

- **Function**: `check_donation_attack` — [cli/src/checks/mod.rs:767](cli/src/checks/mod.rs#L767)
- **Validates**: Simulates the exact donation/inflation attack described in the spec — an attacker deposits a dust amount, then donates a large amount directly to the vault's contract address (bypassing `deposit()`), then a victim deposits normally. PASS requires the victim receive at least 90% of the shares they would proportionally be owed; attacker profit/loss is recorded as supplementary context only (see rationale below).
- **SEP-56 reference** (`## Notes On Decimals Offset`), which describes this exact attack mechanism almost verbatim:
  > "Attacker deposits minimal amount (e.g. 1 token) → receives 1 share
  > Attacker directly transfers large amount to vault contract → inflates share price
  > Victim deposits → receives 0 shares due to rounding down
  > Attacker withdraws → steals victim's deposit"

  Also `## Security Concerns`: *"Empty vault attack - Can be addressed by introducing virtual decimals offset (notes below)."*
- **Category**: Security/Adversarial
- **⚠️ KNOWN FINDING — this check currently FAILS against our reference vault (`decimals_offset = 0`)**:

  With a 100,000,000-stroop donation against a 1-stroop dust deposit, a victim depositing 5,000,000 stroops received **0 shares (0% of expected)** — a complete loss of their deposit. In a follow-up manual experiment using the *precise minimal* donation needed to zero out that specific victim (9,999,999 stroops, rather than the oversized 100,000,000 used by the automated check), the attacker's own net P&L was still a **loss** (−2,500,000 stroops / −0.25 XLM) after accounting for their deposit, donation cost, and final redemption — not a profit.

  **This matches the spec's own claim** (`## Notes On Decimals Offset`): *"the default offset (0) makes it non-profitable even if an attacker is able to capture value from multiple user deposits."* Our testing corroborates that the attack is non-profitable for the attacker at `decimals_offset = 0`, even at the mathematically optimal donation size for a single-victim scenario.

  **However, "non-profitable for the attacker" does not mean "safe for the victim."** The victim's loss is total and unconditional — it does not depend on whether the attack ultimately nets the attacker a profit. A `decimals_offset > 0` (up to OpenZeppelin's reference implementation cap of 10, per the SEP's Reference Implementation section) is required to meaningfully raise the cost of this attack; `decimals_offset = 0` is the weakest point on that spectrum, not "no mitigation," but it leaves individual victims fully exposed. This is a design tradeoff inherent to the reference vault's configuration, not a bug in the OpenZeppelin vault module itself.

  **⚠️ Follow-up finding — raising `decimals_offset` alone did NOT flip this check to PASS.** We deployed [Vault A](#demovalidation-vaults) — the same reference vault code, `decimals_offset = 6` instead of `0` — and re-ran this exact check (same fixed attack parameters: 1-stroop dust deposit, 100,000,000-stroop donation, 5,000,000-stroop victim deposit). Result: the victim received only **99,999 shares out of the 5,000,000,000,000 (`assets × 10^offset`) they were fairly owed — effectively 0%**, and the check still FAILS. The reason: `decimals_offset` scales the attacker's *own* dust deposit and the "fair" baseline together, but it does **not** scale the raw donation amount, which is a plain asset transfer. Since our fixed donation (100,000,000) is ~20× the victim's deposit (5,000,000) regardless of offset, the offset's mitigation — which primarily helps by making an attacker's near-zero initial deposit represent a less dominant share of `totalSupply` — isn't strong enough to rescue this specific, disproportionately-funded attack. **Takeaway: `decimals_offset` alone is not a substitute for deployment-time safeguards (e.g. a meaningful seed deposit) when an attacker can fund a donation far larger than typical victim deposits.**

### 9. `overflow_protection`

- **Function**: `check_overflow_protection` — [cli/src/checks/mod.rs:996](cli/src/checks/mod.rs#L996)
- **Validates**: Calling `deposit(assets = i128::MAX)` on a fresh vault fails **cleanly** (returns an error, leaves `total_assets()` at `0`, no corrupted state) rather than silently succeeding with a wrong result.
- **SEP-56 reference** (`## Security Concerns`):
  > "Overflow Protection - Using Rust checked arithmetic operations that fail on overflow."

  Also: *"Data Validation - Validation logic for i128 amounts, including zero value checks and upper/lower bounds where applicable."*
- **Category**: Security/Adversarial
- **Honest caveat** (see the check's own detail output and code comments): for a native-XLM (or any classic-asset) underlying asset, `i128::MAX` is actually rejected by the classic Stellar Asset Contract's own `int64` amount ceiling, *after* the vault's own share-conversion math has already run to completion without error. This check therefore validates clean-failure behavior end-to-end, but does not on its own prove that the vault's *own* checked-arithmetic overflow protection (as opposed to the underlying SAC's limits) is what's doing the rejecting in this specific scenario.

### 10. `rounding_direction`

- **Function**: `check_rounding_direction` — [cli/src/checks/mod.rs:1128](cli/src/checks/mod.rs#L1128)
- **Validates**: At a deliberately fractional share:asset ratio, `deposit()` rounds shares **down** (floor, matching `preview_deposit()`), while `mint()` rounds the assets charged **up** (ceil, matching `preview_mint()` and strictly exceeding the always-floor `convert_to_assets()`) — i.e. rounding always favors the vault over the user, never the reverse.
- **SEP-56 reference** (`## Security Concerns`):
  > "Rounding Errors and Precision Loss - Using Soroban fixed-point code for vault's 'muldiv' operations."

  The specific rounding directions per function are documented inline in the `## Interface` trait doc comments: `convert_to_shares`/`convert_to_assets`/`preview_deposit`/`preview_redeem` are specified "(rounded down)", while `preview_mint`/`preview_withdraw` are specified "(rounded up)".
- **Category**: Security/Adversarial
- **Validated as a true negative detector**: we deployed [Vault B](#demovalidation-vaults), a variant of the reference vault with `convert_to_shares`/`convert_to_assets` deliberately overridden to round **up** instead of down (favoring the user, violating SEP-56). This check correctly caught it: `"mint() assets pulled (151) is not strictly greater than the idealized convert_to_assets() (151)"` — because the check's own throwaway clone inherits Vault B's exact (buggy) Wasm via the resolved `wasm_hash`, so the bug surfaces automatically without any check code changes. This is direct evidence the check can actually detect a real rounding-direction violation, not just pass vacuously.

### 11. `access_control_probing`

- **Function**: `check_access_control_probing` — [cli/src/checks/mod.rs:1428](cli/src/checks/mod.rs#L1428)
- **Validates**: An operator withdrawing on an owner's behalf without any prior `approve()` is rejected; after the owner grants a limited share allowance, an operator withdrawal within that limit succeeds and decrements the allowance by exactly the amount spent (not reset to `0`, not left unchanged); a withdrawal exceeding the remaining allowance is rejected, and a rejected transaction leaves the allowance untouched.
- **SEP-56 reference** (`### Authorization Pattern`, under `## Design Rationale`):
  > "This standard does not enforce any specific authorization patterns for vault operations. Implementations are expected to add appropriate access controls based on their requirements, typically by: Using `operator.require_auth()` to verify the caller's authorization [...]"

  Also `## Security Concerns`: *"Authorization and Permissions (Access Control) - no access control enforced by default, authorization for the operator must be handled implementation-wise."* The allowance mechanism itself is inherited from the vault's `TokenInterface`/SEP-41 dependency (`## Dependencies`: *"The vault itself must also comply with SEP-41 and further extend it."*).
- **Category**: Security/Adversarial

---

## Demo/Validation Vaults

Four additional testnet deployments exist alongside our own reference
deployment — none represent third-party audits. Vault A and Vault B exist
purely to validate that the checks above actually generalize to vaults
other than the reference deployment; Demo Vault exists as a public showcase
target with a standard, unmodified configuration; Hardened Vault implements
a real donation-attack mitigation in contract code, for honest before/after
comparison against the reference vault's known finding. All four use the
same underlying native XLM asset as the reference vault.

### Vault A — `decimals_offset = 6`

- **Address**: `CAWUBSRHD4DUDWAJENO7XHI3QVEXKIU3ZZ4HRM3RFZ4PNBSCCYXH4VTA`
- **Code**: identical to `contracts/reference-vault` (same Wasm hash), deployed with `--decimals_offset 6` instead of `0`.
- **Purpose**: confirm the CLI's `decimals_offset`-resolution fix (see Architecture above) produces correct, non-false-positive/negative results at a non-zero offset — not just that it doesn't crash.

| # | Check | Result |
|---|-------|--------|
| 1 | `total_assets` | PASS |
| 2 | `deposit` | PASS |
| 3 | `mint` | PASS |
| 4 | `withdraw` | PASS |
| 5 | `redeem` | PASS |
| 6 | `convert_to_shares` | PASS |
| 7 | `convert_to_assets` | PASS |
| 8 | `donation_attack` | **FAIL** (see follow-up finding in check #8 above — offset alone didn't neutralize this specific fixed-size attack) |
| 9 | `overflow_protection` | PASS |
| 10 | `rounding_direction` | PASS |
| 11 | `access_control_probing` | PASS |

**10 PASS, 1 FAIL** — identical pass/fail pattern to the reference vault, confirming the offset generalization didn't introduce any false positives/negatives on the other 10 checks.

### Vault B — intentional rounding bug

- **Address**: `CAZBXMYP5TQWEHCFMUD6ZEON7DUWAC2BCKNCKKVBIRX7GZN7M6I2P6HV`
- **Code**: `contracts/rounding-bug-vault` — a copy of the reference vault with `convert_to_shares`/`convert_to_assets` overridden to round **up** (`Rounding::Ceil`) instead of down (`Rounding::Floor`), reversing SEP-56's vault-favoring rounding requirement. `decimals_offset = 0`.
- **Purpose**: a negative control — confirm `rounding_direction` actually detects a real, deliberately-injected rounding violation rather than passing vacuously.

| # | Check | Result |
|---|-------|--------|
| 1 | `total_assets` | PASS |
| 2 | `deposit` | PASS |
| 3 | `mint` | PASS |
| 4 | `withdraw` | PASS |
| 5 | `redeem` | PASS |
| 6 | `convert_to_shares` | PASS |
| 7 | `convert_to_assets` | PASS |
| 8 | `donation_attack` | FAIL (baseline finding, unrelated to this vault's injected bug) |
| 9 | `overflow_protection` | PASS |
| 10 | `rounding_direction` | **FAIL** (correctly detected the injected bug — see check #10 above) |
| 11 | `access_control_probing` | PASS |

**9 PASS, 2 FAIL** — `rounding_direction` is the only *newly* failing check compared to the reference vault, isolating exactly the bug that was injected.

### Demo Vault — public showcase (`decimals_offset = 0`)

- **Address**: `CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ`
- **Code**: identical to `contracts/reference-vault` (same Wasm hash `8e9f12ca88aa575eaa28fd959f124eeceb636a3bf28d053254ae1a3ed3f60b3d`), deployed with `--decimals_offset 0` — the standard configuration, not modified like Vault A or Vault B.
- **On-chain metadata**: name `Demo Vault`, symbol `DEMO`; underlying asset is native XLM (testnet SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`), same as the reference vault.
- **Purpose**: a dedicated, publicly-referenceable deployment for demos and showcases, kept separate from the reference vault so the reference vault's own state isn't disturbed by public interaction.

| # | Check | Result |
|---|-------|--------|
| 1 | `total_assets` | PASS |
| 2 | `deposit` | PASS |
| 3 | `mint` | PASS |
| 4 | `withdraw` | PASS |
| 5 | `redeem` | PASS |
| 6 | `convert_to_shares` | PASS |
| 7 | `convert_to_assets` | PASS |
| 8 | `donation_attack` | **FAIL** (expected — same baseline finding as the reference vault at `decimals_offset = 0`) |
| 9 | `overflow_protection` | PASS |
| 10 | `rounding_direction` | PASS |
| 11 | `access_control_probing` | PASS |

**10 PASS, 1 FAIL** — identical pass/fail pattern to the reference vault, confirming this showcase deployment behaves exactly as expected with no configuration drift.

### Hardened Vault — real donation-attack mitigation (`decimals_offset = 0`)

- **Address**: `CCVC5VLAH2RNCPWLR76P3IP6PCLOGG4AIOXXIQ5RNNG3DCKJ3ULBJUVG`
- **Code**: `contracts/hardened-vault` — a copy of the reference vault whose constructor additionally burns `DEAD_SHARES = 1000` vault shares to the vault's own contract address (which can never authorize spending them), before any deposit is possible. `decimals_offset = 0`, same underlying native XLM asset as the reference vault.
- **Purpose**: implement and honestly evaluate the SEP-56 spec's own recommended donation-attack mitigation — "burning a minimum initial deposit as dead shares" (SECURITY.md §1) — as real contract logic, not a parameter change like Vault A.
- **Why the mint happens in the constructor, not lazily on the first `deposit()`/`mint()` call**: an earlier design minted the dead shares inside `deposit()`/`mint()`, guarded by `total_supply() == 0`. That breaks a different invariant: SEP-56 requires `deposit()`'s returned shares to exactly match a `preview_deposit()` computed immediately beforehand, which the CLI's own `deposit`/`mint` checks enforce. Minting the dead shares *inside* the call would move `total_supply` between an external caller's `preview_deposit()` and the actual `deposit()` — but only for the vault's very first transaction, i.e. exactly the transaction the CLI's own `deposit` check performs. Minting once in the constructor, before the vault can receive any call at all, avoids this: `total_supply` is already `1000` before any `preview_*`/execute pair is ever observed.
- **Verified on-chain immediately after deployment, before any deposit**: `total_supply() = 1000` and `balance(<vault address>) = 1000` — confirming the mitigation is live, not just present in source.

| # | Check | Result |
|---|-------|--------|
| 1 | `total_assets` | PASS |
| 2 | `deposit` | PASS |
| 3 | `mint` | PASS |
| 4 | `withdraw` | PASS |
| 5 | `redeem` | PASS |
| 6 | `convert_to_shares` | PASS |
| 7 | `convert_to_assets` | PASS |
| 8 | `donation_attack` | **FAIL** — mitigated but not enough to pass this check's fixed attack size (see below) |
| 9 | `overflow_protection` | PASS |
| 10 | `rounding_direction` | PASS |
| 11 | `access_control_probing` | PASS |

**10 PASS, 1 FAIL** — same pattern as the reference vault. This was **not** the first result: before a follow-up checker fix (below), this vault produced **8 PASS, 3 FAIL**, with `convert_to_shares` and `convert_to_assets` also failing.

**`donation_attack` — mitigation works, but not enough to flip this specific fixed-size attack to PASS:**

Running the exact same automated attack (1-stroop dust deposit, 100,000,000-stroop donation, 5,000,000-stroop victim deposit) that leaves the reference vault's victim with 0 shares, the hardened vault's victim received **100 shares (still ~0% of the 5,000,000 expected, below the check's 90% threshold)** — a real, measurable improvement over 0, but nowhere near enough to pass. The reason is the same limitation already identified for `decimals_offset` in §1a: `DEAD_SHARES = 1000` is a *fixed* constant, and this check's donation (100,000,000 stroops) is five orders of magnitude larger than it. A dead-shares constant only meaningfully protects against a donation within roughly the same order of magnitude as itself; making `DEAD_SHARES` large enough to neutralize this specific 100,000,000-stroop donation (something on the order of 10⁹) would not be "a small amount of dead shares" by any reasonable definition, and was deliberately not done — the goal here was an honest evaluation of a realistic mitigation, not a value tuned to this one test.

**Side effect discovered during testing — `convert_to_shares`/`convert_to_assets` checker fix:** the pre-existing exact-equality round-trip assertion in these two checks (`convert_to_assets(convert_to_shares(x)) == x` and the reverse) turned out to only ever hold by coincidence, at share:asset ratios that divide evenly (a fresh vault's 1:1 ratio, or Vault A's exact power-of-ten offset) — every vault tested before this one happened to stay at such a ratio. The hardened vault's dead-shares-influenced ratio is not a clean multiple, and composing two floor divisions there legitimately loses a few units on round-trip (verified: `4000000 → 3999999` and `4000000 → 3999994` in the two directions) — a true mathematical property of floor/floor conversions, not a defect. The checks (`cli/src/checks/mod.rs`) were updated from exact equality to the provably correct bound `floor(floor(x·n/d)·d/n) <= x`, which still fails a vault whose round trip *creates* value (impossible for a correct floor-rounding vault) and still fails `contracts/rounding-bug-vault`'s round trip (which is provably `>= x` instead, since it rounds up) — verified by re-running the full suite against the reference vault, Vault A, Vault B, and Demo Vault after the fix, with no change in any of their results.

**Takeaway**: a "burn dead shares in the constructor" mitigation is real, implementable, on-chain-verifiable protection — and it measurably helps (0 → 100 shares here) — but like `decimals_offset`, it is a fixed constant and cannot be sized to neutralize an attacker whose donation is chosen to be large relative to it. Meaningful protection against a well-funded attacker still requires pairing a fixed mitigation like this with a deployment-time safeguard scaled to the vault's expected usage (e.g. a real, asset-backed initial deposit sized by the deployer), as already recommended in SECURITY.md §1a.

---

## Summary Table

| # | Check | Category | Status vs. reference vault |
|---|-------|----------|------------------------------|
| 1 | `total_assets` | Positive Conformance | PASS |
| 2 | `deposit` | Positive Conformance | PASS |
| 3 | `mint` | Positive Conformance | PASS |
| 4 | `withdraw` | Positive Conformance | PASS |
| 5 | `redeem` | Positive Conformance | PASS |
| 6 | `convert_to_shares` | Positive Conformance | PASS |
| 7 | `convert_to_assets` | Positive Conformance | PASS |
| 8 | `donation_attack` | Security/Adversarial | **FAIL — Known Finding** |
| 9 | `overflow_protection` | Security/Adversarial | PASS |
| 10 | `rounding_direction` | Security/Adversarial | PASS |
| 11 | `access_control_probing` | Security/Adversarial | PASS |
