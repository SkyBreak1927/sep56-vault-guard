import { field, text, verified } from '../blocks'
import type { DocsPage } from '../types'

export const security: DocsPage = {
  slug: 'security',
  tag: 'Checks',
  title: 'Security checks',
  lead: 'Four checks that deploy a throwaway copy of the vault and probe it for known risks. The target vault is only read.',
  sections: [
    {
      id: 'how',
      title: 'How the copy is made',
      blocks: [
        text(
          "Each check reads the target's Wasm hash, underlying asset (`query_asset`) and `decimals_offset` (the vault's `decimals()` minus the asset's `decimals()`), deploys a fresh copy with that configuration, and runs its scenario on the copy.",
        ),
        text(
          'The vault must accept a constructor of `(name, symbol, asset, decimals_offset)` and expose `query_asset`. Otherwise the four checks end as `NOT_APPLICABLE` (`constructor_mismatch` or `not_a_standard_vault`). The 7 conformance checks still run.',
        ),
      ],
    },
    {
      id: 'donation_attack',
      title: 'donation_attack',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          "Simulates the donation (inflation) attack: an attacker deposits 1 unit, transfers 100,000,000 units directly to the vault's address, then a victim deposits 5,000,000 units normally.",
        ),
        field(
          'PASS WHEN',
          'The victim receives at least 90% of the shares they would proportionally be owed. Attacker profit or loss is recorded as context only.',
        ),
        field('ACCOUNTS', '`grace` (attacker), `bob` (victim)'),
        field('SEP-56 REFERENCE', 'Notes On Decimals Offset; Security Concerns, "Empty vault attack".'),
        verified(
          'This check fails on every project test vault except the Positive Control Vault, a positive control calibrated after the parameters of `donation_attack` were known (11 of 11 on Testnet; only one donation size was tested; see `VAULT_CHECKS.md`). On the reference vault the victim received 0 shares. A finding on this check is a security risk, not a violation of an Interface function.',
        ),
      ],
    },
    {
      id: 'overflow_protection',
      title: 'overflow_protection',
      blocks: [
        field('WHAT IT ASSERTS', '`deposit(i128::MAX)` on a fresh copy fails cleanly: an error is returned and `total_assets()` stays at 0.'),
        field('ACCOUNT', '`carol`'),
        field('SEP-56 REFERENCE', 'Security Concerns, "Overflow Protection" and "Data Validation".'),
        verified(
          "With `decimals_offset` of 1 or more, the vault's own checked arithmetic rejects the call. With `decimals_offset = 0`, the rejection comes from the asset's transfer instead, so the vault's own overflow protection is not tested. The result detail says which case applies.",
        ),
      ],
    },
    {
      id: 'rounding_direction',
      title: 'rounding_direction',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'At a deliberately fractional share price, `deposit()` rounds shares down (matching `preview_deposit()`), and `mint()` rounds the assets charged up (matching `preview_mint()` and above `convert_to_assets()`). Rounding favours the vault, never the user.',
        ),
        field('ACCOUNT', '`dave`'),
        field(
          'SEP-56 REFERENCE',
          'Security Concerns, "Rounding Errors and Precision Loss"; Interface doc comments ("rounded down" / "rounded up").',
        ),
        verified("The check fails on the project's Vault B, which was built with a deliberate rounding bug."),
      ],
    },
    {
      id: 'access_control_probing',
      title: 'access_control_probing',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'An operator withdrawing for an owner without `approve()` is rejected. After the owner approves a limited allowance, a withdrawal within it succeeds and the allowance drops by exactly the amount spent. A withdrawal above the remaining allowance is rejected and leaves the allowance unchanged.',
        ),
        field('ACCOUNTS', '`erin` (owner), `frank` (operator)'),
        field(
          'SEP-56 REFERENCE',
          'Design Rationale, Authorization Pattern; Security Concerns, "Authorization and Permissions"; Dependencies (SEP-41).',
        ),
      ],
    },
  ],
}
