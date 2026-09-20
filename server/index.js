const { spawn } = require('child_process');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const CLI_BINARY = process.env.CLI_BINARY_PATH || 'sep56-vault-guard';
// Temporarily raised from 180000 while diagnosing production timeouts — see
// the /api/check handler below for why this needs to stay generous for now.
const CHECK_TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS) || 280000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://skybreak1927.github.io')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Stellar StrKey contract addresses: 'C' followed by 55 base32 characters
// (56 chars total, e.g. CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ).
const VAULT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;

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

app.post('/api/check', checkLimiter, (req, res) => {
  const vault = req.body && req.body.vault;

  if (typeof vault !== 'string' || !VAULT_ADDRESS_RE.test(vault)) {
    return res.status(400).json({
      error: 'Invalid "vault" field — expected a Stellar contract address (starts with "C", 56 characters).',
    });
  }

  const requestId = Math.random().toString(36).slice(2, 8);
  const startedAt = Date.now();
  const elapsed = () => `${Date.now() - startedAt}ms`;
  const log = (msg) => console.log(`[${new Date().toISOString()}] [check ${requestId}] ${msg}`);

  log(`request received for vault=${vault}`);

  const child = spawn(CLI_BINARY, ['--vault', vault, '--output', 'json']);
  log(`subprocess spawned (pid=${child.pid})`);

  let stdout = '';
  let stderr = '';
  let settled = false;
  let timedOut = false;

  // NOTE on what this logging can and can't show: the CLI runs all 11
  // checks sequentially in-process and only writes to stdout once, after
  // every check has finished — it does not print per-check progress. So a
  // stdout 'data' event firing means the *entire* run just completed, not
  // that one check completed. What these logs DO tell us is whether the
  // process is still alive-but-silent when the timeout fires (a true hang)
  // versus whether it was still working and finished output arrives before
  // that — i.e., slow vs. stuck.
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
    res.status(500).json({ error: 'Failed to start check process.', detail: error.message });
  });

  child.on('close', (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    log(`subprocess closed at ${elapsed()} (exitCode=${code}, signal=${signal})`);

    if (timedOut) {
      return res.status(504).json({ error: 'Check timed out.' });
    }

    // The CLI exits 1 (not 0) whenever any check fails — that's an
    // expected, valid result (e.g. the known donation_attack finding), not
    // a server error. So a parseable stdout payload is treated as success
    // regardless of the process exit code.
    if (stdout) {
      try {
        const results = JSON.parse(stdout);
        log(`parsed ${results.length} check results successfully`);
        return res.json(results);
      } catch (parseError) {
        log(`failed to parse stdout as JSON: ${parseError.message}`);
      }
    }

    return res.status(502).json({
      error: 'Failed to run check suite against the given vault.',
      detail: (stderr || `process exited with code ${code}`).trim(),
    });
  });
});

app.listen(PORT, () => {
  console.log(`Aegis Vault server listening on port ${PORT}`);
});
