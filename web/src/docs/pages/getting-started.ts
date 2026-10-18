import { code, list, table, text, unverified, verified } from '../blocks'
import type { DocsPage } from '../types'

export const gettingStarted: DocsPage = {
  slug: 'getting-started',
  tag: 'Stellar Testnet',
  title: 'Getting Started',
  lead: 'Aegis Vault checks 7 core SEP-56 functions and four basic security risks of a Soroban tokenized vault, on Stellar Testnet. It is a command-line tool written in Rust. The web checker on aegisvault.site runs the same tool on a hosted backend.',
  sections: [
    {
      id: 'what-a-run-does',
      title: 'What a run does',
      blocks: [
        text('Every run makes 11 checks, in two groups.'),
        list(
          '7 conformance checks: `total_assets`, `deposit`, `mint`, `withdraw`, `redeem`, `convert_to_shares`, `convert_to_assets`.',
          '4 security checks: `donation_attack`, `overflow_protection`, `rounding_direction`, `access_control_probing`.',
        ),
        verified(
          "The 7 conformance checks change the target vault's state. They call `deposit`, `mint`, `withdraw` and `redeem` on the vault you pass to `--vault`, using Testnet funds from your own test accounts. Running the checker against a vault is not a read-only operation.",
        ),
        verified(
          "The 4 security checks never touch the target vault's state. Each one reads the target's Wasm hash, underlying asset and `decimals_offset`, deploys a throwaway copy with that configuration, and runs its scenario against the copy.",
        ),
        text('The network is fixed to Testnet. There is no option to point the checker at another network.'),
      ],
    },
    {
      id: 'requirements',
      title: 'Requirements',
      blocks: [
        list(
          'Stellar CLI v28.0.0 or newer on your `PATH`. The checker starts `stellar` directly, not through a shell. On Windows it needs a package that provides `stellar.exe`; a `stellar.cmd` or `stellar.bat` shim is not found.',
          'Seven funded Testnet identities: `alice`, `bob`, `carol`, `dave`, `erin`, `frank`, `grace`.',
          'To build from source only: a Rust toolchain that supports edition 2024 (built and tested with 1.98.1) and Git.',
        ),
      ],
    },
    {
      id: 'identities',
      title: 'Create the test identities',
      blocks: [
        text(
          'The checks use seven named accounts. They are not interchangeable: checks that run at the same time use separate accounts so they do not compete for transaction sequence numbers. Create and fund them once.',
        ),
        code(
          'bash',
          'terminal',
          `for n in alice bob carol dave erin frank grace; do
  stellar keys generate "$n" --network testnet --fund
done`,
        ),
        code(
          'powershell',
          'PowerShell',
          `foreach ($n in "alice","bob","carol","dave","erin","frank","grace") {
  stellar keys generate $n --network testnet --fund
}`,
        ),
        text(
          "If the vault's underlying asset is a custom token rather than native XLM, some accounts also need a balance of that token. See Custom token vaults.",
        ),
      ],
    },
    {
      id: 'install',
      title: 'Install',
      blocks: [
        text(
          'Download the archive for your platform and its `.sha256` file from the GitHub releases page (latest: v0.5.0).',
        ),
        table(
          ['Platform', 'File', 'Notes'],
          [
            ['Windows x86_64', '`sep56-vault-guard-windows-x86_64.zip`', 'Run from `cmd`, not by double-clicking.'],
            ['Linux x86_64', '`sep56-vault-guard-linux-x86_64.tar.gz`', 'Needs glibc 2.35 or newer (Ubuntu 22.04).'],
            [
              'macOS (Apple silicon and Intel)',
              '`sep56-vault-guard-macos-universal.tar.gz`',
              'One universal binary, macOS 11.0 or newer.',
            ],
          ],
        ),
        code('bat', 'Windows (cmd)', 'certutil -hashfile sep56-vault-guard-windows-x86_64.zip SHA256'),
        code(
          'bash',
          'Linux',
          `sha256sum -c sep56-vault-guard-linux-x86_64.tar.gz.sha256
tar -xzf sep56-vault-guard-linux-x86_64.tar.gz`,
        ),
        code(
          'bash',
          'macOS',
          `shasum -a 256 -c sep56-vault-guard-macos-universal.tar.gz.sha256
tar -xzf sep56-vault-guard-macos-universal.tar.gz`,
        ),
        text('On Windows, compare the printed hash with the contents of the `.sha256` file.'),
        unverified(
          'The Windows and Linux binaries are not signed. The macOS binary is ad-hoc signed (`.github/workflows/release.yml`), not Developer-ID signed and not notarized. Downloaded through a browser, Windows SmartScreen shows a warning; after checking the hash, choose "More info", then "Run anyway". Whether macOS Gatekeeper warns for a browser download has not been tried, so no workaround is given.',
        ),
        unverified(
          'The Linux binary is built and glibc-checked in CI but has not been run by the maintainer. The macOS binary is built and smoke-tested in CI only; it has not been run against Testnet on macOS.',
        ),
      ],
    },
    {
      id: 'build-from-source',
      title: 'Build from source',
      blocks: [
        code(
          'bash',
          'terminal',
          `git clone https://github.com/SkyBreak1927/sep56-vault-guard.git
cd sep56-vault-guard
cargo build --release -p sep56-vault-guard`,
        ),
        text(
          'Keep `-p sep56-vault-guard`. Without it, Cargo also builds the example vault contracts in `contracts/`, which the checker does not need. The binary lands at `target/release/sep56-vault-guard` (`.exe` on Windows).',
        ),
      ],
    },
    {
      id: 'first-check',
      title: 'Run your first check',
      blocks: [
        code('bat', 'Windows (cmd)', '.\\sep56-vault-guard.exe --vault <CONTRACT_ADDRESS> --output text'),
        code('bash', 'Linux / macOS', './sep56-vault-guard --vault <CONTRACT_ADDRESS> --output text'),
        text(
          "A run usually takes about a minute, because every check is a chain of Testnet round trips. It prints 11 result lines and one summary line. Without `--vault`, it checks the project's own reference vault.",
        ),
        verified(
          "Because the conformance checks change the vault's state, only run the checker against vaults you deployed yourself or the project's test vaults.",
        ),
      ],
    },
  ],
}
