# Security

This document records the results of Aegis Vault's security/adversarial checks
run against our bundled reference SEP-56 vault (`contracts/reference-vault`).
It exists to give an honest, primary-source account of what each check actually
found — and, just as importantly, what a PASS result does and does not prove.

## Summary

| Check | Result | Severity |
|---|---|---|
| `donation_attack` | ❌ FAIL | Critical |
| `overflow_protection` | ✅ PASS* | — |
| `rounding_direction` | ✅ PASS | — |
| `access_control_probing` | ✅ PASS | — |

\* See caveat below — this result does not confirm the vault's own overflow-protection logic.

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

## Reporting a Vulnerability

If you find a security issue in the Aegis Vault **checker itself** (not in a
vault you tested with it), please open a private security advisory on GitHub
rather than a public issue.
