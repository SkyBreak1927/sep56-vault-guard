import { list, text, unverified } from '../blocks'
import type { DocsPage } from '../types'

export const limitations: DocsPage = {
  slug: 'limitations',
  tag: 'Reference',
  title: 'Known limits',
  lead: 'What the checker does not cover, and where its results need care.',
  sections: [
    {
      id: 'scope',
      title: 'Scope',
      blocks: [
        list(
          'The checker checks 7 core SEP-56 functions and four basic security risks. It is functional and adversarial testing, not a substitute for a formal third-party security review.',
          'Testnet only. There is no option for another network.',
          'The Deposit and Withdraw events are not checked.',
          'The `max_*` reads check a lower bound only, not the exact limit a vault should report.',
          '`convert_to_shares` and `convert_to_assets` check a round-trip bound, not that every conversion rounds down.',
        ),
      ],
    },
    {
      id: 'vault-design',
      title: 'Vault design requirements',
      blocks: [
        list(
          'The four security checks need a constructor of `(name, symbol, asset, decimals_offset)` and a `query_asset` function. Other argument names give `NOT_APPLICABLE` on those four. Details: `docs/INTEGRATE.md` in the repository, section \'Constructor requirements for the security checks\'.',
          'A constructor that requires an argument the checks do not send is expected to end as `INCONCLUSIVE`, not `NOT_APPLICABLE`. This has not been seen on a real vault.',
          "At `decimals_offset = 0`, `overflow_protection` does not test the vault's own overflow protection.",
        ),
      ],
    },
    {
      id: 'findings',
      title: 'Known finding',
      blocks: [
        text(
          "`donation_attack` fails on the reference vault. With a 100,000,000-unit donation against a 1-unit deposit, a victim depositing 5,000,000 units received 0 shares. Raising `decimals_offset` to 6 did not change the verdict, and burning 1,000 shares in the constructor raised the victim's shares only to 100. Details are in `SECURITY.md` on GitHub.",
        ),
      ],
    },
    {
      id: 'platforms',
      title: 'Platform testing',
      blocks: [
        list(
          'Windows x86_64: the v0.3.0 binary was run from `cmd` against the Testnet reference vault (10 PASS, 1 FAIL). The v0.4.0 binary was checked with `--version` only.',
          'Linux x86_64: built and glibc-checked in CI, not run by the maintainer.',
          'macOS universal: built and smoke-tested in CI. Not run against Testnet on macOS; Gatekeeper behaviour for a browser download not tried.',
        ),
        unverified(
          'The Windows and Linux binaries are not signed. The macOS binary is ad-hoc signed (`.github/workflows/release.yml`), not Developer-ID signed and not notarized. Gatekeeper behaviour for a browser download has not been tried.',
        ),
      ],
    },
    {
      id: 'custom-token',
      title: 'Custom token vaults',
      blocks: [
        list(
          'The minimum token balances were measured on one vault only.',
          "A short balance is recognised by reading the paying account's balance after a token transfer is rejected. If that read fails, the result stays `unclassified_error`. This was run on Testnet with the repository's test token only.",
          'The older rule for the native asset (a failed transfer with a negative resulting balance) is kept as a fallback. It has not been shown to match in a real run.',
          'Not tested: a vault with a custom token at `decimals_offset = 0`, classic assets exposed as a Stellar Asset Contract (including trustlines), tokens with other than 7 decimals.',
        ),
      ],
    },
  ],
}
