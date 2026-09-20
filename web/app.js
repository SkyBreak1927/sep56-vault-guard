// Two independent result renderers on this page:
// 1. The static "Example Run" section, loaded once from results.json
//    (a snapshot from a manual `sep56-vault-guard --output json` run).
// 2. The "Run a Live Check" section, driven by the live backend below.
// Both consume the same shape per check: { name, category, status, detail }.

const API_BASE = "https://aegis-vault-backend.onrender.com";
const VAULT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 90; // ~7.5 minutes, comfortably above the backend's own timeout

function renderSummary(results, elementId) {
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = total - passed;

  const summary = document.getElementById(elementId);
  summary.innerHTML = `
    <div class="summary-stat">
      <div class="value">${total}</div>
      <div class="label">Total Checks</div>
    </div>
    <div class="summary-stat pass">
      <div class="value">${passed}</div>
      <div class="label">Passed</div>
    </div>
    <div class="summary-stat fail">
      <div class="value">${failed}</div>
      <div class="label">Failed</div>
    </div>
  `;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderChecks(results, elementId) {
  const list = document.getElementById(elementId);
  list.innerHTML = results
    .map((r) => {
      const passed = r.status === "PASS";
      return `
      <div class="check-row">
        <div class="check-row-head">
          <span class="badge ${passed ? "pass" : "fail"}">${r.status}</span>
          <span class="check-name">${escapeHtml(r.name)}</span>
          <span class="check-category">${escapeHtml(r.category)}</span>
        </div>
        <p class="check-detail">${escapeHtml(r.detail)}</p>
      </div>
    `;
    })
    .join("");
}

// --- Static "Example Run" section -------------------------------------

fetch("results.json")
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((results) => {
    renderSummary(results, "run-summary");
    renderChecks(results, "check-list");
  })
  .catch((err) => {
    document.getElementById("check-list").innerHTML =
      `<p class="check-detail">Failed to load results.json: ${escapeHtml(err.message)}</p>`;
  });

// --- "Run a Live Check" section ------------------------------------------

const checkForm = document.getElementById("check-form");
const vaultInput = document.getElementById("vault-input");
const runCheckBtn = document.getElementById("run-check-btn");
const liveStatus = document.getElementById("live-status");
const liveSummaryId = "live-run-summary";
const liveCheckListId = "live-check-list";

function setLiveStatus(kind, message) {
  liveStatus.hidden = false;
  liveStatus.className = `live-status ${kind}`;
  liveStatus.textContent = message;
}

function clearLiveStatus() {
  liveStatus.hidden = true;
  liveStatus.textContent = "";
  liveStatus.className = "live-status";
}

function clearLiveResults() {
  document.getElementById(liveSummaryId).innerHTML = "";
  document.getElementById(liveCheckListId).innerHTML = "";
}

function setFormBusy(busy) {
  runCheckBtn.disabled = busy;
  vaultInput.disabled = busy;
  runCheckBtn.textContent = busy ? "Running…" : "Run Check";
}

function pollJob(jobId, attempt) {
  if (attempt > MAX_POLL_ATTEMPTS) {
    setLiveStatus("error", "Gave up waiting for a result — the check is taking unusually long. Please try again later.");
    setFormBusy(false);
    return;
  }

  fetch(`${API_BASE}/api/check/${jobId}`)
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (body.status === "processing") {
        setLiveStatus("processing", "Processing… this usually takes about 1–2 minutes.");
        setTimeout(() => pollJob(jobId, attempt + 1), POLL_INTERVAL_MS);
        return;
      }

      if (body.status === "complete") {
        clearLiveStatus();
        renderSummary(body.result, liveSummaryId);
        renderChecks(body.result, liveCheckListId);
        setFormBusy(false);
        return;
      }

      // status === "error", or an unexpected shape
      setLiveStatus("error", body.error || "The check failed for an unknown reason.");
      setFormBusy(false);
    })
    .catch((err) => {
      setLiveStatus("error", `Lost connection while checking job status: ${err.message}`);
      setFormBusy(false);
    });
}

checkForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const vault = vaultInput.value.trim();

  if (!VAULT_ADDRESS_RE.test(vault)) {
    setLiveStatus("error", 'Invalid address — a Stellar contract address starts with "C" and is 56 characters long.');
    return;
  }

  clearLiveResults();
  setFormBusy(true);
  setLiveStatus("processing", "Starting check… this usually takes about 1–2 minutes.");

  fetch(`${API_BASE}/api/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vault }),
  })
    .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
      if (!ok || !body.jobId) {
        setLiveStatus("error", body.error || "Failed to start the check.");
        setFormBusy(false);
        return;
      }
      pollJob(body.jobId, 1);
    })
    .catch((err) => {
      setLiveStatus("error", `Could not reach the backend: ${err.message}`);
      setFormBusy(false);
    });
});
