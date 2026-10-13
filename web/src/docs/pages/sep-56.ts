import { table, text, verified } from '../blocks'
import type { DocsPage } from '../types'

export const sep56: DocsPage = {
  slug: 'sep-56',
  tag: 'SEP-56',
  title: 'Function coverage',
  lead: 'How the 11 checks map to SEP-56, and which Interface functions the checker calls.',
  sections: [
    {
      id: 'spec',
      title: 'Specification used',
      blocks: [
        text(
          '`stellar/stellar-protocol`, `ecosystem/sep-0056.md`, Version 0.1.2, Status Draft. SEP-56 has no numbered clauses, so references use its section headings.',
        ),
      ],
    },
    {
      id: 'mapping',
      title: 'Check to SEP-56 mapping',
      blocks: [
        table(
          ['Check', 'SEP-56 section', 'Kind of reference'],
          [
            ['`total_assets`', 'Interface, `fn total_assets`', 'Function contract'],
            ['`deposit`', 'Interface, `fn deposit`', 'Function contract'],
            ['`mint`', 'Interface, `fn mint`', 'Function contract'],
            ['`withdraw`', 'Interface, `fn withdraw`', 'Function contract'],
            ['`redeem`', 'Interface, `fn redeem`', 'Function contract'],
            ['`convert_to_shares`', 'Interface, `fn convert_to_shares`', 'Function contract'],
            ['`convert_to_assets`', 'Interface, `fn convert_to_assets`', 'Function contract'],
            ['`donation_attack`', 'Notes On Decimals Offset; Security Concerns', 'Security concern'],
            ['`overflow_protection`', 'Security Concerns', 'Security concern'],
            ['`rounding_direction`', 'Security Concerns; Interface doc comments', 'Security concern'],
            [
              '`access_control_probing`',
              'Design Rationale, Authorization Pattern; Security Concerns',
              'Implementation guidance',
            ],
          ],
        ),
        text(
          'A failure in the first seven means a function did not behave as specified. A failure in the last four is a security finding, not a violation of an Interface function.',
        ),
      ],
    },
    {
      id: 'coverage',
      title: 'Interface functions called',
      blocks: [
        table(
          ['Group', 'Functions', 'How they are used'],
          [
            [
              'Checked directly (7)',
              '`total_assets`, `deposit`, `mint`, `withdraw`, `redeem`, `convert_to_shares`, `convert_to_assets`',
              'Subject of a check',
            ],
            [
              'Compared with execution (4)',
              '`preview_deposit`, `preview_mint`, `preview_withdraw`, `preview_redeem`',
              'Must match the executed call',
            ],
            [
              'Read and asserted, since v0.4.0 (5)',
              '`max_deposit`, `max_mint`, `max_withdraw`, `max_redeem`, `total_supply`',
              'Lower bound and exact supply change, inside the deposit, mint, withdraw and redeem checks',
            ],
            ['Used to build the copy (1)', '`query_asset`', 'Not a conformance assertion'],
            ['Events', '`Deposit`, `Withdraw`', 'Not checked'],
          ],
        ),
        verified('Taken from the function calls in `cli/src/checks/mod.rs` at v0.4.0.'),
      ],
    },
  ],
}
