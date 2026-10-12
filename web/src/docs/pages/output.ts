import { code, optional, param, params, table, text, verified } from '../blocks'
import type { DocsPage } from '../types'

export const output: DocsPage = {
  slug: 'output',
  tag: 'CLI',
  title: 'Output and exit codes',
  lead: 'The four result statuses, the text and JSON formats, reason codes, exit codes and the status file.',
  sections: [
    {
      id: 'statuses',
      title: 'Result statuses',
      blocks: [
        table(
          ['Status', 'Meaning'],
          [
            ['`PASS`', "The check's assertions held."],
            ['`FAIL`', 'At least one assertion did not hold. This is a finding about the vault.'],
            [
              '`INCONCLUSIVE`',
              "The tool could not reach a verdict, for example because a test account holds none of the vault's token. Not a finding about the vault.",
            ],
            [
              '`NOT_APPLICABLE`',
              "The check does not fit this vault's design, for example a constructor the security checks cannot use to deploy their copy. Not a finding about the vault.",
            ],
          ],
        ),
      ],
    },
    {
      id: 'text-output',
      title: 'Text output',
      blocks: [
        text('11 result lines, then one summary line:'),
        code('text', 'summary line', 'Summary: N checks, X passed, Y failed'),
        text(
          '`, K inconclusive` and `, L not applicable` are appended only when above zero, for example `Summary: 11 checks, 7 passed, 0 failed, 4 inconclusive`.',
        ),
      ],
    },
    {
      id: 'json-output',
      title: 'JSON output',
      blocks: [
        text('`--output json` prints an array with one object per check, in the fixed check order.'),
        params(
          [
            param('name', 'string', 'Check id, for example `deposit`.'),
            param('category', 'string', '`Positive Conformance` or `Security/Adversarial`.'),
            param('status', 'string', '`PASS`, `FAIL`, `INCONCLUSIVE` or `NOT_APPLICABLE`.'),
            param('detail', 'string', 'Human-readable explanation with the measured values.'),
            optional('reason_code', 'string', 'Present only for `INCONCLUSIVE` and `NOT_APPLICABLE`.'),
          ],
          'FIELDS',
        ),
        code(
          'json',
          'json',
          `[
  { "name": "deposit", "category": "Positive Conformance", "status": "PASS", "detail": "…" },
  { "name": "donation_attack", "category": "Security/Adversarial", "status": "INCONCLUSIVE",
    "detail": "…", "reason_code": "insufficient_token_balance" }
]`,
          'EXAMPLE',
        ),
        verified(
          "Field names and order are taken from the CLI's unit tests. The `detail` text is shortened here; a real run prints the measured values.",
        ),
      ],
    },
    {
      id: 'reason-codes',
      title: 'Reason codes',
      blocks: [
        table(
          ['Code', 'Status', 'Meaning'],
          [
            [
              '`insufficient_token_balance`',
              'INCONCLUSIVE',
              'A token transfer a check needed was rejected, most likely a short balance on a test account.',
            ],
            ['`network_error`', 'INCONCLUSIVE', 'A network problem stopped the check.'],
            ['`unclassified_error`', 'INCONCLUSIVE', 'An error the tool could not classify. The raw error is in `detail`.'],
            [
              '`constructor_mismatch`',
              'NOT_APPLICABLE',
              "The vault's constructor does not accept `(name, symbol, asset, decimals_offset)`, so the security checks cannot deploy their copy.",
            ],
            [
              '`not_a_standard_vault`',
              'NOT_APPLICABLE',
              'The vault has no `query_asset`, or its underlying asset has no `decimals()`.',
            ],
          ],
        ),
      ],
    },
    {
      id: 'exit-codes',
      title: 'Exit codes',
      blocks: [
        table(
          ['Code', 'Meaning'],
          [
            ['`0`', 'No check failed and none was inconclusive. Not-applicable checks do not count either way.'],
            ['`1`', 'At least one check failed. A failure always wins over an inconclusive result.'],
            ['`2`', 'A prerequisite is missing. No check ran. See Preflight errors.'],
            ['`3`', 'No check failed, but at least one was inconclusive. The vault was not fully checked.'],
          ],
        ),
        verified(
          '`NOT_APPLICABLE` does not change the exit code. A run in which no check applied exits `0`, the same as a run in which all passed. Read the summary line or the JSON, not only the exit code.',
        ),
      ],
    },
    {
      id: 'status-file',
      title: 'Status file',
      blocks: [
        text(
          'With `--status-file <PATH>`, the CLI rewrites a JSON snapshot each time a check starts or finishes. The web backend uses it to show live progress.',
        ),
        code(
          'json',
          'status.json',
          `{
  "vault": "C…",
  "updated_at_ms": 1760000000000,
  "checks": [
    { "id": "total_assets", "group": "conformance", "status": "pass", "detail": "…" },
    { "id": "deposit", "group": "conformance", "status": "running", "detail": null }
  ]
}`,
        ),
        params([
          param('checks[].id', 'string', 'One of the 11 check ids, always in the fixed order.'),
          param('checks[].group', 'string', '`conformance` or `security`.'),
          param(
            'checks[].status',
            'string',
            '`pending`, `running`, `pass`, `fail`, `inconclusive` or `not_applicable` (lowercase here, unlike the JSON output).',
          ),
          param('checks[].detail', 'string | null', 'Set when the check finishes.'),
          optional('checks[].reason_code', 'string', 'Present only when there is one.'),
        ]),
        verified('Field names are taken from `cli/src/status.rs`. The values in the example are illustrative.'),
      ],
    },
  ],
}
