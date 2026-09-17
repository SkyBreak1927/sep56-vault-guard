# Aegis Vault — SEP-56 Conformance Checker

A CLI tool (with companion web UI) for testing the conformance and security
of Soroban-based tokenized vault contracts against the [SEP-56](https://github.com/stellar/stellar-protocol/discussions/1826)
standard on the Stellar network.

Built for the Stellar Instawards program.

## Features

Aegis Vault runs two categories of checks against a deployed SEP-56 vault contract:

### Positive Conformance
Verifies the vault correctly implements the SEP-56 interface:
- `total_assets`
- `deposit`
- `mint`
- `withdraw`
- `redeem`
- `convert_to_shares`
- `convert_to_assets`

### Security / Adversarial
Probes the vault against known attack vectors on tokenized vault standards:
- `donation_attack` — inflation/donation attack simulation
- `overflow_protection` — arithmetic overflow handling
- `rounding_direction` — verifies rounding favors the vault, not the attacker
- `access_control_probing` — unauthorized operator/allowance handling

## Live Results

A hosted instance of the checker output (run against our own reference vault)
is available at:

**https://skybreak1927.github.io/sep56-vault-guard/**

> ⚠️ Note: our reference vault currently **fails** the `donation_attack` check —
> a real inflation-attack vulnerability was confirmed under `decimals_offset=0`.
> See [SECURITY.md](./SECURITY.md) for details.

## Installation

```bash
git clone https://github.com/SkyBreak1927/sep56-vault-guard.git
cd sep56-vault-guard
cargo build --release
```

Requires the [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (v28.0.0+) installed and configured with a funded testnet identity.

## Usage

```bash
# Run against the default reference vault (text output)
./target/release/sep56-vault-guard

# Run against a specific deployed vault contract
./target/release/sep56-vault-guard --vault <CONTRACT_ADDRESS>

# Get machine-readable JSON output
./target/release/sep56-vault-guard --output json
```

## Project Structure

```
sep56-vault-guard/
├── cli/                    # CLI engine (Rust)
├── contracts/
│   └── reference-vault/    # OpenZeppelin-pattern reference SEP-56 vault
└── web/                    # Static web UI (results dashboard)
```

## Scope & Limitations

This tool performs functional conformance and adversarial testing — it is **not**
a substitute for a formal third-party security audit. See [SECURITY.md](./SECURITY.md)
for known findings and limitations.

## License

MIT — see [LICENSE](./LICENSE)
