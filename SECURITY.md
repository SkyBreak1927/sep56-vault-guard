# Security

This document records the results of Aegis Vault's security/adversarial checks
run against our bundled reference SEP-56 vault (`contracts/reference-vault`).
It exists to give an honest, primary-source account of what each check actually
found — and, just as importantly, what a PASS result does and does not prove.

## Summary

| Check | Result | Severity |
|---|---|---|
| `donation_attack` | ❌ FAIL** | Critical |
| `overflow_protection` | ✅ PASS* | — |
| `rounding_direction` | ✅ PASS*** | — |
| `access_control_probing` | ✅ PASS | — |

\* See caveat below — this result does not confirm the vault's own overflow-protection logic.
\*\* Still FAILs even at `decimals_offset=6` (Vault A) — see §1a below.
\*\*\* Confirmed to actually detect a real violation, not just pass vacuously — see the Vault B self-validation note in §3.

## 1. Donation / Inflation Attack — VULNERABLE

**Status:** FAIL
**Severity:** Critical

On a fresh vault, an attacker can front-run the first depositor:

1. Attacker deposits 1 stroop via `deposit()`, receiving the first share.
2. Attacker then donates 100,000,000 stroops directly to the vault, bypassing `deposit()`.
3. Victim deposits 5,000,000 stroops and receives **0 shares** — instead of the ~5,000,000 shares expected at a proportional 1:1 ratio.

Result: the victim's deposit is absorbed into the vault with no shares minted. In
this test run the attacker still ended with a net loss of 47,500,000 stroops
(spent 100,000,001, redeemed 52,500,001) — but that loss shrinks or reverses as
more victims deposit, since each subsequent victim's assets flow proportionally
to the attacker's single existing share.

**Confirmed on:** fresh vault `CAYTWFAAJREXQ2TEOO4L7ZG6733PIJUOO6KLF2JZN6ZCIA62OX7GCOJP`, `decimals_offset=0`.

**Recommendation:** adopt a standard mitigation — e.g. a `decimals_offset`/virtual
shares approach, or burning a minimum initial deposit as dead shares — so a
fresh vault can't be manipulated before any real depositor arrives.

### 1a. Follow-up: raising `decimals_offset` did NOT fix it

We deployed a second vault (**Vault A**, `CAWUBSRHD4DUDWAJENO7XHI3QVEXKIU3ZZ4HRM3RFZ4PNBSCCYXH4VTA`) —
identical code, `decimals_offset=6` instead of `0` — specifically to test
whether raising the offset, the standard recommended mitigation, actually
neutralizes this attack. It did not: re-running the exact same attack
(1-stroop dust deposit, 100,000,000-stroop donation, 5,000,000-stroop victim
deposit) still left the victim with only **99,999 shares out of the
5,000,000,000,000 they were fairly owed at this offset (~0%)**.

Why: `decimals_offset` scales the attacker's own dust deposit and the "fair"
share baseline together, but it does **not** scale the raw donation amount —
that's a plain asset transfer, unaffected by the offset. Our fixed donation
(100,000,000 stroops) is ~20x the victim's deposit (5,000,000 stroops)
regardless of offset, and that ratio is what actually drives the dilution.

**Revised recommendation:** `decimals_offset` raises the *cost* of this
attack for the attacker (see the P&L analysis above) but is not on its own a
guarantee of victim safety against a well-funded attacker. Pair it with a
deployment-time safeguard — e.g. the deployer seeding a non-trivial initial
deposit themselves — rather than relying on offset alone.

## 2. Overflow Protection — PASS, with an important caveat

**Status:** PASS (clean failure, not a silent wrong result)

Depositing `i128::MAX` assets into a fresh vault failed cleanly — the `stellar`
CLI call returned a non-zero exit with no output, and `total_assets` remained
unchanged at 0. No silently-wrong result was observed.

**Caveat:** for a native XLM underlying asset, this failure is triggered by the
Stellar Asset Contract's own `i64` amount ceiling ("spent amount is too large
for an i64") — a limit outside the vault's control — reached *after* the
vault's own share-conversion math had already run successfully (confirmed via
an internal `total_assets()` call inside `preview_deposit` executing without
error).

In other words: this check confirms failure is clean, not silent — it does
**not** confirm the vault's own overflow-protection arithmetic, since that
math was never actually pushed to its overflow point in this scenario. A more
conclusive test would need an underlying asset without Stellar's native `i64`
ceiling.

## 3. Rounding Direction — PASS

Tested on a fresh vault at a fractional share ratio (seed 1000 + donation 500):

- `deposit(100)` minted 66 shares, matching `preview_deposit()` — rounds down (favors the vault).
- `mint(100 shares)` pulled 151 assets, matching `preview_mint()` — rounds up, and strictly greater than the idealized `convert_to_assets()` value of 150.

Rounding direction consistently favors the vault over the user in both
directions, as SEP-56 requires.

**Confirmed on:** fresh vault `CDPGF4E6UQUPZKG4YMWXN2WGSOAR2QZJD6ZVB65XFTSSFL6D7OAMOBIM`.

**Self-validation (does this check actually catch a real bug?):** we deployed
a second contract, **Vault B** (`CAZBXMYP5TQWEHCFMUD6ZEON7DUWAC2BCKNCKKVBIRX7GZN7M6I2P6HV`,
source in `contracts/rounding-bug-vault`), with `convert_to_shares`/
`convert_to_assets` deliberately overridden to round **up** instead of down —
the opposite of what SEP-56 requires. This check correctly failed against
it: `mint()` pulled 151 assets, no longer strictly greater than the (now
also rounded-up) `convert_to_assets()` value of 151. Confirms the check
detects a genuine violation rather than passing vacuously.

## 4. Access Control Probing — PASS

Tested allowance-gated withdrawals on a fresh vault:

- An unauthorized withdrawal (no approval) was correctly rejected.
- After the owner approved an operator for 1,000,000 shares, the operator withdrew 500,000 shares — allowance decremented exactly to 500,000.
- The operator's attempt to withdraw beyond the remaining allowance (600,000 > 500,000 remaining) was correctly rejected, with the allowance left untouched at 500,000.

**Confirmed on:** fresh vault `CBU4U3WPV3ONGXGO3UGIAWT3QF3VLNJST27JTIZJJVCNJKQDBK72IRB5`.

## Scope

These findings apply to the bundled reference vault implementation
(`contracts/reference-vault`) only. They are not a statement about the
security of any third-party SEP-56 vault — running Aegis Vault against your
own contract produces an equivalent report for it.

Vault A and Vault B (referenced above) are additional testnet deployments
used only to validate that the checker's findings generalize correctly —
Vault A confirms the `decimals_offset` follow-up finding isn't specific to
offset `0`, and Vault B is a deliberately buggy negative control confirming
`rounding_direction` detects a real violation. Neither represents a
third-party vault under audit. See [VAULT_CHECKS.md](./VAULT_CHECKS.md) for
full per-check results on both.

## Reporting a Vulnerability

If you find a security issue in the Aegis Vault **checker itself** (not in a
vault you tested with it), please open a private security advisory on GitHub
rather than a public issue.
