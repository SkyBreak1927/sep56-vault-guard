# Aegis Vault Guideline — How It Works & Security Findings

*Internal team document — not part of the official Stellar Instawards deliverable.*

## 1. Executive Summary

**Plain language:** Aegis Vault is an "automated auditor" for vaults on the Stellar network. A vault is a smart contract where people deposit assets and receive "shares" as proof of ownership (similar to an automated savings account). Aegis Vault checks whether a given vault is built correctly and safely, before it's trusted with real user funds.

**Technical:** A Rust-based CLI that runs 11 automated checks (7 conformance + 4 adversarial) against smart contract vaults implementing the SEP-56 standard on Soroban (Stellar's smart contract platform), with a companion web dashboard for visualizing results.

## 2. Background: What is SEP-56 & Why This Tool Matters

SEP-56 is a proposed Stellar ecosystem standard defining how a "tokenized vault" should behave — conceptually similar to ERC-4626 on Ethereum. It defines both the interface (deposit, withdraw, mint, redeem, etc.) and expected behavior (e.g., rounding must always favor the vault, never the user).

The problem: anyone can build a vault claiming SEP-56 compliance, but the implementation can be wrong or contain security holes. No standard validation tool existed in the Stellar ecosystem for this — that gap is what Aegis Vault fills, and is the reason this project was funded under the Stellar Instawards program.

## 3. How Aegis Vault Works

High-level flow:

1. The user runs the CLI (`sep56-vault-guard`), pointing it at a target vault contract address (or defaulting to our reference vault)
2. The CLI calls `stellar contract invoke` as a subprocess to communicate with the vault on-chain (testnet)
3. For **positive conformance checks**: the CLI calls the target vault's functions directly and compares results against the standard's expectations
4. For **security/adversarial checks**: the CLI deploys a throwaway clone of the vault (based on the target's wasm hash & parameters — never touching the real vault's state), then simulates attacks against that clone. This matters: **security checks never touch a real production vault**, so it's safe to run against anyone's vault
5. Results (PASS/FAIL + detail) are printed to the terminal or as JSON, and can be displayed on the web dashboard

## 4. Detail of the 11 Checks

### Positive Conformance (7 checks)

| Check | Plain Explanation | Technical Mechanism |
|---|---|---|
| `total_assets` | Vault reports correct total assets | Calls `total_assets()`, sanity-checks the value |
| `deposit` | Depositing assets mints the correct shares | `deposit()` compared against `preview_deposit()` |
| `mint` | Requesting specific shares pulls correct assets | `mint()` compared against `preview_mint()` |
| `withdraw` | Withdrawing assets burns correct shares | `withdraw()` compared against `preview_withdraw()` |
| `redeem` | Redeeming shares yields correct assets | `redeem()` compared against `preview_redeem()` |
| `convert_to_shares` | Asset→share conversion is consistent | Round-trip check (offset-agnostic) |
| `convert_to_assets` | Share→asset conversion is consistent | Round-trip check (offset-agnostic) |

### Security / Adversarial (4 checks)

| Check | Plain Explanation | Technical Mechanism |
|---|---|---|
| `donation_attack` | Try to exploit the vault via direct donation outside `deposit()` | Deploy a clone, attacker deposits 1 stroop then donates a large amount directly, check whether the next victim still gets proportional shares |
| `overflow_protection` | Try to trigger arithmetic overflow with extreme values | Deposit `i128::MAX`, check for clean failure (not a silent wrong result) |
| `rounding_direction` | Ensure rounding always favors the vault, never the user | Compare `deposit`/`mint` results against idealized values, check rounding direction |
| `access_control_probing` | Try to withdraw funds without authorization | Test unauthorized withdrawal, and operator allowance limits |

## 5. Case Study: The Donation Attack Finding

**In plain terms:** Imagine a brand-new vault with no depositors yet. An "attacker" becomes the first depositor with a tiny amount (1 stroop), then quietly "donates" a large sum directly to the vault's balance, bypassing the normal deposit process. When a real depositor (the victim) arrives and deposits normally, the math breaks — the victim receives 0 shares, instead of a proportional amount for their deposit.

**Technical detail (from actual testing):**
- Attacker deposits 1 stroop via `deposit()` → receives the first share
- Attacker donates 100,000,000 stroops directly to the vault (bypassing `deposit()`)
- Victim deposits 5,000,000 stroops → receives **0 shares** (should be ~5,000,000 at a 1:1 ratio)
- Confirmed on fresh vault `CAYTWFAAJREXQ2TEOO4L7ZG6733PIJUOO6KLF2JZN6ZCIA62OX7GCOJP`, `decimals_offset=0`

This is a real vulnerability confirmed on our own reference vault — not a theoretical simulation. Standard mitigations: a `decimals_offset`/virtual shares approach, or burning a minimum initial deposit as dead shares.

## 6. Generalization Validation (Vault A & B)

To prove Aegis Vault can detect more than one coincidental case, we deployed 2 additional vaults under different conditions:

**Vault A** — the same reference vault, but with `decimals_offset` raised to 6 (instead of 0). Initial hypothesis: this would make `donation_attack` PASS. **Actual result: still FAIL.** This finding is important — it reinforces the point above. Raising `decimals_offset` proportionally increases the cost of the attacker's *initial deposit*, but the raw donation amount isn't scaled by the offset. If the donation is large enough relative to the victim's deposit, the attack still succeeds. This means `decimals_offset` is **not an automatic mitigation** — it must be combined with other protections.

**Vault B** — a vault with a deliberately introduced bug: the rounding direction in `convert_to_shares`/`convert_to_assets` was reversed (favoring the user, violating SEP-56). Result: `rounding_direction` correctly FAILED, with a precise error message identifying the issue. This confirms the check is a genuine **true negative detector** — not just always passing without meaning.

## 7. Running the Tool

```bash
# Clone & build
git clone https://github.com/SkyBreak1927/sep56-vault-guard.git
cd sep56-vault-guard
cargo build --release

# Run against the reference vault (default)
./target/release/sep56-vault-guard

# Run against a specific vault
./target/release/sep56-vault-guard --vault <CONTRACT_ADDRESS>

# JSON output (for automated integration/parsing)
./target/release/sep56-vault-guard --output json
```

Results can also be viewed directly on the web dashboard with no installation required: **https://skybreak1927.github.io/sep56-vault-guard/**

## 8. Project Status

| Phase | Status |
|---|---|
| Week 1 — Foundation & Core Engine | ✅ Complete |
| Week 2 — Full Test Suite (11 checks) | ✅ Complete |
| Week 3 — Third-Party Vault Validation (Cushion/Microvault) | ⏸️ Blocked on operator permission (outside team's control) |
| Week 4 — Documentation & Release (README, SECURITY.md, cleanup, v0.1.0 tag, demo vaults A/B) | ✅ Complete |
| Demo recording & Completion Report | 🔄 In progress |

## 9. References & Links

- **GitHub repo:** https://github.com/SkyBreak1927/sep56-vault-guard
- **Live web dashboard:** https://skybreak1927.github.io/sep56-vault-guard/
- **README.md** — overview & installation/usage
- **SECURITY.md** — full detail of all security findings
- **VAULT_CHECKS.md** — Vault A & B test results
