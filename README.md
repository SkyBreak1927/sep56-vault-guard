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

## What a run does to the vault

Testnet only. The network is fixed to `testnet` in `cli/src/rpc.rs`; there is no
flag to point this at mainnet.

**The 7 conformance checks change the target vault's state.** They call
`deposit`, `mint`, `withdraw` and `redeem` on the vault you pass to `--vault`,
using testnet funds from your own identities, and assert the exact `total_assets`
deltas those calls produce. Running the checker against a vault is not a
read-only operation.

**The 4 security checks run against throwaway copies.** Each one resolves the
target vault's Wasm hash, underlying asset and `decimals_offset`, deploys its own
fresh instance from that same configuration, and attacks the copy. The target
vault is only read.

Because those copies are deployed from the target's own Wasm, the 4 security
checks need the vault contract to accept a constructor of
`(name, symbol, asset, decimals_offset)` and to expose a `query_asset` function.
A vault that does not will fail those four checks on deployment, not on
behaviour.

## Prerequisites

- **[Stellar CLI](https://developers.stellar.org/docs/tools/cli) v28.0.0 or newer.**
  The checker starts the `stellar` executable directly rather than through a
  shell, so on Windows it needs a package that provides `stellar.exe` — the
  official `stellar-cli-<version>-x86_64-pc-windows-msvc` archive does. A
  `stellar.cmd` or `stellar.bat` shim works in a terminal but is not found here;
  the checker detects that case and says so before running anything.
- **A Rust toolchain new enough for edition 2024.** Built and tested with
  1.98.1.
- **Git.**

### Testnet identities

The checks use seven named identities. They are not interchangeable: concurrent
checks are given separate accounts so they do not race each other for
transaction sequence numbers.

```
alice  bob  carol  dave  erin  frank  grace
```

Create and fund them once:

```bash
# Linux / macOS
for n in alice bob carol dave erin frank grace; do
  stellar keys generate "$n" --network testnet --fund
done
```

```powershell
# Windows PowerShell
foreach ($n in "alice","bob","carol","dave","erin","frank","grace") {
  stellar keys generate $n --network testnet --fund
}
```

## Build from source

```bash
git clone https://github.com/SkyBreak1927/sep56-vault-guard.git
cd sep56-vault-guard
cargo build --release -p sep56-vault-guard
```

The `-p sep56-vault-guard` matters. Without it, Cargo builds every member of the
workspace, which includes the five example vault contracts in `contracts/` — a
longer build that produces nothing the checker needs.

The binary lands at `target/release/sep56-vault-guard` (`.exe` on Windows).

## Download a release binary

Prebuilt binaries are attached to each release: a `.zip` for Windows x86_64 and
a `.tar.gz` for Linux x86_64, each with a `.sha256` file beside it.

Install the Stellar CLI and create the seven identities first (see
[Prerequisites](#prerequisites)), then:

1. Download the archive for your platform and its `.sha256` file from the
   [releases page](https://github.com/SkyBreak1927/sep56-vault-guard/releases).
2. Check it matches. On Windows:
   `certutil -hashfile sep56-vault-guard-windows-x86_64.zip SHA256`, and compare
   against the contents of the `.sha256` file. On Linux:
   `sha256sum -c sep56-vault-guard-linux-x86_64.tar.gz.sha256`.
3. Extract the archive.
4. Run it: `sep56-vault-guard --vault <CONTRACT_ADDRESS> --output text`

A run prints 11 result lines followed by one summary line. The process exits
with `0` when all 11 checks pass, `1` when the checks ran and at least one
failed, and `2` when a prerequisite is missing and no check ran. See
[Exit codes](#exit-codes) for the detail.

### Windows

Tested on Windows 11, started both from `cmd` and by double-clicking the
`.exe`. The binary links the C runtime statically, so it needs nothing beyond
the Stellar CLI.

The binary is not code-signed. On the test PC, Windows SmartScreen did not
appear, but that is one machine and not a promise: a file downloaded through a
browser carries the Mark-of-the-Web, and on other machines or settings Windows
may show "Windows protected your PC". If it does, choose "More info", then
"Run anyway".

### Linux

x86_64 only, and it needs glibc 2.35 or newer (the version in Ubuntu 22.04).
The release workflow builds on Ubuntu 22.04 and fails if the binary asks for a
newer glibc symbol. Check yours with `ldd --version`. On a distribution with an
older glibc, build from source instead.

## Usage

```bash
# Run against the default reference vault (text output)
./target/release/sep56-vault-guard

# Run against a specific deployed vault contract
./target/release/sep56-vault-guard --vault <CONTRACT_ADDRESS>

# Get machine-readable JSON output
./target/release/sep56-vault-guard --output json
```

A run usually takes about a minute, sometimes longer — every check is a chain of
network round trips to testnet.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All 11 checks passed. |
| `1` | The checks ran and at least one failed. |
| `2` | A prerequisite is missing. No check ran. |

Exit 2 covers a `stellar` that cannot be started or is older than v28, a missing
identity, and an address that is not a contract on testnet. Under
`--output json` this prints a single object instead of the usual array:

```json
{
  "error": "preflight_failed",
  "code": "vault_not_a_contract",
  "problem": "…",
  "fix": "…"
}
```

## Platforms

Windows x86_64 and Linux x86_64. The release workflow builds both.

Honest state of testing: the Windows binary has been built, downloaded and run
end to end against the reference vault. The Linux release binary has been built
and its archive verified, but has not been run from the release artifact — the
Linux path is exercised by the backend, which runs the checker in a container.

## Project Structure

```
sep56-vault-guard/
├── cli/                    # CLI engine (Rust)
├── contracts/
│   └── reference-vault/    # OpenZeppelin-pattern reference SEP-56 vault
├── server/                 # Backend that runs the CLI for the web UI
└── web/                    # Static web UI (results dashboard)
```

## Scope & Limitations

This tool performs functional conformance and adversarial testing — it is **not**
a substitute for a formal third-party security review. See
[SECURITY.md](./SECURITY.md) for known findings and limitations, and
[VAULT_CHECKS.md](./VAULT_CHECKS.md) for what each check asserts.

## License

MIT — see [LICENSE](./LICENSE)
