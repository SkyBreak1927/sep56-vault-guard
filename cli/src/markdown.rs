//! `--output markdown`: a Markdown report of a finished run, or of a failed
//! preflight. It follows the Markdown export of the web checker
//! (`web/src/lib/report.ts`): the same title, header list, summary lines and
//! per-group tables. Nothing here runs a check or changes an exit code, and the
//! `text` and `json` formats do not use this module.
//!
//! Two parts of the web report have no CLI equivalent and are left out: the
//! "Settled at" column (the CLI does not record when each check finished) and
//! the commit in the "Checker" line (the CLI knows its version only).

use crate::category_for;
use crate::checks::{CheckResult, CheckStatus};
use crate::preflight::PreflightError;

/// The SEP-56 text the checks were written against; keep in step with
/// VAULT_CHECKS.md and `SPEC_REFERENCE` in `web/src/lib/report.ts`.
const SPEC_REFERENCE: &str = "SEP-0056 v0.1.2 (Draft)";

const TITLE: &str = "# Aegis Vault — Conformance Verification Report";

/// What the report says about the run itself.
pub struct RunInfo<'a> {
    pub vault: &'a str,
    pub cli_version: &'a str,
    /// Unix time in milliseconds, taken just before the checks start.
    pub started_ms: u64,
    /// Unix time in milliseconds, taken once every check has finished.
    pub completed_ms: u64,
}

/// Backslash-escapes the characters Markdown would otherwise act on, and puts
/// line breaks on one line so a value stays inside its table cell or list item.
fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '\\' | '`' | '*' | '_' | '[' | ']' | '<' | '>' | '|' => {
                out.push('\\');
                out.push(c);
            }
            '\r' | '\n' => {
                if !out.ends_with(' ') {
                    out.push(' ');
                }
            }
            other => out.push(other),
        }
    }
    out
}

/// A value in a code span. A value that itself contains a backtick cannot be
/// put in one, so it is escaped as plain text instead.
fn code_span(text: &str) -> String {
    if text.contains('`') || text.contains('\n') || text.contains('\r') {
        escape(text)
    } else {
        format!("`{text}`")
    }
}

/// `YYYY-MM-DDTHH:MM:SS.mmmZ` (UTC), the shape JavaScript's `toISOString`
/// gives the web report.
fn iso_utc(unix_ms: u64) -> String {
    let secs = unix_ms / 1000;
    let millis = unix_ms % 1000;
    let days = (secs / 86_400) as i64;
    let in_day = secs % 86_400;
    // Days since 1970-01-01 to a civil date (proleptic Gregorian).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era = (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 { month_index + 3 } else { month_index - 9 };
    let year = year_of_era + era * 400 + if month <= 2 { 1 } else { 0 };
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        in_day / 3_600,
        (in_day % 3_600) / 60,
        in_day % 60
    )
}

struct Counts {
    pass: usize,
    fail: usize,
    inconclusive: usize,
    not_applicable: usize,
}

fn count(results: &[&CheckResult]) -> Counts {
    let of = |status: CheckStatus| results.iter().filter(|r| r.status == status).count();
    Counts {
        pass: of(CheckStatus::Pass),
        fail: of(CheckStatus::Fail),
        inconclusive: of(CheckStatus::Inconclusive),
        not_applicable: of(CheckStatus::NotApplicable),
    }
}

/// Headline for the run as a whole (`summaryTitle` in the web report).
fn summary_title(counts: &Counts, total: usize) -> &'static str {
    if counts.fail > 0 {
        "Remediation needed"
    } else if counts.inconclusive > 0 {
        "Some checks could not finish"
    } else if total - counts.not_applicable == 0 {
        "No applicable checks"
    } else if counts.not_applicable > 0 {
        "All applicable checks passed"
    } else {
        "All checks passed"
    }
}

/// "X of N passed" for one group, where N leaves out the checks that did not
/// apply (`summaryLines` in the web report).
fn group_line(label: &str, members: &[&CheckResult]) -> String {
    let counts = count(members);
    let total = members.len() - counts.not_applicable;
    if total == 0 {
        format!("{label}: not applicable")
    } else {
        format!("{label}: {} of {total} passed", counts.pass)
    }
}

/// The report for a finished run.
pub fn run_report(info: &RunInfo<'_>, results: &[CheckResult]) -> String {
    let conformance: Vec<&CheckResult> =
        results.iter().filter(|r| category_for(&r.name) == "Positive Conformance").collect();
    let security: Vec<&CheckResult> =
        results.iter().filter(|r| category_for(&r.name) == "Security/Adversarial").collect();
    let all: Vec<&CheckResult> = results.iter().collect();
    let counts = count(&all);

    let mut lines = header(info.vault, info.cli_version);
    lines.push(format!("- Started: {}", iso_utc(info.started_ms)));
    lines.push(format!("- Completed: {}", iso_utc(info.completed_ms)));
    let elapsed_ms = info.completed_ms.saturating_sub(info.started_ms);
    lines.push(format!("- Duration: {} s", (elapsed_ms + 500) / 1000));
    lines.push(format!("- Result: {}", summary_title(&counts, results.len())));
    lines.push(format!("- {}", group_line("Core function checks", &conformance)));
    lines.push(format!("- {}", group_line("Basic security checks", &security)));
    if counts.inconclusive > 0 {
        lines.push(format!("- Inconclusive: {}", counts.inconclusive));
    }
    if counts.not_applicable > 0 {
        lines.push(format!("- Not applicable: {}", counts.not_applicable));
    }
    lines.push(String::new());

    for (title, members) in [("Conformance checks", &conformance), ("Security checks", &security)] {
        lines.push(format!("## {title}"));
        lines.push(String::new());
        lines.push("| # | Check | Status | Detail |".to_string());
        lines.push("|---|---|---|---|".to_string());
        for result in members {
            // Numbered in the fixed check order, as in the web report.
            let number = results.iter().position(|r| std::ptr::eq(r, *result)).map_or(0, |i| i + 1);
            lines.push(format!(
                "| {number:02} | {} | {} | {} |",
                code_span(&result.name),
                result.status.as_report_str(),
                escape(&result.detail)
            ));
        }
        lines.push(String::new());
    }
    lines.push("_Timestamps are recorded by the CLI when the run starts and when it finishes._".to_string());
    lines.push(String::new());
    lines.join("\n")
}

/// The report when a prerequisite is missing and no check ran: the same
/// information as the `{error, code, problem, fix}` object of `--output json`.
pub fn preflight_report(vault: &str, cli_version: &str, failure: &PreflightError) -> String {
    let mut lines = header(vault, cli_version);
    lines.push("- Result: Prerequisite missing, no checks were run".to_string());
    lines.push(String::new());
    lines.push("## Error".to_string());
    lines.push(String::new());
    lines.push(format!("- Error: {}", code_span(failure.error)));
    lines.push(format!("- Code: {}", code_span(failure.code)));
    lines.push(String::new());
    lines.push("### Problem".to_string());
    lines.push(String::new());
    lines.push(escape(&failure.problem));
    lines.push(String::new());
    lines.push("### Fix".to_string());
    lines.push(String::new());
    lines.push(escape(&failure.fix));
    lines.push(String::new());
    lines.push("No checks were run.".to_string());
    lines.push(String::new());
    lines.join("\n")
}

/// The title and the list lines both reports start with.
fn header(vault: &str, cli_version: &str) -> Vec<String> {
    vec![
        TITLE.to_string(),
        String::new(),
        format!("- Vault: {}", code_span(vault)),
        "- Network: testnet".to_string(),
        format!("- Spec: {SPEC_REFERENCE}"),
        format!("- Checker: sep56-vault-guard {}", escape(cli_version)),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    const VAULT: &str = "CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF";

    fn result(name: &str, status: CheckStatus, detail: &str) -> CheckResult {
        CheckResult { name: name.to_string(), status, reason_code: None, detail: detail.to_string() }
    }

    /// The 11 checks in their fixed order, all with the same status.
    fn all_with(status: CheckStatus) -> Vec<CheckResult> {
        [
            "total_assets",
            "deposit",
            "mint",
            "withdraw",
            "redeem",
            "convert_to_shares",
            "convert_to_assets",
            "donation_attack",
            "overflow_protection",
            "rounding_direction",
            "access_control_probing",
        ]
        .iter()
        .map(|name| result(name, status, "d"))
        .collect()
    }

    fn info() -> RunInfo<'static> {
        RunInfo { vault: VAULT, cli_version: "0.4.0", started_ms: 1_760_000_000_000, completed_ms: 1_760_000_061_400 }
    }

    #[test]
    fn iso_utc_matches_known_instants() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_utc(1_760_000_000_000), "2025-10-09T08:53:20.000Z");
        assert_eq!(iso_utc(951_782_400_123), "2000-02-29T00:00:00.123Z");
        assert_eq!(iso_utc(1_709_251_199_999), "2024-02-29T23:59:59.999Z");
    }

    #[test]
    fn escapes_the_characters_markdown_acts_on() {
        assert_eq!(escape("a|b"), "a\\|b");
        assert_eq!(escape("a*b_c"), "a\\*b\\_c");
        assert_eq!(escape("`x` [y] <z> \\"), "\\`x\\` \\[y\\] \\<z\\> \\\\");
        assert_eq!(escape("line one\nline two\r\nthree"), "line one line two three");
    }

    #[test]
    fn code_span_falls_back_to_escaping_when_it_cannot_hold_the_value() {
        assert_eq!(code_span("deposit"), "`deposit`");
        assert_eq!(code_span("a`b"), "a\\`b");
    }

    #[test]
    fn header_and_result_for_a_clean_run() {
        let report = run_report(&info(), &all_with(CheckStatus::Pass));
        assert!(report.starts_with("# Aegis Vault — Conformance Verification Report\n\n"));
        for line in [
            "- Vault: `CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF`",
            "- Network: testnet",
            "- Spec: SEP-0056 v0.1.2 (Draft)",
            "- Checker: sep56-vault-guard 0.4.0",
            "- Started: 2025-10-09T08:53:20.000Z",
            "- Completed: 2025-10-09T08:54:21.400Z",
            "- Duration: 61 s",
            "- Result: All checks passed",
            "- Core function checks: 7 of 7 passed",
            "- Basic security checks: 4 of 4 passed",
        ] {
            assert!(report.lines().any(|l| l == line), "missing line: {line}");
        }
        assert!(!report.contains("- Inconclusive:"));
        assert!(!report.contains("- Not applicable:"));
    }

    #[test]
    fn tables_hold_every_check_in_order_under_its_group() {
        let report = run_report(&info(), &all_with(CheckStatus::Pass));
        let conformance = report.find("## Conformance checks").unwrap();
        let security = report.find("## Security checks").unwrap();
        assert!(conformance < security);
        assert!(report.contains("| # | Check | Status | Detail |\n|---|---|---|---|\n| 01 | `total_assets` | PASS | d |"));
        assert!(report.contains("| 07 | `convert_to_assets` | PASS | d |"));
        assert!(report.contains("| 08 | `donation_attack` | PASS | d |"));
        assert!(report.contains("| 11 | `access_control_probing` | PASS | d |"));
        assert_eq!(report.matches("\n| 0").count() + report.matches("\n| 1").count(), 11);
        // The security rows come after the security heading only.
        assert!(report[..security].contains("| 07 |"));
        assert!(!report[..security].contains("| 08 |"));
    }

    #[test]
    fn a_failure_needs_remediation() {
        let mut results = all_with(CheckStatus::Pass);
        results[7] = result("donation_attack", CheckStatus::Fail, "VULNERABLE");
        let report = run_report(&info(), &results);
        assert!(report.contains("- Result: Remediation needed"));
        assert!(report.contains("- Basic security checks: 3 of 4 passed"));
        assert!(report.contains("| 08 | `donation_attack` | FAIL | VULNERABLE |"));
    }

    #[test]
    fn inconclusive_and_not_applicable_are_counted_and_listed() {
        let mut results = all_with(CheckStatus::Pass);
        results[1] = result("deposit", CheckStatus::Inconclusive, "no balance");
        for i in 7..11 {
            results[i].status = CheckStatus::NotApplicable;
        }
        let report = run_report(&info(), &results);
        assert!(report.contains("- Result: Some checks could not finish"));
        assert!(report.contains("- Core function checks: 6 of 7 passed"));
        assert!(report.contains("- Basic security checks: not applicable"));
        assert!(report.contains("- Inconclusive: 1"));
        assert!(report.contains("- Not applicable: 4"));
        assert!(report.contains("| 02 | `deposit` | INCONCLUSIVE | no balance |"));
        assert!(report.contains("| 11 | `access_control_probing` | NOT_APPLICABLE | d |"));
    }

    #[test]
    fn a_run_where_nothing_applied_says_so() {
        let report = run_report(&info(), &all_with(CheckStatus::NotApplicable));
        assert!(report.contains("- Result: No applicable checks"));
    }

    #[test]
    fn all_applicable_checks_passed_when_only_some_did_not_apply() {
        let mut results = all_with(CheckStatus::Pass);
        results[10].status = CheckStatus::NotApplicable;
        let report = run_report(&info(), &results);
        assert!(report.contains("- Result: All applicable checks passed"));
        assert!(report.contains("- Basic security checks: 3 of 3 passed"));
    }

    #[test]
    fn detail_text_cannot_break_the_table() {
        let mut results = all_with(CheckStatus::Pass);
        results[0] = result("total_assets", CheckStatus::Pass, "a | b *c* _d_\nnext `e` <f> [g]");
        let report = run_report(&info(), &results);
        assert!(report.contains("| 01 | `total_assets` | PASS | a \\| b \\*c\\* \\_d\\_ next \\`e\\` \\<f\\> \\[g\\] |"));
        // Every table row still has exactly four cells (five unescaped bars).
        for row in report.lines().filter(|l| l.starts_with("| 0") || l.starts_with("| 1")) {
            assert_eq!(row.replace("\\|", "").matches('|').count(), 5, "{row}");
        }
    }

    #[test]
    fn a_failed_preflight_reports_code_problem_and_fix() {
        let failure = PreflightError {
            error: "preflight_failed",
            code: "vault_not_a_contract",
            problem: "The address `CABC` is not a contract_on_testnet.".to_string(),
            fix: "Check the address.\nThen run again.".to_string(),
        };
        let report = preflight_report(VAULT, "0.4.0", &failure);
        assert!(report.starts_with("# Aegis Vault — Conformance Verification Report\n\n"));
        for line in [
            "- Vault: `CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF`",
            "- Result: Prerequisite missing, no checks were run",
            "## Error",
            "- Error: `preflight_failed`",
            "- Code: `vault_not_a_contract`",
            "### Problem",
            "The address \\`CABC\\` is not a contract\\_on\\_testnet.",
            "### Fix",
            "Check the address. Then run again.",
            "No checks were run.",
        ] {
            assert!(report.lines().any(|l| l == line), "missing line: {line}");
        }
        assert!(!report.contains("| # |"), "no check table when no check ran");
        assert!(!report.contains("Started:"));
    }

    #[test]
    fn output_has_none_of_the_claims_the_project_does_not_make() {
        let report = run_report(&info(), &all_with(CheckStatus::Pass)).to_lowercase();
        for word in ["audit", "certif", "guarantee", "full conformance", "100% secure", "sertifikasi", "menjamin"] {
            assert!(!report.contains(word), "{word}");
        }
    }
}
