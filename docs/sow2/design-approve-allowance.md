# SOW 2, D2: `approve` / `allowance` with SEP-41 parameter names (design)

Status: **design only, no code changed.** Date: 2026-11-16. Branch
`sow2/approve-allowance`, from `dev-sow2` at `359ab50`. Source: feedback
from the Feng Vault builder.

**TERBUKTI** = read in the code at that commit, or run in this session
(Testnet simulations with `--send=no`, or a local build; nothing deployed,
no transaction). **BELUM** = inferred, or not run yet.

## 1. Where `approve` / `allowance` are called today

Only **`access_control_probing`** (`cli/src/checks/mod.rs:1661`) calls them,
and only on its **throwaway clone**. The clone is deployed from the target's
own Wasm, so its parameter names are the target's. **TERBUKTI**

| Step | Call | Arguments passed | Line |
|---|---|---|---|
| owner approves operator | `approve` | `--owner <owner> --spender <operator> --amount <n> --live_until_ledger <ledger>` | `mod.rs:1771–1781` |
| allowance after a withdraw within the allowance | `allowance` | `--owner <owner> --spender <operator>` | `mod.rs:1816–1823` |
| allowance after a rejected over-allowance withdraw | `allowance` | same `allowance_args` | `mod.rs:1870–1871` |

No other check calls them. `transfer` on the underlying asset already uses
`--from`/`--to`/`--amount`, and the 16 SEP-56 functions are probed in
preflight. **TERBUKTI**

These names are OpenZeppelin `stellar-tokens` 0.7.2's:

- `approve(owner, spender, amount, live_until_ledger)`
- `allowance(owner, spender) -> i128`

(read from the reference vault spec, `cli/testdata/interface/reference.json`.)

SEP-41 names the same parameters differently:

- `approve(from, spender, amount, expiration_ledger)`
- `allowance(from, spender)`

The **order and types are the same**: `address, address, i128, u32` and
`address, address`. Only the first and last names differ.

### What happens today on a vault with SEP-41 names

1. `stellar` rejects `--owner` while parsing the arguments, before any
   simulation. It prints `error: unexpected argument '--owner' found` and
   exits with 2, and nothing is sent. This was checked in reverse on our
   reference vault: `allowance --from …` and `approve --from …
   --expiration_ledger …` fail with `unexpected argument '--from' found`.
   **TERBUKTI**
2. `classify_error_text` (`cli/src/rpc.rs`) has no rule for that text on an
   `invoke`, so it is `Unclassified`. `invoke_checked` (`mod.rs:237`) passes
   it through `verdict` to `INCONCLUSIVE` with `unclassified_error`. The
   `approve` call comes before any verdict about access control, so the
   whole check ends INCONCLUSIVE. **TERBUKTI** (code reading)

## 2. Does Stellar CLI v28 take positional arguments?

**No. TERBUKTI.** Stellar CLI 28.0.0, simulations with `--send=no` on our
reference vault `CAMDXP2Q…YTNF`:

- `-- approve --help` prints `Usage: approve [OPTIONS]`. Every argument is a
  named flag (`--amount`, `--live_until_ledger`, `--owner`, `--spender`), or
  `--<arg>-file-path`.
- `-- allowance G…alice G…frank` fails with
  `error: unexpected argument 'GCPIX7…' found`, exit 2.
- `-- approve G…alice G…frank 1 <ledger>` fails the same way.
- For comparison, `-- allowance --owner G…alice --spender G…frank` returns
  `"0"`.

So "call positionally", as the original feedback suggests, cannot be done
through `stellar contract invoke`.

## 3. Options

### (a) Positional arguments

**Not possible** with Stellar CLI v28 (section 2). It could only be done by
building the transaction XDR ourselves, which is option (c3). Rejected.

### (b) Use the target's own parameter names, from its spec

The target's spec is already read in preflight (`cli/src/interface.rs`,
`stellar contract info interface --output json`). The clone runs the same
Wasm, so the same spec applies. Take `approve`'s and `allowance`'s inputs
from it and pass `--<declared name> <value>` **by position**:

- `approve`: owner, spender, amount, expiry;
- `allowance`: owner, spender.

**Mapping rule:** the types must be `address, address, i128, u32` (approve)
and `address, address` (allowance), and the result must be `i128`. If they
are not, the check does not guess; see decision 3. Sub-choices for the
names:

- **b-strict:** accept only the two known naming schemes. Position 0 is
  `owner` or `from`; position 1 is `spender`; position 2 is `amount`;
  position 3 is `live_until_ledger` or `expiration_ledger`.
- **b-anchored (recommended):** accept any names, but require position 1 to
  be named `spender`. Both standards share that name, and it guards against
  a contract that takes the same types in another order.
- **b-loose:** types and order only.

Where the names come from:

- **b1, recommended:** preflight already has the spec. Return the parsed
  `approve`/`allowance` names with the preflight result and pass them into
  `check_access_control_probing`.
  - No extra network call.
  - The same spec serves both preflight and the check.
  - Cost: the check's signature, `main.rs` and the `Preflight` struct
    change.
- **b2:** the check reads the spec itself, with one more `contract info
  interface`, right before `approve`.
  - Self-contained.
  - Costs about 1–2 s more, and parses the spec twice.

| | Advantage | Risk |
|---|---|---|
| (b) | Works for any naming, not only the two known ones; deterministic. Vaults with OZ names call exactly the same arguments as today, so their results cannot change. | Relies on the spec being correct. A spec that cannot be read needs a fallback (see c2). b-loose could pass arguments in the wrong order on a contract that uses the same types but other meanings; b-anchored and b-strict reduce that. |

### (c) Other

- **c1: retry with SEP-41 names.** Call with OZ names. On
  `unexpected argument '--owner'`, call again with `--from …
  --expiration_ledger …`.
  - Advantage: small, and needs no spec.
  - Risks:
    - It knows only two naming schemes.
    - It depends on the CLI's error wording.
    - Each retry is one more round trip. It sends nothing, because the
      parse fails first.
- **c2: label it honestly.** Classify an `unexpected argument '--…'` on
  `approve`/`allowance` as `NOT_APPLICABLE` with a new reason code (e.g.
  `token_interface_mismatch`) instead of INCONCLUSIVE `unclassified_error`.
  - Advantage: an honest status.
  - Risk: it does not make the check run; the vault still gets no verdict.
  - Use: as the fallback for (b) when the spec cannot be read, or as the
    result when the signature does not match the mapping rule.
- **c3: build the transaction XDR ourselves**, passing positional `ScVal`
  arguments.
  - Rejected. It means writing a transaction builder and RPC client next to
    the `stellar` CLI, which the architecture avoids (`rpc.rs` shells out
    for every chain call).

**Recommendation:** (b1) + b-anchored, with (c2) as the fallback.

- A vault with OZ names behaves exactly as today: same arguments, same
  result.
- A vault with SEP-41 names gets a real PASS or FAIL.
- A vault whose `approve`/`allowance` do not fit gets NOT_APPLICABLE with a
  clear reason instead of `unclassified_error`.
- Exit codes do not change for the 8 existing fixtures. For a SEP-41-named
  vault, `access_control_probing` moves from INCONCLUSIVE to a verdict, so
  that vault's exit code can change, for example from 3 to 0.

## 4. How to test

### A Testnet fixture of our own with SEP-41 names

Do not use Feng Vault. Add `contracts/sep41-names-vault`, a copy of
`contracts/reference-vault` that overrides only `allowance` and `approve`
inside the `FungibleToken` impl, with SEP-41 names, delegating to `Base`:

```rust
fn allowance(e: &Env, from: Address, spender: Address) -> i128 {
    Base::allowance(e, &from, &spender)
}
fn approve(e: &Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
    Base::approve(e, &from, &spender, amount, expiration_ledger);
}
```

Prototype result (built in a temporary folder outside the repo with
`stellar contract build`; not deployed). `stellar contract info interface
--wasm` shows:

- `approve(from, spender, amount, expiration_ledger)` and
  `allowance(from, spender)`;
- `deposit`, `withdraw`, `query_asset` and `transfer_from` exactly as in the
  reference vault.

**TERBUKTI.** So the new fixture passes the unsupported-interface probe and
reaches all 11 checks (inferred from the spec; **BELUM** run).

Proposed deployment: same constructor as the reference vault, native XLM,
`decimals_offset = 0`.

Expected results (**BELUM**):

| Run | `access_control_probing` | Whole run |
|---|---|---|
| Before the fix (CLI at `359ab50`) | INCONCLUSIVE `unclassified_error`, raw error `unexpected argument '--owner'` | 9 PASS, 1 FAIL (`donation_attack`), 1 INCONCLUSIVE, exit 1 |
| After the fix | PASS | 10 PASS, 1 FAIL (`donation_attack`), exit 1, same as the reference vault |

Optional variant: base the fixture on `contracts/positive-control-vault`
instead. `donation_attack` then passes, so the exit code itself shows the
fix: 3 before, 0 after.

### Unit tests (no network)

- The name-mapping function on saved specs:
  - `reference.json`: OZ names → `owner` / `live_until_ledger`;
  - the new fixture's spec: SEP-41 names → `from` / `expiration_ledger`;
  - a synthetic spec with position 1 not named `spender`, swapped types, or
    a missing `approve` → no mapping (c2 path).
- The argument list built for `approve`/`allowance` from a mapping.
- With OZ names it must be byte-for-byte today's list.

### Regression

Run all 8 existing fixtures plus the new one, before and after, comparing
`status`, `reason_code` and exit code per check, as was done for the
unsupported-interface change (`docs/sow2/changelog.md`). The 8 existing
fixtures must match exactly. **Blind Vault first needs a Blind-token
top-up:** `bob` and `erin` were at 0 after the last regression, and one run
uses all 5,000,000 of `bob`'s and 10,000,000 of `erin`'s.

Record the new fixture in `CLAUDE.md` (test-scenario table),
`VAULT_CHECKS.md` (Demo/Validation Vaults) and `web/src/config/checks.ts`
(showcase list), only if that list should show it.

## Decisions taken (2026-11-16)

1. **Option:** (b1), names from the preflight spec, mapped by position.
2. **Strictness:** b-anchored.
3. **No fit, or spec unreadable:** NOT_APPLICABLE with `token_interface_mismatch`.
4. **Fixture base:** a copy of the **positive control**, so the exit code
   shows the change: 3 before, 0 after.
5. **Deployment and records:**
   - Deployed with `alice`.
   - Recorded in `CLAUDE.md` and `VAULT_CHECKS.md`.
   - `web/src/config/checks.ts` is left unchanged.

Implemented results are in `docs/sow2/changelog.md`.

## 5. Decisions for the user (as proposed)

1. **Option:** (b1) names from the preflight spec (recommended), (b2) the
   check reads the spec itself, or (c1) retry with SEP-41 names.
2. **Name strictness for (b):** b-anchored (`spender` required at
   position 1, recommended), b-strict (only the two known schemes), or
   b-loose (types and order only).
3. **Result when `approve`/`allowance` do not fit or the spec cannot be
   read:**
   - NOT_APPLICABLE with a new reason code, e.g. `token_interface_mismatch`
     (recommended). The web shows `not_applicable` already; a new reason
     code needs no web change.
   - Or keep INCONCLUSIVE `unclassified_error`, as today.
4. **Fixture base:** a copy of the reference vault (recommended; mirrors
   Feng Vault), or of the positive control vault (exit code visibly 3 → 0).
5. **Deploying the new fixture on Testnet:**
   - with which identity (e.g. `alice`);
   - whether its address goes into the `CLAUDE.md` / `VAULT_CHECKS.md`
     fixture tables;
   - whether it goes into `web/src/config/checks.ts`.
