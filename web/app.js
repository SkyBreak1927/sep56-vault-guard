// Drives the "Try It Yourself" + "Results" sections: POST /api/check on the
// backend, then poll GET /api/check/:jobId, which returns a `checks` array
// of all 11 checks (id, group, status, detail) that updates in place as
// each one finishes — the 7 conformance checks run in sequence while the 4
// security checks run concurrently alongside them, so results arrive in no
// fixed overall order and the UI never assumes one.

const API_BASE = "https://aegis-vault-backend.onrender.com";
const VAULT_ADDRESS_RE = /^C[A-Z2-7]{55}$/;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 90; // ~7.5 minutes, comfortably above the backend's own timeout
const DEFAULT_HINT = 'Stellar contract address: starts with "C", 56 characters.';

// Display names come from design-reference/CORRECTED_CONTENT.md; each
// description states what the check verifies, per VAULT_CHECKS.md. The
// backend only ever supplies id/group/status/detail, not human-readable copy.
const CHECK_DEFS = [
  { id: "total_assets", group: "conformance", name: "Total Assets Accounting", description: "total_assets() returns a valid, non-negative value." },
  { id: "deposit", group: "conformance", name: "Deposit Conformance", description: "Minted shares match preview_deposit(), and total_assets() rises by the deposit." },
  { id: "mint", group: "conformance", name: "Mint Conformance", description: "Assets pulled match preview_mint(), and total_assets() rises by that amount." },
  { id: "withdraw", group: "conformance", name: "Withdraw Conformance", description: "Burned shares match preview_withdraw(), and total_assets() falls by the withdrawal." },
  { id: "redeem", group: "conformance", name: "Redeem Conformance", description: "Returned assets match preview_redeem(), and total_assets() falls by that amount." },
  { id: "convert_to_shares", group: "conformance", name: "Convert to Shares Accuracy", description: "A round trip through convert_to_assets() never exceeds the input, and the call is read-only." },
  { id: "convert_to_assets", group: "conformance", name: "Convert to Assets Accuracy", description: "A round trip through convert_to_shares() never exceeds the input, and the call is read-only." },
  { id: "donation_attack", group: "security", name: "Donation/Inflation Attack Resistance", description: "After a dust deposit and a large donation, a later depositor must still get at least 90% of their fair shares." },
  { id: "overflow_protection", group: "security", name: "Overflow Protection", description: "A deposit of i128::MAX must fail cleanly, leaving total_assets() at 0." },
  { id: "rounding_direction", group: "security", name: "Rounding Direction Safety", description: "At a fractional ratio, deposit() rounds shares down and mint() rounds assets up." },
  { id: "access_control_probing", group: "security", name: "Access Control Probing", description: "Operator withdrawals need approval and must stay within the allowance." },
];

const BADGE_LABEL = { pending: "Pending", running: "Running", pass: "Pass", fail: "Fail", warn: "Warn" };

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

// id -> { status, detail }. Reset to all-"pending" at the start of every run.
let checkState = new Map();

// Timing for the current run, all measured in this browser: the backend
// doesn't return timestamps, so these are accurate to one poll interval.
const run = { vault: null, startedAt: null, completedAt: null, settledAt: new Map() };

const FINAL_STATUSES = new Set(["pass", "fail", "warn"]);

function resetCheckState() {
  checkState = new Map(CHECK_DEFS.map((def) => [def.id, { status: "pending", detail: null }]));
  run.settledAt = new Map();
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
const resultsElapsed = document.getElementById("results-elapsed");
const conformanceList = document.getElementById("conformance-list");
const securityList = document.getElementById("security-list");
const groupSummaryEls = {
  conformance: document.getElementById("conformance-summary"),
  security: document.getElementById("security-summary"),
};
const presetButtons = document.querySelectorAll(".preset-btn");
const reportSection = document.getElementById("report");
const exportBtn = document.getElementById("export-btn");
const formatButtons = document.querySelectorAll(".segmented-btn");

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
  const cls = FINAL_STATUSES.has(status) ? status : "pending";
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function countStatuses(defs) {
  const counts = { pass: 0, fail: 0, warn: 0, running: 0, pending: 0 };
  defs.forEach((def) => {
    const status = checkState.get(def.id).status;
    counts[status in counts ? status : "pending"] += 1;
  });
  return counts;
}

// "3 Passed, 2 Running, 2 Pending"; zero counts are left out.
function groupSummaryText(group) {
  const counts = countStatuses(CHECK_DEFS.filter((def) => def.group === group));
  const labels = [["pass", "Passed"], ["fail", "Failed"], ["warn", "Warned"], ["running", "Running"], ["pending", "Pending"]];
  return labels.filter(([key]) => counts[key] > 0).map(([key, label]) => `${counts[key]} ${label}`).join(", ");
}

function renderCheckList(listEl, group) {
  listEl.innerHTML = CHECK_DEFS.filter((def) => def.group === group)
    .map((def) => {
      const state = checkState.get(def.id) || { status: "pending", detail: null };
      const detailHtml = state.detail
        ? `<div class="check-card-detail${state.status === "fail" ? " detail-fail" : ""}">${escapeHtml(state.detail)}</div>`
        : "";
      return `
      <div class="check-card check-card-${escapeHtml(state.status)}">
        <div class="check-card-top">
          <div class="check-card-name">${escapeHtml(def.name)}</div>
          ${badgeHtml(state.status)}
        </div>
        <div class="check-card-desc">${escapeHtml(def.description)}</div>
        ${detailHtml}
      </div>`;
    })
    .join("");
  groupSummaryEls[group].textContent = groupSummaryText(group);
}

function renderChecks() {
  renderCheckList(conformanceList, "conformance");
  renderCheckList(securityList, "security");
}

function renderSummary(kind) {
  const counts = countStatuses(CHECK_DEFS);
  const settled = counts.pass + counts.fail + counts.warn;

  resultsDot.className = `dot ${kind}`;

  if (kind === "error") {
    resultsSummaryText.textContent = "Run failed. See the message above.";
    return;
  }

  if (settled < CHECK_DEFS.length) {
    resultsSummaryText.textContent = `Running: ${settled} of ${CHECK_DEFS.length} checks complete`;
    return;
  }

  const parts = [`${counts.pass} passed`, `${counts.fail} failed`];
  if (counts.warn > 0) parts.push(`${counts.warn} warned`);
  resultsSummaryText.textContent = `Run complete: ${parts.join(", ")}`;
}

function recordSettled(id, status) {
  if (FINAL_STATUSES.has(status) && !run.settledAt.has(id)) run.settledAt.set(id, Date.now());
}

function applyChecksArray(checksArr) {
  checksArr.forEach((c) => {
    if (checkState.has(c.id)) {
      checkState.set(c.id, { status: c.status || "pending", detail: c.detail || null });
      recordSettled(c.id, c.status);
    }
  });
}

// Fallback for the (should-be-rare) case where a 'complete' response has no
// cached `checks` array — reconstruct from the legacy `result` shape
// (CLI's --output json: { name, category, status: "PASS"|"FAIL", detail }).
function applyLegacyResult(resultArr) {
  resultArr.forEach((r) => {
    if (checkState.has(r.name)) {
      const status = r.status === "PASS" ? "pass" : "fail";
      checkState.set(r.name, { status, detail: r.detail || null });
      recordSettled(r.name, status);
    }
  });
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

let elapsedTimer = null;

function tickElapsed() {
  if (run.startedAt) resultsElapsed.textContent = formatDuration((run.completedAt || Date.now()) - run.startedAt);
}

function setRunning(isRunning) {
  runBtn.disabled = isRunning;
  vaultInput.disabled = isRunning;
  runBtn.textContent = isRunning ? "Running…" : "Run check suite";
  clearInterval(elapsedTimer);
  if (isRunning) elapsedTimer = setInterval(tickElapsed, 1000);
  tickElapsed();
}

// ---------- Verification report (only for a completed run) ----------

function allSettled() {
  return CHECK_DEFS.every((def) => FINAL_STATUSES.has(checkState.get(def.id).status));
}

function reportData() {
  const counts = countStatuses(CHECK_DEFS);
  const passRate = Math.round((counts.pass / CHECK_DEFS.length) * 1000) / 10;
  return {
    tool: "Aegis Vault",
    vault: run.vault,
    network: "testnet",
    started_at: new Date(run.startedAt).toISOString(),
    completed_at: new Date(run.completedAt).toISOString(),
    duration_seconds: Math.round((run.completedAt - run.startedAt) / 1000),
    summary: { total: CHECK_DEFS.length, pass: counts.pass, fail: counts.fail, warn: counts.warn, pass_rate_percent: passRate },
    checks: CHECK_DEFS.map((def, i) => {
      const state = checkState.get(def.id);
      const settledAt = run.settledAt.get(def.id);
      return {
        number: i + 1,
        id: def.id,
        group: def.group,
        name: def.name,
        status: state.status,
        detail: state.detail,
        settled_at: settledAt ? new Date(settledAt).toISOString() : null,
      };
    }),
    timing_note: "Timestamps are recorded by the browser while polling the backend every 5 s, so each is accurate to about 5 s.",
  };
}

function reportRowsHtml(group, offset) {
  return CHECK_DEFS.filter((def) => def.group === group)
    .map((def, i) => {
      const state = checkState.get(def.id);
      const detail = state.detail && state.status !== "pass"
        ? `<div class="report-row-detail detail-${escapeHtml(state.status)}">${escapeHtml(state.detail)}</div>`
        : "";
      return `
      <li class="report-row report-row-${escapeHtml(state.status)}">
        <span class="report-row-num">${String(offset + i + 1).padStart(2, "0")}</span>
        <div class="report-row-main">
          <div class="report-row-name">${escapeHtml(def.name)}</div>
          ${detail}
        </div>
        ${badgeHtml(state.status)}
      </li>`;
    })
    .join("");
}

function groupCountText(group) {
  const defs = CHECK_DEFS.filter((def) => def.group === group);
  const counts = countStatuses(defs);
  return counts.pass === defs.length ? `${defs.length} of ${defs.length} passed` : `${counts.pass} of ${defs.length} passed`;
}

function renderReport() {
  if (!allSettled() || !run.completedAt) {
    reportSection.hidden = true;
    return;
  }
  const data = reportData();
  const s = data.summary;

  document.getElementById("report-meta").innerHTML =
    `<span class="mono">${escapeHtml(run.vault)}</span>, Testnet, completed ${escapeHtml(new Date(run.completedAt).toLocaleString())}`;
  document.getElementById("report-duration").textContent = `${data.duration_seconds} s`;
  document.getElementById("report-state").innerHTML = [
    `<span class="badge badge-pass">${s.pass} Pass</span>`,
    s.warn > 0 ? `<span class="badge badge-warn">${s.warn} Warn</span>` : "",
    `<span class="badge badge-fail">${s.fail} Fail</span>`,
  ].join("");
  const scoreEl = document.getElementById("report-score");
  scoreEl.textContent = `${s.pass_rate_percent}%`;
  scoreEl.className = `report-stat-value ${s.pass === s.total ? "score-pass" : "score-attention"}`;
  document.getElementById("report-score-label").textContent =
    s.pass === s.total ? "All checks passed" : "Remediation needed";

  document.getElementById("report-conformance").innerHTML = reportRowsHtml("conformance", 0);
  document.getElementById("report-security").innerHTML = reportRowsHtml("security", 7);
  document.getElementById("report-conformance-count").textContent = groupCountText("conformance");
  document.getElementById("report-security-count").textContent = groupCountText("security");

  reportSection.hidden = false;
}

function reportMarkdown(data) {
  const lines = [
    "# Aegis Vault: Conformance Verification Report",
    "",
    `- Vault: \`${data.vault}\``,
    `- Network: ${data.network}`,
    `- Started: ${data.started_at}`,
    `- Completed: ${data.completed_at}`,
    `- Duration: ${data.duration_seconds} s`,
    `- Result: ${data.summary.pass} pass, ${data.summary.warn} warn, ${data.summary.fail} fail (${data.summary.pass_rate_percent}% of ${data.summary.total} checks passed)`,
    "",
  ];
  [["conformance", "Conformance checks"], ["security", "Security checks"]].forEach(([group, title]) => {
    lines.push(`## ${title}`, "", "| # | Check | Status | Settled at | Detail |", "|---|---|---|---|---|");
    data.checks.filter((c) => c.group === group).forEach((c) => {
      const detail = (c.detail || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${String(c.number).padStart(2, "0")} | ${c.name} | ${c.status.toUpperCase()} | ${c.settled_at || "-"} | ${detail} |`);
    });
    lines.push("");
  });
  lines.push(`_${data.timing_note}_`, "");
  return lines.join("\n");
}

let exportFormat = "json";

function exportReport() {
  if (!allSettled() || !run.completedAt) return;
  const data = reportData();
  const isMd = exportFormat === "md";
  const body = isMd ? reportMarkdown(data) : JSON.stringify(data, null, 2);
  const blob = new Blob([body], { type: isMd ? "text/markdown" : "application/json" });
  const stamp = data.completed_at.replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `aegis-vault-report-${data.vault.slice(0, 8)}-${stamp}.${isMd ? "md" : "json"}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

formatButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    exportFormat = btn.dataset.format;
    formatButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
});

exportBtn.addEventListener("click", exportReport);

function pollJob(jobId, attempt) {
  if (attempt > MAX_POLL_ATTEMPTS) {
    resultsLede.textContent = "Gave up waiting for a result: the check is taking unusually long. Please try again later.";
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
        resultsLede.textContent = "Running. Results update every 5 seconds.";
        setTimeout(() => pollJob(jobId, attempt + 1), POLL_INTERVAL_MS);
        return;
      }

      if (body.status === "complete") {
        if (Array.isArray(body.checks)) {
          applyChecksArray(body.checks);
        } else if (Array.isArray(body.result)) {
          applyLegacyResult(body.result);
        }
        run.completedAt = Date.now();
        renderChecks();
        renderSummary("done");
        resultsLede.textContent = "Done.";
        setRunning(false);
        renderReport();
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
    setHintError('Invalid address: must start with "C" and be 56 characters long.');
    return;
  }
  clearHintError();

  resetCheckState();
  run.vault = vault;
  run.startedAt = Date.now();
  run.completedAt = null;
  reportSection.hidden = true;
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
