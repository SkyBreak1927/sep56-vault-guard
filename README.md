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
A vault that does not is reported as `NOT_APPLICABLE` on those four checks, not
as `FAIL`:

- a constructor that does not accept those arguments gives the reason code
  `constructor_mismatch`;
- a vault without `query_asset` (or whose underlying asset has no `decimals()`)
  gives `not_a_standard_vault`.

`NOT_APPLICABLE` is not a finding about the vault, and it does not change the
exit code (see [Exit codes](#exit-codes)). The 7 conformance checks still run. A
copy that cannot be deployed for any other reason, such as an unreachable
network, is reported as `INCONCLUSIVE` instead.

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

If the vault's underlying asset is a custom token rather than native XLM, some of
these accounts also need a balance of that token. See
[docs/INTEGRATE.md](docs/INTEGRATE.md).

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
4. Run it. On Windows, from `cmd`:
   `.\sep56-vault-guard.exe --vault <CONTRACT_ADDRESS> --output text`
   On Linux:
   `./sep56-vault-guard --vault <CONTRACT_ADDRESS> --output text`

A run prints 11 result lines followed by one summary line. The process exits
with `0` when no check failed and none was inconclusive, `1` when at least one
check failed, `3` when none failed but at least one was inconclusive, and `2`
when a prerequisite is missing and no check ran. See [Exit codes](#exit-codes)
for the detail.

### Windows

Run the binary from `cmd` or another terminal, in the folder where you extracted
it:

```bat
.\sep56-vault-guard.exe --vault <CONTRACT_ADDRESS> --output text
```

Do not start it by double-clicking the `.exe`: the window closes before the
result can be read.

Before you run it, compare the SHA-256 of the zip with the contents of its
`.sha256` file:

```bat
certutil -hashfile sep56-vault-guard-windows-x86_64.zip SHA256
```

The release binary is built with the C runtime linked in statically.

The binary is not code-signed. Downloaded with `gh release download`, no
SmartScreen warning appeared on the test PC. Downloaded through a browser,
Windows SmartScreen shows a warning ("Windows protected your PC"); after you
have checked the hash, choose "More info", then "Run anyway".

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
| `0` | No check failed and none was inconclusive. Checks that do not apply to this vault do not count either way. |
| `1` | The checks ran and at least one failed. A failure always wins: a run with a failed check and an inconclusive one exits 1. |
| `2` | A prerequisite is missing. No check ran. |
| `3` | No check failed, but at least one was inconclusive: it could not reach a verdict, for example because a test account holds none of the vault's token. The vault was not fully checked. |

Each check ends as `PASS`, `FAIL`, `INCONCLUSIVE` or `NOT_APPLICABLE`. An
inconclusive check says the tool could not decide; it is not a finding about the
vault. A not-applicable check does not fit this vault's design, for example a
vault whose constructor does not take the arguments the security checks use to
deploy their copy. In `--output json` a result with either of those two statuses
also carries a `reason_code`.

The summary line is `Summary: N checks, X passed, Y failed`. When there are
inconclusive or not-applicable results, `, K inconclusive` and `, L not
applicable` follow it, each only when it is above zero.

**Reading only the exit code is not enough in one case.** `NOT_APPLICABLE` does
not change the exit code, so a run in which no check applied to the vault exits
`0`, the same as a run in which every check passed. A caller that looks only at
the exit code cannot tell them apart and should read the summary line or the JSON.

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

Honest state of testing for v0.3.0:

- **Windows x86_64:** the v0.3.0 zip was downloaded with `gh release download`,
  its SHA-256 matched the `.sha256` file, and it was run from `cmd` against the
  Testnet reference vault: 10 PASS, 1 FAIL (`donation_attack`), exit code 1.
- **Windows SmartScreen:** no warning when the zip was downloaded with
  `gh release download`; a warning when it was downloaded through a browser (see
  [Windows](#windows)).
- **Linux x86_64:** built and glibc-checked in CI (highest symbol 2.34), but not
  run by the maintainer.

## Project Structure

```
sep56-vault-guard/
├── cli/                    # CLI engine (Rust)
├── contracts/
│   └── reference-vault/    # OpenZeppelin-pattern reference SEP-56 vault
├── server/                 # Backend that runs the CLI for the web UI
└── web/                    # Landing page + check runner (Next.js, static export)
```

## Scope & Limitations

This tool performs functional conformance and adversarial testing — it is **not**
a substitute for a formal third-party security review. See
[SECURITY.md](./SECURITY.md) for known findings and limitations, and
[VAULT_CHECKS.md](./VAULT_CHECKS.md) for what each check asserts.

## License

MIT — see [LICENSE](./LICENSE)
