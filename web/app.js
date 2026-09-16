// Placeholder/dummy data only — not yet wired up to the actual CLI output.
// Shape mirrors the CLI's CheckResult: { name, passed, detail }.
const DUMMY_CHECK_RESULTS = [
  { name: "total_assets", passed: true, detail: "total_assets = 154501000" },
  { name: "deposit", passed: true, detail: "deposited 5000000 stroops, minted 5000000 shares (1:1 ratio)" },
  { name: "mint", passed: true, detail: "minted 3000000 shares, pulled 3000000 assets (1:1 ratio)" },
  { name: "withdraw", passed: true, detail: "withdrew 2000000 stroops, burned 2000000 shares (1:1 ratio)" },
  { name: "redeem", passed: true, detail: "redeemed 1000000 shares, received 1000000 assets (1:1 ratio)" },
  { name: "convert_to_shares", passed: true, detail: "convert_to_shares(4000000) = 4000000 (1:1 ratio)" },
  { name: "convert_to_assets", passed: true, detail: "convert_to_assets(4000000) = 4000000, round-trip consistent" },
  {
    name: "donation_attack",
    passed: false,
    detail:
      "VULNERABLE to donation/inflation attack — victim deposited 5000000 stroops and received 0 shares (0% of expected)",
  },
  { name: "overflow_protection", passed: true, detail: "deposit(assets=i128::MAX) failed cleanly, no corrupted state" },
  { name: "rounding_direction", passed: true, detail: "deposit() floors, mint() ceils — rounding favors the vault" },
  {
    name: "access_control_probing",
    passed: true,
    detail: "unauthorized withdraw rejected; allowance decremented correctly on authorized withdraw",
  },
];

function renderSummary(results) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
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
    .map(
      (r) => `
      <div class="check-row">
        <div class="check-row-head">
          <span class="badge ${r.passed ? "pass" : "fail"}">${r.passed ? "PASS" : "FAIL"}</span>
          <span class="check-name">${r.name}</span>
        </div>
        <p class="check-detail">${r.detail}</p>
      </div>
    `
    )
    .join("");
}

renderSummary(DUMMY_CHECK_RESULTS);
renderChecks(DUMMY_CHECK_RESULTS);
