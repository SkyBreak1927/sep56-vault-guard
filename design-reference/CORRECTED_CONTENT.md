# Corrected Content for Aegis Vault Web UI Redesign

The Stitch mockup (`landing-page-stitch-mockup.html` / `.png` in this folder) is a
**visual/layout reference only**. Its color system, typography and layout rules in
`DESIGN.md` are the source of truth — but its written copy contains fabricated
technical claims and an inaccurate check list. Do NOT copy the mockup's text
verbatim. Use the corrected content below instead.

## Remove entirely (fabricated, not real capabilities)
- "10,000 Fuzz Runs" / "ZK Fixed-Point Asset Math Verification" (hero stat row)
- "Polling 1,000,000 runs", "Boundary Fuzzing (10k inputs)", "Cryptographic Proof"
  (Simulation Pipeline / Interactive Vault Inspector section)
- Any invented vulnerability IDs (e.g. `VULN_SEP56_INFLATE_01`, `WARN_FEE_TRUNC_02`)
- The uppercase monospace badge pill above the hero headline (generic AI-template pattern)

## Correct hero stat row
- "11 Automated Checks" — Deterministic verification
- "Conformance + Security Suite" — Real vault behavior tested
- "Live on Soroban Testnet" — Soroban v21+ environment

## Correct 11-check list (replaces the mockup's invented list)

### Group 1 — Conformance Checks (7)
1. **Total Assets Accounting** — Vault reports total assets accurately and consistently.
2. **Deposit Conformance** — Deposit function behaves per SEP-56 spec.
3. **Mint Conformance** — Mint function behaves per SEP-56 spec.
4. **Withdraw Conformance** — Withdraw function behaves per SEP-56 spec.
5. **Redeem Conformance** — Redeem function behaves per SEP-56 spec.
6. **Convert to Shares Accuracy** — Asset→share conversion math is correct.
7. **Convert to Assets Accuracy** — Share→asset conversion math is correct.

### Group 2 — Security Checks (4)
8. **Donation/Inflation Attack Resistance** — Tests vulnerability to direct-donation
   share-price manipulation.
9. **Overflow Protection** — Tests handling of extreme values without overflow/crash.
10. **Rounding Direction Safety** — Confirms rounding always favors the vault, never the attacker.
11. **Access Control Probing** — Confirms sensitive functions are properly authorization-gated.

Do not include per-check numeric IDs, fabricated CWE/CVE-style codes, or invented
percentage/severity scores unless they come from the actual CLI output at runtime.

## Live status model (important — do not use the mockup's linear 4-step pipeline)
The mockup shows a fake linear "Step 01 → 02 → 03 → 04" pipeline. This does NOT match
how Aegis Vault actually runs: **all 11 checks execute in parallel**, and each should
report its own status independently in whatever order it finishes. The corrected UI
must render all 11 checks up front (grouped as Conformance / Security, as above), each
starting in a `pending` state, and update in place to `running` / `pass` / `fail` / `warn`
as results come in from polling — not as a fixed sequential pipeline.
