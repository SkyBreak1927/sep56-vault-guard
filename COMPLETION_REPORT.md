# Aegis Vault — Completion Report

**Instawards Program — Stellar Chapter Ambassador Indonesia**
**Builder:** Feby Mara Pandebu | **Ambassador Chapter Lead:** Kenny Rivaldi

## Summary

Aegis Vault is an open-source CLI tool (with a companion hosted web UI) that runs an automated conformance and security test suite against SEP-56 tokenized vault contracts on Soroban. Over the course of this Instaward, the tool was built from scratch, validated against a self-deployed reference vault and two additional purpose-built test vaults, documented, and released publicly.

- **Repository:** https://github.com/SkyBreak1927/sep56-vault-guard
- **Live web dashboard:** https://skybreak1927.github.io/sep56-vault-guard/
- **Release:** `v0.1.0`

## Results

### Deliverable 1 — CLI Core ✅ Complete
A working Rust CLI connects to Stellar RPC, funds test accounts via Friendbot, and invokes core SEP-56 vault functions against any deployed contract address. Generalized via `--vault <contract_address>`, resolving wasm hash, `decimals_offset`, and underlying asset dynamically per target — not hardcoded to the reference vault.

### Deliverable 2 — Full Test Suite ✅ Complete
11 total checks implemented and passing/failing as expected:

**Positive conformance (7):** `total_assets`, `deposit`, `mint`, `withdraw`, `redeem`, `convert_to_shares`, `convert_to_assets` — all validated against `preview_*()` functions and round-trip consistency.

**Security/adversarial (4):** `donation_attack`, `overflow_protection`, `rounding_direction`, `access_control_probing` — each mapped to a specific SEP-56 risk area flagged in the specification itself. Full detail in [SECURITY.md](./SECURITY.md) and [VAULT_CHECKS.md](./VAULT_CHECKS.md).

**Key finding:** the `donation_attack` check identified a real, reproducible inflation-attack vulnerability on our own reference vault — a victim depositing 5,000,000 stroops received 0 shares after an attacker's 1-stroop deposit followed by a 100,000,000-stroop direct donation. This is not a theoretical risk; it was confirmed through live testnet execution.

### Deliverable 3 — Web UI, Generalization Validation & Documentation ✅ Complete (real-vault validation pending)
- Web UI hosted live via GitHub Pages, displaying real check results (not mocked)
- README.md, SECURITY.md, and this Completion Report published
- Demo recording: *[to be linked once recorded]*
- **Generalization validated against 2 additional purpose-built vaults** (in place of the two real ecosystem vaults, pending access — see Limitations):
  - **Vault A** (`decimals_offset=6`): tested the hypothesis that raising `decimals_offset` mitigates the donation attack. Result: `donation_attack` still **FAILED**. This is a meaningful finding — `decimals_offset` raises the cost of the attacker's initial deposit proportionally, but does not scale the raw donation amount, so the attack remains viable if the donation is large enough relative to the victim's deposit. `decimals_offset` alone is **not** a sufficient mitigation.
  - **Vault B** (deliberately reversed rounding direction, violating SEP-56): `rounding_direction` correctly **FAILED** with a precise diagnostic message, confirming the check is a genuine true-negative detector rather than a check that only ever passes.

## Limitations

The one item not completed as originally scoped is **validation against two live ecosystem vaults (Cushion and/or Microvault)**, called for in Week 3 of the execution plan. This requires operator authorization from those projects' teams, which was requested but has not yet been granted as of this report — an external dependency outside the builder's control.

To ensure the test suite's correctness could still be demonstrated without this access, two additional purpose-built vaults (A and B, described above) were deployed and tested instead, under deliberately varied conditions designed to prove the checker generalizes correctly and produces both true positives and true negatives — not just results on one coincidental vault.

## Recommended Next Steps

1. Continue pursuing operator access to Cushion and/or Microvault to complete the originally-scoped real-vault validation; results will be added to VAULT_CHECKS.md and the web UI once obtained.
2. As indicated in the SOW's Next-Step Alignment section, the anticipated path after this Instaward is to apply for an **SCF Build Award** to extend Aegis Vault toward a more complete platform (multi-network support, user accounts/history, CI integration) — explicitly out of scope for this 30-day engagement.
3. Publish the planned Medium article introducing Aegis Vault to attract ecosystem awareness and potential developer collaborators.

## Evidence Index

| Deliverable | Evidence |
|---|---|
| 1 | [GitHub repo](https://github.com/SkyBreak1927/sep56-vault-guard) — CLI source, usage in README.md |
| 2 | [VAULT_CHECKS.md](./VAULT_CHECKS.md) — full pass/fail reports across 3 vaults |
| 3 | [Live web UI](https://skybreak1927.github.io/sep56-vault-guard/), this Completion Report, demo recording *(pending)* |
