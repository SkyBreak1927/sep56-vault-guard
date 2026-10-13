import { code, optional, params, table, text, verified } from '../blocks'
import type { DocsPage } from '../types'

export const cli: DocsPage = {
  slug: 'cli',
  tag: 'CLI',
  title: 'Running a check',
  lead: 'Command-line options, which test account each check uses, and how long a run takes.',
  sections: [
    {
      id: 'usage',
      title: 'sep56-vault-guard',
      blocks: [
        code(
          'text',
          'terminal',
          'sep56-vault-guard [--vault <CONTRACT_ADDRESS>] [--output text|json] [--status-file <PATH>]',
          'SIGNATURE',
        ),
        params(
          [
            optional(
              '--vault',
              'string',
              "Contract address of the vault to check (starts with `C`, 56 characters). Defaults to the project's reference vault `CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF`.",
            ),
            optional('--output', 'text | json', 'Output format. Default `text`. `json` prints an array for programs.'),
            optional(
              '--status-file',
              'path',
              'Writes a JSON snapshot that is updated as each check starts and finishes. Reporting only; it never changes a result.',
            ),
            optional('--version', 'flag', 'Prints the version, for example `sep56-vault-guard 0.4.0`.'),
            optional('--help', 'flag', 'Prints usage.'),
          ],
          'PARAMETERS',
        ),
        code(
          'bash',
          'terminal',
          `# Reference vault, text output
./sep56-vault-guard

# A specific vault, JSON output
./sep56-vault-guard --vault <CONTRACT_ADDRESS> --output json

# With a live status file
./sep56-vault-guard --vault <CONTRACT_ADDRESS> --status-file ./status.json`,
          'EXAMPLE',
        ),
      ],
    },
    {
      id: 'accounts',
      title: 'Which account each check uses',
      blocks: [
        text(
          'The 7 conformance checks run one after another on the target vault. The 4 security checks run at the same time as each other and as the conformance sequence, so each has its own account.',
        ),
        table(
          ['Account', 'Check'],
          [
            ['`alice`', 'all 7 conformance checks (on the target vault)'],
            ['`grace`, `bob`', '`donation_attack` (attacker, victim)'],
            ['`carol`', '`overflow_protection`'],
            ['`dave`', '`rounding_direction`'],
            ['`erin`, `frank`', '`access_control_probing` (owner, operator)'],
          ],
        ),
      ],
    },
    {
      id: 'timing',
      title: 'Run time and network',
      blocks: [
        text(
          'A run usually takes about a minute, sometimes longer. Every chain interaction calls `stellar contract invoke` or `stellar contract deploy` against Testnet.',
        ),
        verified('The network is fixed to Testnet in `cli/src/rpc.rs`. There is no flag for another network.'),
        text(
          'Do not run two checks at the same time with the same identities: transactions from one account race on sequence numbers, and the failures would be about the collision, not about the vault.',
        ),
      ],
    },
  ],
}
