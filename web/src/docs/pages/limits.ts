import { table, text, verified } from '../blocks'
import type { DocsPage } from '../types'

export const limits: DocsPage = {
  slug: 'limits',
  tag: 'Backend',
  title: 'Limits and queue',
  lead: 'The backend runs one check at a time, because all runs share the same seven Testnet accounts.',
  sections: [
    {
      id: 'limits',
      title: 'Limits',
      blocks: [
        table(
          ['Limit', 'Value', 'Response when exceeded'],
          [
            ['Checks running at once', '1', 'Others wait in the queue'],
            ['Queue length', '5 waiting jobs', '`503`'],
            ['Active jobs per IP', '1', '`429` with the existing `jobId`'],
            ['Requests to `POST /api/check`', '5 per minute per IP', '`429`'],
            ['Time limit per run', '280 seconds', 'Job ends with an error'],
            ['How long a job is kept', '10 minutes, in memory', '`404` afterwards'],
          ],
        ),
        verified('Values are taken from `server/index.js`. Jobs are not kept across a backend restart.'),
      ],
    },
    {
      id: 'polling',
      title: 'Polling',
      blocks: [
        text(
          'Poll `GET /api/check/:jobId` every few seconds until `status` is `complete` or `error`. While the job waits, `queued` and `position` tell you where it is in the queue.',
        ),
      ],
    },
  ],
}
