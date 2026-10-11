import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// API_BASE is read when the module loads, so import it after stubbing the env.
async function loadApi() {
  vi.resetModules()
  return import('../api')
}

function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_BASE', 'https://checker.test/'))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('getJob', () => {
  it('returns the error and snapshot from a 502 body instead of throwing', async () => {
    const checks = [{ id: 'deposit', group: 'conformance', status: 'pass', detail: null }]
    respond(502, { status: 'error', error: 'CLI exited with code 1', checks })
    const { getJob } = await loadApi()

    await expect(getJob('job-1')).resolves.toEqual({ status: 'error', error: 'CLI exited with code 1', checks })
    expect(fetch).toHaveBeenCalledWith('https://checker.test/api/check/job-1', undefined)
  })

  it('reports an unknown or expired job (404) as expired', async () => {
    respond(404, { error: 'Job not found' })
    const { getJob, JOB_EXPIRED_MESSAGE } = await loadApi()

    await expect(getJob('gone')).resolves.toEqual({ status: 'error', error: JOB_EXPIRED_MESSAGE })
  })

  it('passes processing updates through, queue fields included', async () => {
    respond(200, { status: 'processing', queued: true, position: 2 })
    const { getJob } = await loadApi()

    await expect(getJob('job-1')).resolves.toEqual({ status: 'processing', queued: true, position: 2 })
  })
})

describe('startCheck', () => {
  it('posts the vault and returns the job id, with no position when it runs right away', async () => {
    respond(202, { jobId: 'job-1', status: 'processing' })
    const { startCheck } = await loadApi()

    await expect(startCheck('CVAULT')).resolves.toEqual({ jobId: 'job-1', position: null })
    expect(fetch).toHaveBeenCalledWith('https://checker.test/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: 'CVAULT' }),
    })
  })

  it('returns the queue position when the job is queued', async () => {
    respond(202, { jobId: 'job-2', status: 'processing', queued: true, position: 3 })
    const { startCheck } = await loadApi()

    await expect(startCheck('CVAULT')).resolves.toEqual({ jobId: 'job-2', position: 3 })
  })

  it.each([
    [400, 'Invalid "vault" field — expected a Stellar contract address (starts with "C", 56 characters).'],
    [429, 'You already have a check running. Wait for it to finish before starting another.'],
    [503, 'The checker is busy — too many checks are already waiting. Please try again in a few minutes.'],
    // Messages as sent by server/index.js.
  ])('throws the backend message on HTTP %i', async (status, error) => {
    respond(status, { error })
    const { startCheck } = await loadApi()

    await expect(startCheck('CVAULT')).rejects.toThrow(error)
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })))
    const { startCheck } = await loadApi()

    await expect(startCheck('CVAULT')).rejects.toThrow('Failed to start the check.')
  })

  it.each([
    [429, 'Too many requests. Wait a moment, then try again.'],
    [503, 'The checker is busy or unavailable right now. Try again in a few minutes.'],
  ])('uses a clear fallback for a non-JSON HTTP %i', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', { status })))
    const { startCheck } = await loadApi()

    await expect(startCheck('CVAULT')).rejects.toThrow(message)
  })
})

describe('request', () => {
  it('reports an unreachable backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { startCheck } = await loadApi()

    await expect(startCheck('CVAULT')).rejects.toThrow('Could not reach the checker backend: Failed to fetch')
  })

  it('refuses to run without a configured backend', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE', '')
    vi.stubGlobal('fetch', vi.fn())
    const { getJob } = await loadApi()

    await expect(getJob('job-1')).rejects.toThrow(/not configured/)
    expect(fetch).not.toHaveBeenCalled()
  })
})
