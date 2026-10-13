import { field, text, unverified, verified } from '../blocks'
import type { DocsPage } from '../types'

export const conformance: DocsPage = {
  slug: 'conformance',
  tag: 'Checks',
  title: 'Conformance checks',
  lead: "Seven checks that call the core SEP-56 functions on the target vault itself and compare the results with the vault's own previews.",
  sections: [
    {
      id: 'about',
      title: 'Before you run them',
      blocks: [
        verified(
          "These checks change the target vault's state. They run in sequence as the `alice` account and use real Testnet `deposit`, `mint`, `withdraw` and `redeem` calls.",
        ),
        text(
          'Each check compares an executed call with the matching `preview_*` value computed just before it, instead of assuming a 1:1 share price, so the checks hold at any share-to-asset ratio.',
        ),
      ],
    },
    {
      id: 'total_assets',
      title: 'total_assets',
      blocks: [
        field('WHAT IT ASSERTS', '`total_assets()` can be called and returns a valid, non-negative `i128`.'),
        field('MUTATES TARGET VAULT', 'Yes, as one of the 7 conformance checks.'),
        unverified(
          'Not yet proven whether `stellar contract invoke` sends a transaction for this view function. The statement follows the project README and `VAULT_CHECKS.md`, which count all 7 conformance checks as changing the vault.',
        ),
        field('SEP-56 REFERENCE', 'Interface, `fn total_assets`.'),
      ],
    },
    {
      id: 'deposit',
      title: 'deposit',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'Depositing 5,000,000 units of the underlying asset mints exactly the shares that `preview_deposit()` returned just before, and `total_assets()` rises by exactly the deposited amount. Since v0.4.0 it also reads `max_deposit(alice)` before the call and `total_supply()` before and after: `max_deposit` must not be smaller than the deposited amount, and `total_supply` must rise by exactly the shares minted.',
        ),
        field('MUTATES TARGET VAULT', 'Yes.'),
        field('FUNCTIONS CALLED', '`max_deposit`, `total_supply`, `preview_deposit`, `deposit`, `total_assets`'),
        field('SEP-56 REFERENCE', 'Interface, `fn deposit`. The Deposit event is not checked.'),
      ],
    },
    {
      id: 'mint',
      title: 'mint',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'Minting 3,000,000 shares pulls in exactly the assets `preview_mint()` returned just before, and `total_assets()` rises by exactly that amount. Since v0.4.0: `max_mint(alice)` must not be smaller than the shares minted, and `total_supply` must rise by exactly those shares.',
        ),
        field('MUTATES TARGET VAULT', 'Yes.'),
        field('FUNCTIONS CALLED', '`max_mint`, `total_supply`, `preview_mint`, `mint`, `total_assets`'),
        field('SEP-56 REFERENCE', 'Interface, `fn mint`.'),
      ],
    },
    {
      id: 'withdraw',
      title: 'withdraw',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'Withdrawing a fixed amount of assets burns exactly the shares `preview_withdraw()` returned just before, and `total_assets()` falls by exactly the withdrawn amount. Since v0.4.0: `max_withdraw(alice)` must not be smaller than the amount withdrawn, and `total_supply` must fall by exactly the shares burned.',
        ),
        field('MUTATES TARGET VAULT', 'Yes.'),
        field('FUNCTIONS CALLED', '`max_withdraw`, `total_supply`, `preview_withdraw`, `withdraw`, `total_assets`'),
        field('SEP-56 REFERENCE', 'Interface, `fn withdraw`. The Withdraw event is not checked.'),
      ],
    },
    {
      id: 'redeem',
      title: 'redeem',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'Redeeming a fixed amount of shares returns exactly the assets `preview_redeem()` returned just before, and `total_assets()` falls by exactly that amount. Since v0.4.0: `max_redeem(alice)` must not be smaller than the shares redeemed, and `total_supply` must fall by exactly those shares.',
        ),
        field('MUTATES TARGET VAULT', 'Yes.'),
        field('FUNCTIONS CALLED', '`max_redeem`, `total_supply`, `preview_redeem`, `redeem`, `total_assets`'),
        field('SEP-56 REFERENCE', 'Interface, `fn redeem`.'),
      ],
    },
    {
      id: 'limits-and-supply',
      title: 'How max_* and total_supply are judged',
      blocks: [
        text(
          'A missing `max_*` or `total_supply` function, a reply that is not a non-negative number, a `max_*` smaller than the amount just executed, or a `total_supply` that did not change by exactly the shares makes the check `FAIL`. An unreachable network, a token transfer rejected for insufficient balance, and any other error the tool cannot classify make it `INCONCLUSIVE` (exit code `3` when nothing failed).',
        ),
        verified('Added in v0.4.0. The six project test vaults that predate the Positive Control Vault gave the same results before and after this change.'),
        unverified(
          'From reading the code, a `max_*` or `total_supply` function that exists but reverts ends as `INCONCLUSIVE` with `unclassified_error`, not as `FAIL`. This has not been tested against a vault whose `max_*` or `total_supply` actually reverts.',
        ),
        unverified(
          'The `max_*` assertion is a lower bound only: it checks that the limit allows the amount just executed, not that the limit is the exact value the vault should report.',
        ),
      ],
    },
    {
      id: 'convert_to_shares',
      title: 'convert_to_shares',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'Round trip: `convert_to_assets(convert_to_shares(x))` does not exceed `x`, and `convert_to_shares()` does not change `total_assets()`.',
        ),
        field('MUTATES TARGET VAULT', 'Yes, as one of the 7 conformance checks.'),
        unverified(
          'Not yet proven whether `stellar contract invoke` sends a transaction for this view function. The statement follows the project README and `VAULT_CHECKS.md`, which count all 7 conformance checks as changing the vault.',
        ),
        field('SEP-56 REFERENCE', 'Interface, `fn convert_to_shares` ("rounded down").'),
        text(
          'The check uses "does not exceed" rather than "equals": two rounded-down divisions can lose a unit but never gain one, so exact equality only holds by coincidence. A round trip that creates value still fails.',
        ),
      ],
    },
    {
      id: 'convert_to_assets',
      title: 'convert_to_assets',
      blocks: [
        field(
          'WHAT IT ASSERTS',
          'Round trip in the other direction: `convert_to_shares(convert_to_assets(x))` does not exceed `x`, and `convert_to_assets()` does not change `total_assets()`.',
        ),
        field('MUTATES TARGET VAULT', 'Yes, as one of the 7 conformance checks.'),
        unverified(
          'Not yet proven whether `stellar contract invoke` sends a transaction for this view function. The statement follows the project README and `VAULT_CHECKS.md`, which count all 7 conformance checks as changing the vault.',
        ),
        field('SEP-56 REFERENCE', 'Interface, `fn convert_to_assets` ("rounded down").'),
      ],
    },
  ],
}
