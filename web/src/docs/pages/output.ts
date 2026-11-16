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
            optional('raw_error', 'string', 'The `stellar` error text the tool captured for this result, when there is any. `detail` may still quote it.'),
            optional(
              'reason',
              'object',
              'On every row that is not `PASS`: `{ "code", "message" }`. `code` is one of the reason codes below; for `INCONCLUSIVE` and `NOT_APPLICABLE` it equals `reason_code`. `message` is one fixed sentence per code, without raw error text or account names.',
            ),
            param('mode', 'string', 'On every row. `testnet`: the 7 conformance checks change the target vault\'s state.'),
            param('spec', 'string', 'On every row. The SEP-56 text the checks were written against: `SEP-0056 v0.1.2 (Draft)`.'),
            param('runs_on', 'string', 'On every row. `target` for the 7 conformance checks, `temporary_copy` for the 4 security checks.'),
          ],
          'FIELDS',
        ),
        code(
          'json',
          'json',
          `[
  { "name": "deposit", "category": "Positive Conformance", "status": "PASS", "detail": "…",
    "mode": "testnet", "spec": "SEP-0056 v0.1.2 (Draft)", "runs_on": "target" },
  { "name": "donation_attack", "category": "Security/Adversarial", "status": "FAIL", "detail": "…",
    "reason": { "code": "security_finding", "message": "…" },
    "mode": "testnet", "spec": "SEP-0056 v0.1.2 (Draft)", "runs_on": "temporary_copy" }
]`,
          'ABBREVIATED EXAMPLE',
        ),
        verified(
          "Field names and order are taken from the CLI's unit tests. The `detail` and `message` texts are shortened here; a real run prints the measured values.",
        ),
        text(
          'When a prerequisite is missing (exit code 2), the output is one object instead: `{ "error", "code", "problem", "fix", "mode", "spec" }`. For `code: "unsupported_interface"` it also lists `missing_functions` and `mismatched_functions`.',
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
              'Vault, network, mode, spec reference, checker version, start and end time, duration, and the result line.',
            ],
            [
              'Summary',
              'The result headline, then `Core function checks: X of N passed` and `Basic security checks: X of N passed`. Inconclusive and not-applicable counts are listed only when above zero.',
            ],
            [
              'Tables',
              'One table per group, `Conformance checks` and `Security checks`, with the columns `#`, `Check`, `Status`, `Mode`, `Spec`, `Runs on` and `Detail`. Every row carries its mode, the SEP-56 draft it was checked against, and whether it ran on the target vault or a temporary copy. Rows are numbered 01 to 11 in the fixed check order.',
            ],
            [
              'Error section',
              'Only when a prerequisite is missing (exit code 2): the error, the `code`, a `Problem` paragraph and a `Fix` paragraph, and the line `No checks were run.`',
            ],
          ],
        ),
        text(
          'Real reports from Testnet runs with CLI 0.5.0 are in `docs/sample-reports/` in the GitHub repository: the Positive Control Vault (11 PASS), the Reference Vault (10 PASS, 1 FAIL) and a prerequisite error. Those were made before the `Mode`, `Spec` and `Runs on` columns existed; a report with them is in `docs/sow2/samples/`.',
        ),
        verified(
          'The format is covered by unit tests (`markdown::tests` in `cli/src/markdown.rs`), and the sample reports come from Testnet runs.',
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
        text(
          '`reason.code` takes one of these values. `reason_code` carries the same value, but only on `INCONCLUSIVE` and `NOT_APPLICABLE` rows.',
        ),
        table(
          ['Code', 'Status', 'Meaning'],
          [
            ['`behavior_mismatch`', 'FAIL', 'A conformance check: the function exists, but its result did not satisfy the assertion. `reason` only.'],
            ['`security_finding`', 'FAIL', 'A security check: the scenario on the temporary copy was not handled as expected. `reason` only.'],
            [
              '`interface_missing`',
              'FAIL',
              'The vault does not declare a SEP-56 function the check calls. Normally caught before the run as `unsupported_interface` (exit code 2). `reason` only.',
            ],
            [
              '`insufficient_token_balance`',
              'INCONCLUSIVE',
              'A token transfer a check needed was rejected, and the paying test account holds less than the call needed. The detail gives both figures when the tool read the balance.',
            ],
            ['`network_error`', 'INCONCLUSIVE', 'A network problem stopped the check.'],
            ['`unclassified_error`', 'INCONCLUSIVE', 'An error the tool could not classify. The raw error is in `raw_error` and in `detail`.'],
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
            [
              '`token_interface_mismatch`',
              'NOT_APPLICABLE',
              '`access_control_probing` only: `approve` or `allowance` is not declared as `(address, address, i128, u32)` and `(address, address) -> i128` with `spender` second, or the contract spec could not be read.',
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
            ['`2`', 'A prerequisite is missing, or the vault does not have the SEP-56 interface the checks call (`unsupported_interface`). No check ran. See Preflight errors.'],
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
          optional('checks[].reason', 'object', 'Set when a check finishes with a status other than `pass`: `{ "code", "message" }`, as in the JSON output.'),
        ]),
        verified('Field names are taken from `cli/src/status.rs`. The values in the example are placeholders, not output of a real run.'),
      ],
    },
  ],
}
