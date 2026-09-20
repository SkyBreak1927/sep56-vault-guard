// Drives the "run a live check" section: POST /api/check on the backend,
// poll GET /api/check/:jobId until it settles, and render the result.
// The hero terminal above it is static markup — no JS involved there.

const API_BASE = "https://aegis-vault-backend.onrender.com";
const DEMO_VAULT_ADDRESS = "CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ";
const VAULT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 90; // ~7.5 minutes, comfortably above the backend's own timeout
const DEFAULT_HINT = 'Stellar contract address — starts with "C", 56 characters.';

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

const vaultInput = document.getElementById("vault-input");
const runBtn = document.getElementById("run-btn");
const useDemoBtn = document.getElementById("use-demo");
const runHint = document.getElementById("run-hint");
const runHintText = document.getElementById("run-hint-text");
const runOutput = document.getElementById("run-output");
const runStatus = document.getElementById("run-status");
const runResults = document.getElementById("run-results");

function setHintError(message) {
  runHintText.textContent = message;
  runHint.classList.add("error");
}

function clearHintError() {
  runHintText.textContent = DEFAULT_HINT;
  runHint.classList.remove("error");
}

function renderRunResults(results) {
  const rows = results
    .map((r) => {
      const passed = r.status === "PASS";
      return `
      <div class="check-row">
        <span class="check-status ${passed ? "pass" : "fail"}">${passed ? "✓" : "✗"}</span>
        <div class="check-body">
          <div class="check-name">${escapeHtml(r.name)}</div>
          <div class="check-detail">${escapeHtml(r.detail)}</div>
        </div>
      </div>`;
    })
    .join("");

  const passedCount = results.filter((r) => r.status === "PASS").length;
  const failedCount = results.length - passedCount;
  const summary = `<div class="check-summary">${passedCount} passed, ${failedCount} failed</div>`;

  runResults.innerHTML = rows + summary;
}

function endRun(statusText, { failed } = {}) {
  runStatus.textContent = statusText;
  runStatus.classList.remove("processing");
  runBtn.disabled = false;
  if (failed) runResults.innerHTML = "";
}

function pollJob(jobId, attempt) {
  if (attempt > MAX_POLL_ATTEMPTS) {
    endRun("Gave up waiting for a result — the check is taking unusually long. Please try again later.", { failed: true });
    return;
  }

  fetch(`${API_BASE}/api/check/${jobId}`)
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ body }) => {
      if (body.status === "processing") {
        setTimeout(() => pollJob(jobId, attempt + 1), POLL_INTERVAL_MS);
        return;
      }

      if (body.status === "complete") {
        renderRunResults(body.result);
        endRun("Done.");
        return;
      }

      // status === "error", or an unexpected shape
      endRun(body.error || "The check failed for an unknown reason.", { failed: true });
    })
    .catch((err) => {
      endRun(`Lost connection while checking job status: ${err.message}`, { failed: true });
    });
}

function runCheck() {
  const vault = vaultInput.value.trim();

  if (!VAULT_ADDRESS_RE.test(vault)) {
    setHintError('Invalid address — must start with "C" and be 56 characters long.');
    return;
  }
  clearHintError();

  runBtn.disabled = true;
  runOutput.hidden = false;
  runResults.innerHTML = "";
  runStatus.textContent = "Processing... (usually 1-2 minutes)";
  runStatus.classList.add("processing");

  fetch(`${API_BASE}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vault }),
  })
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok || !body.jobId) {
        endRun(body.error || "Failed to start the check.", { failed: true });
        return;
      }
      pollJob(body.jobId, 1);
    })
    .catch((err) => {
      endRun(`Could not reach the backend: ${err.message}`, { failed: true });
    });
}

runBtn.addEventListener("click", runCheck);

vaultInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runCheck();
});

vaultInput.addEventListener("input", () => {
  if (runHint.classList.contains("error")) clearHintError();
});

useDemoBtn.addEventListener("click", () => {
  vaultInput.value = DEMO_VAULT_ADDRESS;
  clearHintError();
  vaultInput.focus();
});
