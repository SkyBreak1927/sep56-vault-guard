<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img alt="Aegis Vault" src="docs/assets/logo-light.svg" width="360">
  </picture>
</p>

<h3 align="center">Conformance and security checks for SEP-56 tokenized vaults on Soroban.</h3>

<p align="center">
  <a href="https://github.com/SkyBreak1927/sep56-vault-guard/releases"><img alt="Version" src="https://img.shields.io/github/v/tag/SkyBreak1927/sep56-vault-guard?label=version"></a>
  <img alt="License: MIT" src="https://img.shields.io/github/license/SkyBreak1927/sep56-vault-guard">
  <img alt="Network: Stellar Testnet" src="https://img.shields.io/badge/network-Stellar%20Testnet-blue">
  <img alt="Spec: SEP-56" src="https://img.shields.io/badge/spec-SEP--56-orange">
  <img alt="Built with Rust" src="https://img.shields.io/badge/built%20with-Rust-b7410e">
</p>

<p align="center">
  <a href="https://aegisvault.site"><b>Try it live</b></a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/INTEGRATE.md">Integration guide</a> ·
  <a href="VAULT_CHECKS.md">What each check asserts</a> ·
  <a href="web/public/aegis-vault-walkthrough-demo.mp4">Watch the demo</a>
</p>

---

A tokenized vault holds other people's funds. A vault that drifts from the
[SEP-56](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0056.md)
standard, or is open to an inflation (donation) attack, can lose them. Aegis Vault
takes the contract address of a deployed vault, runs 11 checks against it on
Stellar Testnet, and tells you which pass, which fail, and why. It is a CLI tool
with a companion web UI.

- **Paste an address, get a verdict.** 7 conformance checks and 4 security checks,
  in the browser or from the CLI.
- **Two ways in.** Already deployed a vault? Paste its address into the
  [web checker](https://aegisvault.site). Still building? Run the CLI in your own
  development environment while you work.
- **Honest results.** Each check ends as `PASS`, `FAIL`, `INCONCLUSIVE` or
  `NOT_APPLICABLE`. When the tool cannot decide, it says so instead of guessing.
- **CI-friendly.** Exit codes, plus `text`, `json` and `markdown` output.

> [!WARNING]
> Our own reference vault currently **fails** the `donation_attack` check: a real
> inflation-attack vulnerability was confirmed under `decimals_offset=0`. See
> [SECURITY.md](./SECURITY.md) for details. Aegis Vault is functional and
> adversarial testing. It is **not** a substitute for a formal third-party
> security review.

## Features

Aegis Vault runs two groups of checks against a deployed SEP-56 vault contract.

### Positive Conformance

Calls 7 core SEP-56 functions on the vault and checks their results:

- `total_assets`
- `deposit`
- `mint`
- `withdraw`
- `redeem`
- `convert_to_shares`
- `convert_to_assets`

### Security / Adversarial

Probes four basic security risks:

| Check | What it probes |
|---|---|
| `donation_attack` | Inflation / donation attack simulation |
| `overflow_protection` | Arithmetic overflow handling |
| `rounding_direction` | Verifies rounding favors the vault, not the attacker |
| `access_control_probing` | Unauthorized operator / allowance handling |

What each check asserts: [VAULT_CHECKS.md](./VAULT_CHECKS.md).

## Example run

Abridged from the unedited report in
[docs/sample-reports/reference-vault.md](docs/sample-reports/reference-vault.md)
(CLI 0.5.0, Stellar Testnet, 102 s). The Detail column is left out here; the full
report has it.

```
Result: Remediation needed
Core function checks: 7 of 7 passed
Basic security checks: 3 of 4 passed

01 total_assets            PASS
02 deposit                 PASS
03 mint                    PASS
04 withdraw                PASS
05 redeem                  PASS
06 convert_to_shares       PASS
07 convert_to_assets       PASS
08 donation_attack         FAIL
09 overflow_protection     PASS
10 rounding_direction      PASS
11 access_control_probing  PASS
```

## Live checker

The web checker runs the same CLI on a hosted backend, against Stellar Testnet:

**https://aegisvault.site**

## Quick start

**In the browser.** Open [aegisvault.site](https://aegisvault.site), paste a vault
contract address, and run the check.

**With the CLI.**

1. Install the [prerequisites](#prerequisites) and create the seven
   [testnet identities](#testnet-identities).
2. Get the binary: [download a release](#download-a-release-binary) or
   [build from source](#build-from-source).
3. Run it:

   ```bash
   ./sep56-vault-guard --vault <CONTRACT_ADDRESS> --output text
   ```

A run usually takes about a minute, sometimes longer, because every check is a
chain of network round trips to testnet. If the vault's underlying asset is a
custom token rather than native XLM, read the
[integration guide](docs/INTEGRATE.md) first.

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
  1.98.1. Only needed if you build from source.
- **Git.** Only needed if you build from source.

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
workspace, which includes the example vault contracts in `contracts/` — a
longer build that produces nothing the checker needs.

The binary lands at `target/release/sep56-vault-guard` (`.exe` on Windows).

## Download a release binary

Prebuilt binaries are attached to each release: a `.zip` for Windows x86_64, a
`.tar.gz` for Linux x86_64 and a `.tar.gz` for macOS (one universal binary for
Apple silicon and Intel), each with a `.sha256` file beside it, on the
[releases page](https://github.com/SkyBreak1927/sep56-vault-guard/releases). A
file appears there only after a `v*` tag is pushed.

Install the Stellar CLI and create the seven identities first (see
[Prerequisites](#prerequisites)), check the archive against its `.sha256` file,
extract it, and run it from a terminal. On Windows, run it from `cmd` and do not
double-click the `.exe`.

The step-by-step install, hash-check commands for each platform, the Windows
SmartScreen and macOS Gatekeeper notes, the Linux glibc requirement, and the
honest state of testing per platform are in **[docs/INSTALL.md](docs/INSTALL.md)**.

## Usage

```bash
# Run against the default reference vault (text output)
./target/release/sep56-vault-guard

# Run against a specific deployed vault contract
./target/release/sep56-vault-guard --vault <CONTRACT_ADDRESS>

# Get machine-readable JSON output
./target/release/sep56-vault-guard --output json

# Get a Markdown report
./target/release/sep56-vault-guard --output markdown > report.md
```

`--output markdown` prints a report with the same parts as the web checker's
Markdown export: a header (vault, network, spec, checker version, start and end
time), a result summary, and one table per group. It has no "Settled at" column
and no commit in the checker line, because the CLI records neither. The `text`
and `json` formats and the exit codes are the same whichever format you pick.

A run prints 11 result lines followed by one summary line. A run usually takes
about a minute, sometimes longer — every check is a chain of network round trips
to testnet.

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

Under `--output markdown` the same information is printed to standard output as
a report with an `Error` section (code, problem, fix) and no check table.

## Project structure

```
sep56-vault-guard/
├── cli/        # CLI engine (Rust)
├── contracts/  # Reference vault, plus the test vaults and test token used to verify the checker
├── server/     # Backend that runs the CLI for the web UI
├── web/        # Landing page + check runner (Next.js, deployed on Vercel)
└── docs/       # Install and integration guides, sample reports
```

## Scope & Limitations

This tool performs functional conformance and adversarial testing — it is **not**
a substitute for a formal third-party security review. See
[SECURITY.md](./SECURITY.md) for known findings and limitations,
[VAULT_CHECKS.md](./VAULT_CHECKS.md) for what each check asserts, and
[COMPLETION_REPORT.md](./COMPLETION_REPORT.md) for the project report.

Built for the Stellar Instawards program.

## License

MIT — see [LICENSE](./LICENSE)
