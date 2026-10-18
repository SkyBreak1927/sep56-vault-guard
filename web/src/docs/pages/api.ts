import { code, param, params, table, text } from '../blocks'
import type { DocsPage } from '../types'

export const api: DocsPage = {
  slug: 'api',
  tag: 'Backend',
  title: 'Check API',
  lead: 'The hosted backend runs the CLI for the web checker. A check is started as a job and polled until it completes.',
  sections: [
    {
      id: 'base-url',
      title: 'Base URL',
      blocks: [
        code('text', 'base url', 'https://aegis-vault-backend.onrender.com'),
        text('Browser requests are accepted only from allowed origins (the production web app).'),
      ],
    },
    {
      id: 'post-check',
      title: 'POST /api/check',
      blocks: [
        text('Starts a check. Returns a job id.'),
        params([param('vault', 'string', 'Contract address of the vault, starts with `C`, 56 characters.')], 'PARAMETERS'),
        code(
          'bash',
          'terminal',
          `curl -X POST https://aegis-vault-backend.onrender.com/api/check \\
  -H "Content-Type: application/json" \\
  -d '{"vault":"<CONTRACT_ADDRESS>"}'`,
          'EXAMPLE',
        ),
        table(
          ['Status', 'Body'],
          [
            [
              '`202`',
              '`{ "jobId": "…", "status": "processing" }`, plus `"queued": true, "position": N` when it is waiting behind another job',
            ],
            ['`400`', '`{ "error": "…" }`: the `vault` field is not a contract address'],
            [
              '`429`',
              '`{ "error": "…", "jobId": "…" }` when you already have a check running; `{ "error": "…" }` after more than 5 requests per minute',
            ],
            ['`503`', '`{ "error": "…" }`: the queue is full, try again in a few minutes'],
          ],
          'RETURNS',
        ),
      ],
    },
    {
      id: 'get-check',
      title: 'GET /api/check/:jobId',
      blocks: [
        text("Returns the job's progress, then its result."),
        table(
          ['Status', 'Body'],
          [
            ['`200`', '`{ "status": "processing", "checks": [...], "queued"?: true, "position"?: N }`'],
            [
              '`200`',
              '`{ "status": "complete", "result": [...], "checks": [...], "meta": { "cli_version": "0.5.0", "cli_commit": "…" } }`',
            ],
            ['`502`', '`{ "status": "error", "error": "…", "checks": [...] }`'],
            ['`404`', '`{ "error": "…" }`: unknown job id, or the job has expired'],
          ],
          'RETURNS',
        ),
        text(
          "`checks` is the status file (see Output and exit codes). It can be missing on the first poll or two; treat that as all checks pending. `result` is the CLI's JSON output.",
        ),
      ],
    },
    {
      id: 'health',
      title: 'GET /health',
      blocks: [code('json', 'response', '{ "status": "ok" }')],
    },
  ],
}
