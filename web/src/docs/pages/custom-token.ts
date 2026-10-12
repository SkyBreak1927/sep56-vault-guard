import { code, list, table, text, unverified } from '../blocks'
import type { DocsPage } from '../types'

export const customToken: DocsPage = {
  slug: 'custom-token',
  tag: 'Guide',
  title: 'Custom token vaults',
  lead: "How to fund the test accounts when the vault's underlying asset is a custom Soroban token instead of native XLM.",
  sections: [
    {
      id: 'when',
      title: 'When you need this',
      blocks: [
        text("Every check moves the vault's underlying asset from one of the seven test accounts."),
        list(
          'Native XLM: Friendbot-funded accounts already hold XLM. Nothing else is needed.',
          'A custom token: five of the seven accounts need a balance of that token first. Without it, the checks that need the token end as `INCONCLUSIVE` with the reason code `insufficient_token_balance`, and the process exits with code `3`.',
        ),
        text('XLM is only needed for transaction fees. The checker warns when an identity holds less than 5 XLM.'),
      ],
    },
    {
      id: 'find-asset',
      title: 'Find the asset and its decimals',
      blocks: [
        code(
          'bash',
          'terminal',
          `stellar contract invoke --id <VAULT_ADDRESS> --source-account alice --network testnet -- query_asset
stellar contract invoke --id <VAULT_ADDRESS> --source-account alice --network testnet -- decimals
stellar contract invoke --id <TOKEN_ADDRESS> --source-account alice --network testnet -- decimals`,
        ),
        text(
          "`query_asset` prints the token's contract address. The checker derives `decimals_offset` as the vault's `decimals()` minus the token's `decimals()`.",
        ),
      ],
    },
    {
      id: 'balances',
      title: 'Minimum balances',
      blocks: [
        text("Amounts are in the token's smallest unit. The token column assumes 7 decimals."),
        table(
          ['Account', 'Used by', 'Minimum (smallest unit)', 'Tokens (7 decimals)'],
          [
            ['`alice`', 'the 7 conformance checks, on the target vault', '`5,000,000 + preview_mint(3,000,000)` = 5,003,000', '0.5003'],
            ['`grace`', '`donation_attack` (attacker)', '100,000,001', '10.0000001'],
            ['`bob`', '`donation_attack` (victim)', '5,000,000', '0.5'],
            ['`dave`', '`rounding_direction`', '1,601', '0.0001601'],
            ['`erin`', '`access_control_probing` (owner)', '10,000,000', '1.0'],
            ['`carol`', '`overflow_protection`', '0', '0'],
            ['`frank`', '`access_control_probing` (operator)', '0', '0'],
          ],
        ),
        unverified(
          "These figures were measured on a single vault: the reference vault code with `decimals_offset = 3` and the repository's 7-decimal test token. Alice's and dave's amounts depend on the vault's share price and will differ on another vault.",
        ),
        code(
          'bash',
          "size alice's amount",
          `stellar contract invoke --id <VAULT_ADDRESS> --source-account alice --network testnet -- \\
  preview_mint --shares 3000000`,
        ),
        text('Add the result to 5,000,000.'),
      ],
    },
    {
      id: 'send',
      title: 'Sending the tokens',
      blocks: [
        code(
          'bash',
          'admin mint (only if you control the token)',
          `stellar contract invoke --id <TOKEN_ADDRESS> --source-account <TOKEN_ADMIN> --network testnet -- \\
  mint --to <ACCOUNT_ADDRESS> --amount 5003000`,
        ),
        code(
          'bash',
          'transfer from a holder',
          `stellar contract invoke --id <TOKEN_ADDRESS> --source-account <HOLDER> --network testnet -- \\
  transfer --from <HOLDER> --to <ACCOUNT_ADDRESS> --amount 5003000`,
        ),
        text(
          "Repeat for `alice`, `grace`, `bob`, `dave` and `erin`. Print an account's address with `stellar keys address <name>`.",
        ),
        unverified("The measured run used the test token's admin `mint`. Sending with `transfer` from a holder has not been tested."),
      ],
    },
    {
      id: 'results',
      title: 'Reading the result',
      blocks: [
        list(
          "`INCONCLUSIVE` with `insufficient_token_balance`: a token transfer was rejected, most likely a short balance. The detail names the account, for example `test account 'alice'`. Top it up and run again. It is not a finding about the vault.",
          "If `donation_attack` ends as `INCONCLUSIVE` with `unclassified_error`, check grace's balance first. The status is right, but the reason code is not yet accurate in this case.",
          'Balances are spent by each run. Top the accounts up before running again. Testnet tokens have no monetary value.',
        ),
      ],
    },
  ],
}
