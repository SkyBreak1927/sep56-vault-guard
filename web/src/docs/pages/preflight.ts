import { code, table, text, verified } from '../blocks'
import type { DocsPage } from '../types'

export const preflight: DocsPage = {
  slug: 'preflight',
  tag: 'CLI',
  title: 'Preflight errors',
  lead: 'Before any check runs, the CLI checks its prerequisites. If one is missing it exits with code 2 and no check runs.',
  sections: [
    {
      id: 'format',
      title: 'Error format',
      blocks: [
        text(
          'In text mode the problem and the fix are printed. With `--output json`, a single object is printed instead of the usual array:',
        ),
        code(
          'json',
          'json',
          `{
  "error": "preflight_failed",
  "code": "vault_not_a_contract",
  "problem": "…",
  "fix": "…"
}`,
          'ABBREVIATED EXAMPLE',
        ),
        text(
          'With `--output markdown`, the report has the usual title and header, the line `Result: Prerequisite missing, no checks were run`, then an `Error` section with the error, the code, a `Problem` paragraph and a `Fix` paragraph. The exit code is still 2.',
        ),
        verified(
          'A report from a real Testnet run with CLI 0.5.0 (`vault_not_a_contract`, exit code 2) is `preflight-error.md` in `docs/sample-reports/` in the GitHub repository.',
        ),
      ],
    },
    {
      id: 'codes',
      title: 'Error codes',
      blocks: [
        table(
          ['Code', 'Cause', 'What to do'],
          [
            [
              '`stellar_not_found`',
              'The `stellar` executable could not be started.',
              'Install Stellar CLI v28 or newer and put it on `PATH`. On Windows use a package that provides `stellar.exe`.',
            ],
            ['`stellar_version_too_old`', '`stellar` is older than v28.', 'Upgrade the Stellar CLI.'],
            [
              '`stellar_version_unreadable`',
              'The version printed by `stellar` could not be read.',
              'Check that `stellar --version` works in a terminal.',
            ],
            [
              '`identities_missing`',
              'One or more of the seven identities do not exist.',
              'Create them (see Getting Started).',
            ],
            [
              '`vault_address_malformed`',
              'The `--vault` value is not a valid contract address.',
              'Pass a contract address that starts with `C` and has 56 characters.',
            ],
            [
              '`vault_not_a_contract`',
              'The address is not a contract on Testnet.',
              'Check the address and that the vault is deployed on Testnet.',
            ],
          ],
        ),
        text('A thin XLM balance (under 5 XLM) is only a warning, never a reason to stop.'),
        verified(
          'Codes are taken from `cli/src/preflight.rs`. The "What to do" column is a summary; the CLI prints its own `fix` text.',
        ),
      ],
    },
  ],
}
