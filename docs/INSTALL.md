# Installing Aegis Vault from a release

This guide covers installing the prebuilt `sep56-vault-guard` binary on Windows,
Linux and macOS, and what has and has not been tested on each platform. For the
prerequisites (Stellar CLI, the seven testnet identities) and for building from
source, see the [README](../README.md#prerequisites).

## Download a release binary

Prebuilt binaries are attached to each release: a `.zip` for Windows x86_64, a
`.tar.gz` for Linux x86_64 and a `.tar.gz` for macOS (one universal binary for
Apple silicon and Intel), each with a `.sha256` file beside it. A file appears
on the releases page only after a `v*` tag is pushed; a manual run of the
release workflow produces downloadable artifacts on the run page and no release.

Install the Stellar CLI and create the seven identities first (see
[Prerequisites](../README.md#prerequisites)), then:

1. Download the archive for your platform and its `.sha256` file from the
   [releases page](https://github.com/SkyBreak1927/sep56-vault-guard/releases).
2. Check it matches. On Windows:
   `certutil -hashfile sep56-vault-guard-windows-x86_64.zip SHA256`, and compare
   against the contents of the `.sha256` file. On Linux:
   `sha256sum -c sep56-vault-guard-linux-x86_64.tar.gz.sha256`. On macOS:
   `shasum -a 256 -c sep56-vault-guard-macos-universal.tar.gz.sha256`.
3. Extract the archive.
4. Run it. On Windows, from `cmd`:
   `.\sep56-vault-guard.exe --vault <CONTRACT_ADDRESS> --output text`
   On Linux and macOS:
   `./sep56-vault-guard --vault <CONTRACT_ADDRESS> --output text`

A run prints 11 result lines followed by one summary line. The process exits
with `0` when no check failed and none was inconclusive, `1` when at least one
check failed, `3` when none failed but at least one was inconclusive, and `2`
when a prerequisite is missing and no check ran. See
[Exit codes](../README.md#exit-codes) for the detail.

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

### macOS

One universal binary (x86_64 and arm64) in
`sep56-vault-guard-macos-universal.tar.gz`, built with a deployment target of
macOS 11.0. Extract it and run it from a terminal:

```bash
shasum -a 256 -c sep56-vault-guard-macos-universal.tar.gz.sha256
tar -xzf sep56-vault-guard-macos-universal.tar.gz
./sep56-vault-guard --vault <CONTRACT_ADDRESS> --output text
```

The checker needs the Stellar CLI v28 or newer on `PATH`; for how to install it
on macOS, see the Stellar CLI documentation linked under
[Prerequisites](../README.md#prerequisites).

The binary carries an ad-hoc code signature. It is not signed with a Developer
ID and it is not notarized, so macOS may show a warning the first time it is
opened. No workaround for that warning has been tried here, so none is given.

This build is only checked in CI. See [Platforms](#platforms) for what has and
has not been tested.

## Platforms

Windows x86_64, Linux x86_64 and macOS (universal: x86_64 and arm64). The
release workflow builds all three.

Honest state of testing:

- **Windows x86_64:** the v0.3.0 zip was downloaded with `gh release download`,
  its SHA-256 matched the `.sha256` file, and it was run from `cmd` against the
  Testnet reference vault: 10 PASS, 1 FAIL (`donation_attack`), exit code 1.
- **Windows SmartScreen:** no warning when the zip was downloaded with
  `gh release download`; a warning when it was downloaded through a browser (see
  [Windows](#windows)).
- **Linux x86_64:** built and glibc-checked in CI (highest symbol 2.34), but not
  run by the maintainer.
- **macOS universal:** built on the CI runner `macos-14`, where the binary was
  checked to contain both architectures, to link only system libraries, to carry
  a valid ad-hoc signature, and to pass a smoke test: `--help` exits 0, and
  `--vault <address> --output json` without `stellar` on `PATH` exits 2 with the
  preflight error object. Not yet tested: the x86_64 half has not been run; no
  run against Testnet has been made on macOS; Gatekeeper behavior for a copy
  downloaded through a browser has not been tried.
