import { code, optional, param, params, table, text, unverified, verified } from '../blocks'
import type { DocsPage } from '../types'

export const output: DocsPage = {
  slug: 'output',
  tag: 'CLI',
  title: 'Output and exit codes',
  lead: 'The four result statuses, the text, JSON and Markdown formats, reason codes, exit codes and the status file.',
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
          'ABBREVIATED EXAMPLE',
        ),
        verified(
          "Field names and order are taken from the CLI's unit tests. The `detail` text is shortened here; a real run prints the measured values.",
        ),
      ],
    },
    {
      id: 'markdown-output',
      title: 'Markdown output',
      blocks: [
        text(
          '`--output markdown` (since v0.5.0) prints a report you can save as a `.md` file. The report is built from the same results as the text and JSON formats.',
        ),
        table(
          ['Part', 'Content'],
          [
            ['Title', '`# Aegis Vault — Conformance Verification Report`'],
            [
              'Header list',
              'Vault, network, spec reference, checker version, start and end time, duration, and the result line.',
            ],
            [
              'Summary',
              'The result headline, then `Core function checks: X of N passed` and `Basic security checks: X of N passed`. Inconclusive and not-applicable counts are listed only when above zero.',
            ],
            [
              'Tables',
              'One table per group, `Conformance checks` and `Security checks`, with the columns `#`, `Check`, `Status` and `Detail`. Rows are numbered 01 to 11 in the fixed check order.',
            ],
            [
              'Error section',
              'Only when a prerequisite is missing (exit code 2): the error, the `code`, a `Problem` paragraph and a `Fix` paragraph, and the line `No checks were run.`',
            ],
          ],
        ),
        text(
          'Real reports from Testnet runs with CLI 0.5.0 are in `docs/sample-reports/` in the GitHub repository: the Positive Control Vault (11 PASS), the Reference Vault (10 PASS, 1 FAIL) and a prerequisite error.',
        ),
        verified(
          'The format is covered by 12 unit tests (`markdown::tests` in `cli/src/markdown.rs`), and the sample reports come from three Testnet runs of CLI 0.5.0.',
        ),
        unverified(
          'Not verified: that the Markdown from the CLI is identical in content to the Markdown exported by the web app for the same run. Also not verified: how the report looks once rendered, and the Linux and macOS v0.5.0 archives, which have not been run.',
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
          'ABBREVIATED EXAMPLE',
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
        verified('Field names are taken from `cli/src/status.rs`. The values in the example are placeholders, not output of a real run.'),
      ],
    },
  ],
}
