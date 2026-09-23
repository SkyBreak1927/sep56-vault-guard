const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const CLI_BINARY = process.env.CLI_BINARY_PATH || 'sep56-vault-guard';
const CHECK_TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS) || 280000;
const JOB_MAX_AGE_MS = 10 * 60 * 1000;
const JOB_SWEEP_INTERVAL_MS = 60 * 1000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://skybreak1927.github.io')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Stellar StrKey contract addresses: 'C' followed by 55 base32 characters
// (56 chars total, e.g. CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ).
const VAULT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;

// Where the CLI's --status-file JSON snapshots (one per in-flight job) are
// written. Created up front so the first job doesn't race directory
// creation with its own spawn.
const STATUS_DIR = path.join(os.tmpdir(), 'aegis-vault-status');
fs.mkdirSync(STATUS_DIR, { recursive: true });

// In-memory job store: jobId -> { status: 'processing'|'complete'|'error',
// result?, checks?, error?, createdAt, statusFilePath }. Fine for this
// scale — a single instance, no need to survive restarts, and swept on a
// timer below.
const jobs = new Map();

setInterval(() => {
  const cutoff = Date.now() - JOB_MAX_AGE_MS;
  for (const [jobId, job] of jobs) {
    if (job.createdAt < cutoff) {
      jobs.delete(jobId);
      if (job.statusFilePath) fsp.unlink(job.statusFilePath).catch(() => {});
    }
  }
}, JOB_SWEEP_INTERVAL_MS).unref();

const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy, so req.ip needs
// the X-Forwarded-For chain to reflect the real client IP for rate limiting.
app.set('trust proxy', 1);

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  })
);

app.use(express.json());

const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — limit is 5 per minute per IP. Please try again shortly.' },
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Reads and parses a CLI --status-file snapshot, returning its `checks`
// array or null if the file doesn't exist yet (e.g. a brief race right
// after the job was created, before the CLI's first write) or can't be
// parsed. Never throws.
async function readStatusFile(statusFilePath) {
  try {
    const raw = await fsp.readFile(statusFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.checks) ? parsed.checks : null;
  } catch {
    return null;
  }
}

// Runs the CLI in the background against `vault` and writes the outcome
// into `jobs.get(jobId)` — never touches `res`, since the HTTP response for
// this job was already sent by the time this settles.
function runCheckJob(jobId, vault, statusFilePath) {
  const startedAt = Date.now();
  const elapsed = () => `${Date.now() - startedAt}ms`;
  const log = (msg) => console.log(`[${new Date().toISOString()}] [job ${jobId}] ${msg}`);

  log(`started for vault=${vault}`);

  const child = spawn(CLI_BINARY, [
    '--vault',
    vault,
    '--output',
    'json',
    '--status-file',
    statusFilePath,
  ]);
  log(`subprocess spawned (pid=${child.pid})`);

  let stdout = '';
  let stderr = '';
  let settled = false;
  let timedOut = false;

  // NOTE on what this logging can and can't show: the CLI runs all 11
  // checks in-process and only writes to stdout once, at the very end — a
  // stdout 'data' event firing means the *entire* run just completed, not
  // that one check completed. What it does tell us is whether the process
  // is still alive-but-silent when the timeout fires (a true hang) versus
  // whether it finishes (however slowly) before that.
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    log(`stdout: ${chunk.length} bytes received at ${elapsed()}`);
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    log(`stderr: ${chunk.length} bytes received at ${elapsed()} — ${chunk.toString().trim().slice(0, 500)}`);
  });

  const timer = setTimeout(() => {
    timedOut = true;
    log(`TIMEOUT — no completed process after ${elapsed()} (limit ${CHECK_TIMEOUT_MS}ms), killing pid=${child.pid}`);
    child.kill('SIGKILL');
  }, CHECK_TIMEOUT_MS);

  child.on('error', (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    log(`subprocess failed to start at ${elapsed()}: ${error.message}`);
    jobs.set(jobId, {
      status: 'error',
      error: 'Failed to start check process.',
      createdAt: startedAt,
      statusFilePath,
    });
  });

  child.on('close', async (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    log(`subprocess closed at ${elapsed()} (exitCode=${code}, signal=${signal})`);

    if (timedOut) {
      jobs.set(jobId, {
        status: 'error',
        error: 'Check timed out.',
        createdAt: startedAt,
        statusFilePath,
      });
      return;
    }

    // The CLI exits 1 (not 0) whenever any check fails — that's an
    // expected, valid result (e.g. the known donation_attack finding), not
    // a server error. So a parseable stdout payload is treated as success
    // regardless of the process exit code.
    if (stdout) {
      try {
        const result = JSON.parse(stdout);
        log(`parsed ${result.length} check results successfully`);
        // Cache the final per-check status snapshot too (best-effort — the
        // authoritative outcome is `result`, parsed straight from the
        // CLI's own stdout above; `checks` is read back from the same
        // file GET already polls during 'processing', purely so a client
        // that was rendering the granular list doesn't lose it on the
        // final poll).
        const checks = await readStatusFile(statusFilePath);
        jobs.set(jobId, { status: 'complete', result, checks, createdAt: startedAt, statusFilePath });
        return;
      } catch (parseError) {
        log(`failed to parse stdout as JSON: ${parseError.message}`);
      }
    }

    jobs.set(jobId, {
      status: 'error',
      error: (stderr || `process exited with code ${code}`).trim(),
      createdAt: startedAt,
      statusFilePath,
    });
  });
}

app.post('/api/check', checkLimiter, (req, res) => {
  const vault = req.body && req.body.vault;

  if (typeof vault !== 'string' || !VAULT_ADDRESS_RE.test(vault)) {
    return res.status(400).json({
      error: 'Invalid "vault" field — expected a Stellar contract address (starts with "C", 56 characters).',
    });
  }

  const jobId = randomUUID();
  const statusFilePath = path.join(STATUS_DIR, `${jobId}.json`);
  jobs.set(jobId, { status: 'processing', createdAt: Date.now(), statusFilePath });

  // Deliberately not awaited — the check suite can take minutes, so the
  // response below returns immediately and the caller polls GET
  // /api/check/:jobId for the outcome.
  runCheckJob(jobId, vault, statusFilePath);

  res.status(202).json({ jobId, status: 'processing' });
});

app.get('/api/check/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Unknown job ID (it may have expired).' });
  }

  if (job.status === 'processing') {
    // Best-effort: the granular per-check list from the CLI's
    // --status-file. Right after the job is created there's a brief window
    // before the CLI has written anything yet, so `checks` may be absent
    // for the first poll or two — callers should treat a missing `checks`
    // field the same as an all-"pending" list, not an error.
    const checks = await readStatusFile(job.statusFilePath);
    return checks ? res.json({ status: 'processing', checks }) : res.json({ status: 'processing' });
  }

  if (job.status === 'error') {
    return res.status(502).json({ status: 'error', error: job.error, checks: job.checks });
  }

  return res.json({ status: 'complete', result: job.result, checks: job.checks });
});

app.listen(PORT, () => {
  console.log(`Aegis Vault server listening on port ${PORT}`);
});
