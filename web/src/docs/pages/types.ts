import { code, verified } from '../blocks'
import type { DocsPage } from '../types'

export const resultTypes: DocsPage = {
  slug: 'types',
  tag: 'Reference',
  title: 'Result types',
  lead: 'Shapes of the CLI output, the preflight error, the status file and the API responses.',
  sections: [
    {
      id: 'check-result',
      title: 'CLI result (--output json)',
      blocks: [
        code(
          'typescript',
          'types.ts',
          `type CheckStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_APPLICABLE'

interface CheckResult {
  name: string            // check id, e.g. "deposit"
  category: 'Positive Conformance' | 'Security/Adversarial'
  status: CheckStatus
  detail: string
  reason_code?: string    // only for INCONCLUSIVE and NOT_APPLICABLE
}

type CliJsonOutput = CheckResult[]   // 11 items, fixed order`,
        ),
      ],
    },
    {
      id: 'preflight-error',
      title: 'Preflight error (exit code 2)',
      blocks: [
        code(
          'typescript',
          'types.ts',
          `interface PreflightError {
  error: 'preflight_failed'
  code: 'stellar_not_found' | 'stellar_version_too_old' | 'stellar_version_unreadable'
      | 'identities_missing' | 'vault_address_malformed' | 'vault_not_a_contract'
  problem: string
  fix: string
}`,
        ),
      ],
    },
    {
      id: 'status-file',
      title: 'Status file',
      blocks: [
        code(
          'typescript',
          'types.ts',
          `interface StatusFile {
  vault: string
  updated_at_ms: number
  checks: {
    id: string
    group: 'conformance' | 'security'
    status: 'pending' | 'running' | 'pass' | 'fail' | 'inconclusive' | 'not_applicable'
    detail: string | null
    reason_code?: string
  }[]
}`,
        ),
      ],
    },
    {
      id: 'api-responses',
      title: 'API responses',
      blocks: [
        code(
          'typescript',
          'types.ts',
          `interface StartCheckResponse { jobId: string; status: 'processing'; queued?: true; position?: number }

type JobResponse =
  | { status: 'processing'; checks?: StatusFile['checks']; queued?: true; position?: number }
  | { status: 'complete'; result: CheckResult[]; checks: StatusFile['checks'];
      meta: { cli_version: string; cli_commit: string | null } }
  | { status: 'error'; error: string; checks: StatusFile['checks'] }`,
        ),
        verified(
          'Written from `cli/src/main.rs`, `cli/src/status.rs`, `cli/src/preflight.rs` and `server/index.js`. These are descriptions, not a published package.',
        ),
      ],
    },
  ],
}
