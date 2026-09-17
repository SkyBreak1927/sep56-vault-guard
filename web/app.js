// Loads real check results produced by the CLI (`sep56-vault-guard --output
// json > web/results.json`). Shape per entry: { name, category, status, detail },
// where status is "PASS" or "FAIL".

function renderSummary(results) {
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = total - passed;

  const summary = document.getElementById("run-summary");
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

function renderChecks(results) {
  const list = document.getElementById("check-list");
  list.innerHTML = results
    .map((r) => {
      const passed = r.status === "PASS";
      return `
      <div class="check-row">
        <div class="check-row-head">
          <span class="badge ${passed ? "pass" : "fail"}">${r.status}</span>
          <span class="check-name">${r.name}</span>
          <span class="check-category">${r.category}</span>
        </div>
        <p class="check-detail">${r.detail}</p>
      </div>
    `;
    })
    .join("");
}

function renderError(message) {
  const list = document.getElementById("check-list");
  list.innerHTML = `<p class="check-detail">Failed to load results.json: ${message}</p>`;
}

fetch("results.json")
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((results) => {
    renderSummary(results);
    renderChecks(results);
  })
  .catch((err) => renderError(err.message));
