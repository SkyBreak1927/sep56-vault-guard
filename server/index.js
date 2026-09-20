const { execFile } = require('child_process');

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const CLI_BINARY = process.env.CLI_BINARY_PATH || 'sep56-vault-guard';
const CHECK_TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS) || 180000;
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

  execFile(
    CLI_BINARY,
    ['--vault', vault, '--output', 'json'],
    { timeout: CHECK_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
    (error, stdout, stderr) => {
      // The CLI prints its JSON report to stdout and exits 1 (not 0) whenever
      // any check fails — that's an expected, valid result (e.g. the known
      // donation_attack finding), not a server error. So a parseable stdout
      // payload is treated as success regardless of the process exit code.
      if (stdout) {
        try {
          const results = JSON.parse(stdout);
          return res.json(results);
        } catch (parseError) {
          // fall through to error handling below
        }
      }

      if (error && error.killed) {
        return res.status(504).json({ error: 'Check timed out.' });
      }

      return res.status(502).json({
        error: 'Failed to run check suite against the given vault.',
        detail: (stderr || (error && error.message) || 'unknown error').trim(),
      });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Aegis Vault server listening on port ${PORT}`);
});
