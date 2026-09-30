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

// "3 Passed · 2 Running · 2 Pending" — zero counts are left out.
function groupSummaryText(group) {
  const counts = countStatuses(CHECK_DEFS.filter((def) => def.group === group));
  const labels = [["pass", "Passed"], ["fail", "Failed"], ["warn", "Warned"], ["running", "Running"], ["pending", "Pending"]];
  return labels.filter(([key]) => counts[key] > 0).map(([key, label]) => `${counts[key]} ${label}`).join(" · ");
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
    resultsSummaryText.textContent = "Run failed — see message above.";
    return;
  }

  if (settled < CHECK_DEFS.length) {
    resultsSummaryText.textContent = `Running — ${settled} of ${CHECK_DEFS.length} checks complete`;
    return;
  }

  const parts = [`${counts.pass} passed`, `${counts.fail} failed`];
  if (counts.warn > 0) parts.push(`${counts.warn} warned`);
  resultsSummaryText.textContent = `Run complete — ${parts.join(", ")}`;
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
    `<span class="mono">${escapeHtml(run.vault)}</span> · Testnet · Completed ${escapeHtml(new Date(run.completedAt).toLocaleString())}`;
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
    "# Aegis Vault — Conformance Verification Report",
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
      lines.push(`| ${String(c.number).padStart(2, "0")} | ${c.name} | ${c.status.toUpperCase()} | ${c.settled_at || "—"} | ${detail} |`);
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
    setHintError('Invalid address — must start with "C" and be 56 characters long.');
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

// Scroll-in reveal (progressive enhancement only): sections and cards fade
// up once as they enter the viewport. Nothing is hidden unless the observer
// is available and reduced motion isn't requested, so content stays visible
// if this script fails. The live check cards and report are re-rendered on
// every poll, so they are left out to avoid re-animating them.
(function setupScrollReveal() {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const STAGGER_MS = 60;
  const targets = [];
  [
    "#why-it-matters .section-head",
    "#why-it-matters .risk-card",
    "#try-it .section-head-row",
    "#try-it .run-panel",
    "#results .section-head",
    ".footer-grid",
  ].forEach((selector) => {
    document.querySelectorAll(selector).forEach((el, i) => {
      el.classList.add("reveal");
      if (el.classList.contains("risk-card") && i > 0) {
        // Stagger the cards, then drop the delay so hover stays immediate.
        el.style.transitionDelay = `${i * STAGGER_MS}ms`;
        el.addEventListener("transitionend", () => { el.style.transitionDelay = ""; }, { once: true });
      }
      targets.push(el);
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((el) => observer.observe(el));
})();

// Decorative vault tilt (progressive enhancement only): the cube keeps its own
// CSS spin, and this adds a small extra tilt toward the cursor on top of it.
// Skipped on touch devices and under reduced motion; the vault still renders
// and spins without this script.
(function setupVaultTilt() {
  const tilt = document.querySelector(".cyber-tilt");
  const hero = document.querySelector(".hero");
  if (!tilt || !hero) return;
  if (!window.matchMedia("(hover: hover)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const MAX_TILT_X = 14; // degrees, vertical
  const MAX_TILT_Y = 18; // degrees, horizontal
  let frame = 0;

  hero.addEventListener("mousemove", (event) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const box = hero.getBoundingClientRect();
      const nx = (event.clientX - box.left) / box.width - 0.5;
      const ny = (event.clientY - box.top) / box.height - 0.5;
      tilt.style.transform =
        `rotateX(${(-ny * 2 * MAX_TILT_X).toFixed(2)}deg) rotateY(${(nx * 2 * MAX_TILT_Y).toFixed(2)}deg)`;
    });
  });

  hero.addEventListener("mouseleave", () => {
    tilt.style.transform = "";
  });
})();

// Dot-grid highlight (progressive enhancement only): lights up the dots of the
// existing .hero::before grid near the cursor. The grid's pitch, dot origin and
// dot radius are read from that layer's own computed style, so the highlights
// land exactly on top of it. Skipped on touch devices and under reduced motion.
(function setupDotHighlight() {
  const canvas = document.querySelector(".cyber-dots");
  const hero = document.querySelector(".hero");
  if (!canvas || !hero) return;
  if (!window.matchMedia("(hover: hover)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;

  const base = getComputedStyle(hero, "::before");
  const image = base.backgroundImage || "";
  const pitch = parseFloat(base.backgroundSize) || 24;
  const origin = image.match(/circle at ([\d.]+)px ([\d.]+)px/);
  const originX = origin ? parseFloat(origin[1]) : 1;
  const originY = origin ? parseFloat(origin[2]) : 1;
  const firstStop = image.match(/rgba?\([^)]*\)\s+([\d.]+)px/);
  const dotRadius = firstStop ? parseFloat(firstStop[1]) : 1;

  const SIGMA = 90;          // falloff spread, px
  const REACH = SIGMA * 3;   // only dots this close are drawn
  const MAX_ALPHA = 0.3;     // peak extra opacity
  const MAX_GROWTH = 0.8;    // peak extra radius, px
  const EASE = 0.09;         // cursor smoothing
  const IDLE_MS = 2500;      // after this, the highlight wanders on its own
  const TAU = Math.PI * 2;

  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary").trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(accent);
  const rgb = hex
    ? [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16)]
    : [255, 183, 125];

  let width = 0;
  let height = 0;
  let pointerX = 0;
  let pointerY = 0;
  let spotX = 0;
  let spotY = 0;
  let lastMove = 0;
  let onScreen = true;
  let frame = 0;

  function resize() {
    const box = hero.getBoundingClientRect();
    width = box.width;
    height = box.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    if (!spotX && !spotY) {
      spotX = pointerX = width / 2;
      spotY = pointerY = height * 0.35;
    }
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    const iFrom = Math.max(0, Math.floor((spotX - REACH - originX) / pitch));
    const iTo = Math.ceil((Math.min(spotX + REACH, width) - originX) / pitch);
    const jFrom = Math.max(0, Math.floor((spotY - REACH - originY) / pitch));
    const jTo = Math.ceil((Math.min(spotY + REACH, height) - originY) / pitch);

    for (let i = iFrom; i <= iTo; i++) {
      const cx = originX + i * pitch;
      for (let j = jFrom; j <= jTo; j++) {
        const cy = originY + j * pitch;
        const dx = cx - spotX;
        const dy = cy - spotY;
        const weight = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
        if (weight < 0.01) continue;
        ctx.globalAlpha = MAX_ALPHA * weight;
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius + MAX_GROWTH * weight, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    frame = 0;
    if (!onScreen || document.hidden) return;
    if (now - lastMove > IDLE_MS) {
      const t = now / 1000;
      pointerX = width * (0.5 + 0.28 * Math.sin(t * 0.21));
      pointerY = height * (0.45 + 0.22 * Math.cos(t * 0.17));
    }
    spotX += (pointerX - spotX) * EASE;
    spotY += (pointerY - spotY) * EASE;
    render();
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (!frame && onScreen && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  hero.addEventListener("mousemove", (event) => {
    const box = hero.getBoundingClientRect();
    pointerX = event.clientX - box.left;
    pointerY = event.clientY - box.top;
    lastMove = performance.now();
    start();
  });

  window.addEventListener("resize", () => { resize(); });
  document.addEventListener("visibilitychange", () => { document.hidden ? stop() : start(); });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      onScreen ? start() : stop();
    }, { threshold: 0 }).observe(hero);
  }

  resize();
  start();
})();

// Headline decrypt (progressive enhancement only): on load the hero headline
// scrambles and then locks to its real text from left to right. The markup's
// own text is never changed, only the text nodes' values during the animation,
// and the original strings are restored at the end. Skipped under reduced
// motion, and without JavaScript the headline simply renders as written.
(function setupHeadlineDecrypt() {
  const headline = document.querySelector(".hero h1");
  if (!headline) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const parts = [];
  const walker = document.createTreeWalker(headline, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) parts.push({ node, text: node.nodeValue });
  if (!parts.length) return;

  // Screen readers get the real text for the whole run, and the measured
  // height is pinned so the scrambled glyphs cannot shift the layout.
  headline.setAttribute("aria-label", parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim());
  headline.style.minHeight = `${headline.getBoundingClientRect().height}px`;

  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$";
  const DURATION = 1300;
  const total = parts.reduce((sum, p) => sum + p.text.length, 0);
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / DURATION, 1);
    const locked = Math.floor(progress * total);
    let index = 0;
    for (const part of parts) {
      let out = "";
      for (let i = 0; i < part.text.length; i++, index++) {
        const char = part.text[i];
        out += (index < locked || char === " ") ? char : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      part.node.nodeValue = out;
    }
    if (progress < 1) {
      requestAnimationFrame(step);
      return;
    }
    parts.forEach((part) => { part.node.nodeValue = part.text; });
    headline.style.minHeight = "";
  }

  requestAnimationFrame(step);
})();

// Scroll choreography (progressive enhancement only): a finer second pass on
// top of setupScrollReveal above. That block reveals a section head as one
// piece; this one gives the eyebrow, title and lede their own entrances and
// walks a card grid across in order, so a section arrives in sequence instead
// of all at once. On load it also spaces out whatever is already on screen, so
// the page flows from the hero downward rather than snapping into place.
//
// Nothing the earlier block set up is undone. This pass has its own gate,
// `.rv-in`, whose rules sit later in style.css and so win on cascade order.
// Parents whose children are choreographed here are marked `.rv-host` and stop
// animating as a block. The live check cards and the report are re-rendered on
// every poll, so they stay out of both passes.
(function setupScrollChoreography() {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const HEAD_STAGGER_MS = 90;  // eyebrow, then title, then lede
  const CARD_STAGGER_MS = 100; // across one grid
  const LOAD_BASE_MS = 560;    // picks up while the hero's own fade-up runs
  const LOAD_STEP_MS = 90;     // global flow for what is already on screen

  const targets = [];

  function claim(el, delayMs) {
    el.classList.add("rv");
    if (delayMs) el.style.setProperty("--rv-delay", delayMs + "ms");
    // Drop the delay once the entrance is done so hover stays immediate.
    el.addEventListener("transitionend", () => {
      el.style.removeProperty("--rv-delay");
    }, { once: true });
    targets.push(el);
  }

  function host(el) {
    if (el) el.classList.add("rv-host");
  }

  // Section heads: the three lines enter one after another.
  document.querySelectorAll(
    "#why-it-matters .section-head, #try-it .section-head, #results .section-head"
  ).forEach((head) => {
    const lines = head.querySelectorAll(":scope > .eyebrow, :scope > h2, :scope > .section-lede");
    if (!lines.length) return;
    host(head);
    host(head.closest(".section-head-row"));
    lines.forEach((line, i) => {
      claim(line, i * HEAD_STAGGER_MS);
      if (line.tagName === "H2") line.classList.add("rv-title");
    });
  });

  // Card grids: one wave across the row.
  document.querySelectorAll("#why-it-matters .risk-grid").forEach((grid) => {
    grid.querySelectorAll(":scope > .risk-card").forEach((card, i) => {
      claim(card, i * CARD_STAGGER_MS);
    });
  });

  // Blocks that keep entering as a single piece.
  document.querySelectorAll("#try-it .run-panel").forEach((el) => claim(el, 0));
  document.querySelectorAll(".footer-grid").forEach((grid) => {
    host(grid);
    grid.querySelectorAll(":scope > *").forEach((col, i) => claim(col, i * CARD_STAGGER_MS));
  });

  // Whatever is already on screen at load runs as one global flow instead of
  // its per-group stagger, so the hero and the stat strip lead and the rest
  // follows in document order.
  const fold = window.innerHeight;
  let step = 0;
  targets.forEach((el) => {
    if (el.getBoundingClientRect().top >= fold) return;
    el.style.setProperty("--rv-delay", LOAD_BASE_MS + step * LOAD_STEP_MS + "ms");
    step += 1;
  });

  // Start once the element's top has travelled about 15% up from the bottom
  // edge, rather than the instant it touches it, so an entrance is already
  // under way by the time it is properly in view. The bottom margin only
  // shrinks the root from below, so anything level with or above the fold
  // still counts. Each element is unobserved on its first hit, so the
  // entrance runs exactly once.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("rv-in");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -15% 0px" });

  targets.forEach((el) => observer.observe(el));

  // The amber rule across the top of each section draws itself on the same
  // trigger, but is watched separately: it belongs to the section, not to any
  // one element inside it, and it is decoration only. The section's own 1px
  // border stays and carries the separation by itself.
  const ruleObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("rv-rule-in");
      ruleObserver.unobserve(entry.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -15% 0px" });

  document.querySelectorAll("#why-it-matters, #try-it, #results").forEach((section) => {
    section.classList.add("rv-rule");
    ruleObserver.observe(section);
  });
})();
