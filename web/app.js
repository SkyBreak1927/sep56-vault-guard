// Drives the "Try It Yourself" + "Results" sections: POST /api/check on the
// backend, then poll GET /api/check/:jobId, which returns a `checks` array
// of all 11 checks (id, group, status, detail) that updates in place as
// each one finishes — checks run in parallel on the backend, in no fixed
// order, so the UI never assumes an order either.

const API_BASE = "https://aegis-vault-backend.onrender.com";
const VAULT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 90; // ~7.5 minutes, comfortably above the backend's own timeout
const DEFAULT_HINT = 'Stellar contract address — starts with "C", 56 characters.';

// Display names and descriptions are the corrected copy from
// design-reference/CORRECTED_CONTENT.md, used verbatim — the backend only
// ever supplies id/group/status/detail, not human-readable copy.
const CHECK_DEFS = [
  { id: "total_assets", group: "conformance", name: "Total Assets Accounting", description: "Vault reports total assets accurately and consistently." },
  { id: "deposit", group: "conformance", name: "Deposit Conformance", description: "Deposit function behaves per SEP-56 spec." },
  { id: "mint", group: "conformance", name: "Mint Conformance", description: "Mint function behaves per SEP-56 spec." },
  { id: "withdraw", group: "conformance", name: "Withdraw Conformance", description: "Withdraw function behaves per SEP-56 spec." },
  { id: "redeem", group: "conformance", name: "Redeem Conformance", description: "Redeem function behaves per SEP-56 spec." },
  { id: "convert_to_shares", group: "conformance", name: "Convert to Shares Accuracy", description: "Asset→share conversion math is correct." },
  { id: "convert_to_assets", group: "conformance", name: "Convert to Assets Accuracy", description: "Share→asset conversion math is correct." },
  { id: "donation_attack", group: "security", name: "Donation/Inflation Attack Resistance", description: "Tests vulnerability to direct-donation share-price manipulation." },
  { id: "overflow_protection", group: "security", name: "Overflow Protection", description: "Tests handling of extreme values without overflow/crash." },
  { id: "rounding_direction", group: "security", name: "Rounding Direction Safety", description: "Confirms rounding always favors the vault, never the attacker." },
  { id: "access_control_probing", group: "security", name: "Access Control Probing", description: "Confirms sensitive functions are properly authorization-gated." },
];

const BADGE_LABEL = { pending: "Pending", running: "Running", pass: "Pass", fail: "Fail", warn: "Warn" };

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

// id -> { status, detail }. Reset to all-"pending" at the start of every run.
let checkState = new Map();

function resetCheckState() {
  checkState = new Map(CHECK_DEFS.map((def) => [def.id, { status: "pending", detail: null }]));
}
resetCheckState();

const vaultInput = document.getElementById("vault-input");
const runBtn = document.getElementById("run-btn");
const runHint = document.getElementById("run-hint");
const runHintText = document.getElementById("run-hint-text");
const resultsPanel = document.getElementById("results-panel");
const resultsLede = document.getElementById("results-lede");
const resultsDot = document.getElementById("results-dot");
const resultsSummaryText = document.getElementById("results-summary-text");
const conformanceList = document.getElementById("conformance-list");
const securityList = document.getElementById("security-list");
const presetButtons = document.querySelectorAll(".preset-btn");

function setHintError(message) {
  runHintText.textContent = message;
  runHint.classList.add("error");
}

function clearHintError() {
  runHintText.textContent = DEFAULT_HINT;
  runHint.classList.remove("error");
}

function badgeHtml(status) {
  const label = BADGE_LABEL[status] || BADGE_LABEL.pending;
  if (status === "running") {
    return `<span class="badge badge-running"><span class="badge-dot"></span>${label}</span>`;
  }
  const cls = status === "pass" || status === "fail" || status === "warn" ? status : "pending";
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function renderCheckList(listEl, group) {
  listEl.innerHTML = CHECK_DEFS.filter((def) => def.group === group)
    .map((def) => {
      const state = checkState.get(def.id) || { status: "pending", detail: null };
      const detailHtml = state.detail
        ? `<div class="check-row-detail${state.status === "fail" ? " detail-fail" : ""}">${escapeHtml(state.detail)}</div>`
        : "";
      return `
      <div class="check-row">
        <div class="check-row-main">
          <div class="check-row-name">${escapeHtml(def.name)}</div>
          <div class="check-row-desc">${escapeHtml(def.description)}</div>
          ${detailHtml}
        </div>
        ${badgeHtml(state.status)}
      </div>`;
    })
    .join("");
}

function renderChecks() {
  renderCheckList(conformanceList, "conformance");
  renderCheckList(securityList, "security");
}

function renderSummary(kind) {
  const statuses = CHECK_DEFS.map((def) => checkState.get(def.id).status);
  const settled = statuses.filter((s) => s === "pass" || s === "fail" || s === "warn").length;
  const passed = statuses.filter((s) => s === "pass").length;
  const failed = statuses.filter((s) => s === "fail").length;
  const warned = statuses.filter((s) => s === "warn").length;

  resultsDot.className = `dot ${kind}`;

  if (kind === "error") {
    resultsSummaryText.textContent = "Run failed — see message above.";
    return;
  }

  if (settled < CHECK_DEFS.length) {
    resultsSummaryText.textContent = `${settled} of ${CHECK_DEFS.length} checks complete`;
    return;
  }

  const parts = [`${passed} passed`, `${failed} failed`];
  if (warned > 0) parts.push(`${warned} warned`);
  resultsSummaryText.textContent = parts.join(", ");
}

function applyChecksArray(checksArr) {
  checksArr.forEach((c) => {
    if (checkState.has(c.id)) {
      checkState.set(c.id, { status: c.status || "pending", detail: c.detail || null });
    }
  });
}

// Fallback for the (should-be-rare) case where a 'complete' response has no
// cached `checks` array — reconstruct from the legacy `result` shape
// (CLI's --output json: { name, category, status: "PASS"|"FAIL", detail }).
function applyLegacyResult(resultArr) {
  resultArr.forEach((r) => {
    if (checkState.has(r.name)) {
      checkState.set(r.name, { status: r.status === "PASS" ? "pass" : "fail", detail: r.detail || null });
    }
  });
}

function setRunning(isRunning) {
  runBtn.disabled = isRunning;
  vaultInput.disabled = isRunning;
  runBtn.textContent = isRunning ? "Running…" : "Run check suite";
}

function pollJob(jobId, attempt) {
  if (attempt > MAX_POLL_ATTEMPTS) {
    resultsLede.textContent = "Gave up waiting for a result — the check is taking unusually long. Please try again later.";
    renderSummary("error");
    setRunning(false);
    return;
  }

  fetch(`${API_BASE}/api/check/${jobId}`)
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ body }) => {
      if (body.status === "processing") {
        if (Array.isArray(body.checks)) applyChecksArray(body.checks);
        renderChecks();
        renderSummary("running");
        resultsLede.textContent = "Processing… usually 1–2 minutes.";
        setTimeout(() => pollJob(jobId, attempt + 1), POLL_INTERVAL_MS);
        return;
      }

      if (body.status === "complete") {
        if (Array.isArray(body.checks)) {
          applyChecksArray(body.checks);
        } else if (Array.isArray(body.result)) {
          applyLegacyResult(body.result);
        }
        renderChecks();
        renderSummary("done");
        resultsLede.textContent = "Done.";
        setRunning(false);
        return;
      }

      // status === "error", or an unexpected shape
      resultsLede.textContent = body.error || "The check failed for an unknown reason.";
      renderSummary("error");
      setRunning(false);
    })
    .catch((err) => {
      resultsLede.textContent = `Lost connection while checking job status: ${err.message}`;
      renderSummary("error");
      setRunning(false);
    });
}

function runCheck() {
  const vault = vaultInput.value.trim();

  if (!VAULT_ADDRESS_RE.test(vault)) {
    setHintError('Invalid address — must start with "C" and be 56 characters long.');
    return;
  }
  clearHintError();

  resetCheckState();
  resultsPanel.hidden = false;
  renderChecks();
  renderSummary("running");
  resultsLede.textContent = "Starting check…";
  setRunning(true);

  fetch(`${API_BASE}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vault }),
  })
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok || !body.jobId) {
        resultsLede.textContent = body.error || "Failed to start the check.";
        renderSummary("error");
        setRunning(false);
        return;
      }
      pollJob(body.jobId, 1);
    })
    .catch((err) => {
      resultsLede.textContent = `Could not reach the backend: ${err.message}`;
      renderSummary("error");
      setRunning(false);
    });
}

runBtn.addEventListener("click", runCheck);

vaultInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runCheck();
});

vaultInput.addEventListener("input", () => {
  if (runHint.classList.contains("error")) clearHintError();
  presetButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.vault === vaultInput.value.trim()));
});

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    vaultInput.value = btn.dataset.vault;
    clearHintError();
    presetButtons.forEach((b) => b.classList.toggle("active", b === btn));
    vaultInput.focus();
  });
});
