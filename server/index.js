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
// How many jobs may wait behind the one that is running. The CLI drives seven
// shared testnet accounts, so two runs at once make the second one race the
// first for transaction sequence numbers and report failures that say nothing
// about the vault. One at a time is a correctness requirement, not tuning.
const QUEUE_MAX = 5;
// If a run somehow never reports back, release the queue anyway rather than
// stalling every job behind it. Comfortably past the CLI's own timeout, which
// kills the subprocess and makes it report back normally.
const QUEUE_STALL_GUARD_MS = CHECK_TIMEOUT_MS + 30 * 1000;
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

// Exactly one CLI run at a time. `running` is the jobId executing right now,
// `queue` holds the ones waiting in arrival order, and `ipHolders` maps a
// client IP to the one job it currently has in flight, so a single visitor
// cannot take the whole queue.
let running = null;
let stallGuard = null;
const queue = [];
const ipHolders = new Map();

// Position a waiting job would be told it is in, 1-based. 0 means it is not
// waiting — either it is running now, or it has already finished.
function queuePosition(jobId) {
  return queue.findIndex((entry) => entry.jobId === jobId) + 1;
}

// Starts the next job if nothing is running. Called when a job is queued and
// again every time one finishes, so the queue keeps moving on its own.
function pump() {
  if (running || queue.length === 0) return;

  const next = queue.shift();
  running = next.jobId;

  let released = false;
  const release = (why) => {
    if (released) return;
    released = true;
    clearTimeout(stallGuard);
    stallGuard = null;
    running = null;
    const job = jobs.get(next.jobId);
    if (job && ipHolders.get(job.ip) === next.jobId) ipHolders.delete(job.ip);
    if (why) console.log(`[${new Date().toISOString()}] [job ${next.jobId}] queue released: ${why}`);
    pump();
  };

  // The guard only fires if the run never reports back at all; a run that
  // ends -- including by its own timeout -- releases the queue itself.
  stallGuard = setTimeout(() => release('stall guard fired'), QUEUE_STALL_GUARD_MS);
  stallGuard.unref();

  runCheckJob(next.jobId, next.vault, next.statusFilePath, () => release(null));
}

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
function runCheckJob(jobId, vault, statusFilePath, onFinished) {
  const startedAt = Date.now();
  // Called exactly once, from every path this function can leave by, so the
  // queue advances whether the run succeeded, failed, timed out, or never
  // started at all.
  let reported = false;
  const finished = () => {
    if (reported) return;
    reported = true;
    if (onFinished) onFinished();
  };
  const elapsed = () => `${Date.now() - startedAt}ms`;
  const log = (msg) => console.log(`[${new Date().toISOString()}] [job ${jobId}] ${msg}`);

  log(`started for vault=${vault}`);

  let child;
  try {
    child = spawn(CLI_BINARY, [
      '--vault',
      vault,
      '--output',
      'json',
      '--status-file',
      statusFilePath,
    ]);
  } catch (spawnError) {
    log(`spawn threw: ${spawnError.message}`);
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'error',
      error: 'Failed to start check process.',
    });
    finished();
    return;
  }
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
      ...jobs.get(jobId),
      status: 'error',
      error: 'Failed to start check process.',
      createdAt: startedAt,
      statusFilePath,
    });
    finished();
  });

  child.on('close', async (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    log(`subprocess closed at ${elapsed()} (exitCode=${code}, signal=${signal})`);

    if (timedOut) {
      jobs.set(jobId, {
        ...jobs.get(jobId),
        status: 'error',
        error: 'Check timed out.',
        createdAt: startedAt,
        statusFilePath,
      });
      finished();
      return;
    }

    // The server does not use the CLI's exit code to decide the outcome. As
    // long as stdout parses as JSON, the job counts as a success. The exit
    // codes 0, 1 and 3 (check results) and 2 (a prerequisite failed, which
    // prints an error object that is handled just below) do not change this.
    if (stdout) {
      try {
        const result = JSON.parse(stdout);

        // A missing prerequisite (no `stellar`, a missing identity, an
        // address that is not a contract) makes the CLI print one error
        // object instead of the array of check results, and exit 2. Without
        // this branch that object would be stored as a 'complete' job whose
        // `result` has no checks in it, and the page would say "Done." over
        // an empty list rather than telling anyone what went wrong.
        if (!Array.isArray(result)) {
          const problem = result && result.problem;
          const fix = result && result.fix;
          log(`CLI reported a prerequisite failure: ${result && result.code}`);
          jobs.set(jobId, {
            ...jobs.get(jobId),
            status: 'error',
            error: [problem, fix].filter(Boolean).join(' ') ||
              'The checker could not run: prerequisites are not met.',
            createdAt: startedAt,
            statusFilePath,
          });
          finished();
          return;
        }

        log(`parsed ${result.length} check results successfully`);
        // Cache the final per-check status snapshot too (best-effort — the
        // authoritative outcome is `result`, parsed straight from the
        // CLI's own stdout above; `checks` is read back from the same
        // file GET already polls during 'processing', purely so a client
        // that was rendering the granular list doesn't lose it on the
        // final poll).
        const checks = await readStatusFile(statusFilePath);
        jobs.set(jobId, {
          ...jobs.get(jobId),
          status: 'complete',
          result,
          checks,
          createdAt: startedAt,
          statusFilePath,
        });
        finished();
        return;
      } catch (parseError) {
        log(`failed to parse stdout as JSON: ${parseError.message}`);
      }
    }

    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'error',
      error: (stderr || `process exited with code ${code}`).trim(),
      createdAt: startedAt,
      statusFilePath,
    });
    finished();
  });
}

app.post('/api/check', checkLimiter, (req, res) => {
  const vault = req.body && req.body.vault;

  if (typeof vault !== 'string' || !VAULT_ADDRESS_RE.test(vault)) {
    return res.status(400).json({
      error: 'Invalid "vault" field — expected a Stellar contract address (starts with "C", 56 characters).',
    });
  }

  // One in-flight job per client. `req.ip` is the real client address
  // because of the `trust proxy` setting above; without it every visitor
  // behind the platform's proxy would look like one caller and the first of
  // them would lock everyone else out.
  const ip = req.ip;
  const held = ipHolders.get(ip);
  if (held) {
    return res.status(429).json({
      error: 'You already have a check running. Wait for it to finish before starting another.',
      jobId: held,
    });
  }

  if (queue.length >= QUEUE_MAX) {
    return res.status(503).json({
      error: 'The checker is busy — too many checks are already waiting. Please try again in a few minutes.',
    });
  }

  const jobId = randomUUID();
  const statusFilePath = path.join(STATUS_DIR, `${jobId}.json`);
  jobs.set(jobId, { status: 'processing', createdAt: Date.now(), statusFilePath, ip });
  ipHolders.set(ip, jobId);

  // Queued rather than started directly: the CLI drives seven shared testnet
  // accounts, so a second concurrent run races the first for transaction
  // sequence numbers and reports failures that are about the collision, not
  // about the vault. `pump` starts this one immediately when nothing else is
  // running, which is the common case.
  queue.push({ jobId, vault, statusFilePath });
  const position = queuePosition(jobId);
  pump();

  // `status` stays 'processing' whether the job started or is waiting, so a
  // client that knows nothing about queueing behaves exactly as before. The
  // queue fields are additive.
  const body = { jobId, status: 'processing' };
  if (running !== jobId) {
    body.queued = true;
    body.position = position;
  }
  res.status(202).json(body);
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
    const body = { status: 'processing' };
    if (checks) body.checks = checks;
    // A job that has not started yet says so alongside the unchanged
    // 'processing' status, so an older client simply keeps polling.
    const position = queuePosition(req.params.jobId);
    if (position > 0) {
      body.queued = true;
      body.position = position;
    }
    return res.json(body);
  }

  if (job.status === 'error') {
    return res.status(502).json({ status: 'error', error: job.error, checks: job.checks });
  }

  return res.json({ status: 'complete', result: job.result, checks: job.checks });
});

app.listen(PORT, () => {
  console.log(`Aegis Vault server listening on port ${PORT}`);
});
