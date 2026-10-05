mod rpc;
mod checks;
mod preflight;
mod status;

use clap::Parser;
use serde::Serialize;

use checks::{CheckResult, CheckStatus};
use status::{run_tracked, StatusReporter};

const REFERENCE_VAULT_CONTRACT_ID: &str = "CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF";
const SOURCE_ACCOUNT: &str = "alice";
const VICTIM_ACCOUNT: &str = "bob";
// The conformance sequence and the 4 adversarial checks all run concurrently
// (see main()). A `stellar` CLI transaction reads its source account's
// sequence number and submits with sequence+1, so two concurrent
// transactions from the SAME account race for that number — every
// concurrently running check is given its own account(s) purely to avoid
// that. `alice` belongs to the conformance sequence alone, which is why the
// donation attacker needs an account of its own.
const DONATION_ATTACKER_ACCOUNT: &str = "grace";

/// Exit code for a missing prerequisite. Kept distinct from 1, which keeps
/// meaning "the checks ran and at least one of them failed", so a caller can
/// tell "could not run" apart from "ran and found something".
const EXIT_PREFLIGHT_FAILED: i32 = 2;
const OVERFLOW_DEPLOYER_ACCOUNT: &str = "carol";
const ROUNDING_DEPLOYER_ACCOUNT: &str = "dave";
const ACCESS_OWNER_ACCOUNT: &str = "erin";
const ACCESS_OPERATOR_ACCOUNT: &str = "frank";

/// SEP-56 tokenized vault conformance checker.
#[derive(Parser)]
struct Cli {
    /// Contract address of the vault to check. Defaults to our own
    /// reference vault deployment.
    #[arg(long, default_value = REFERENCE_VAULT_CONTRACT_ID)]
    vault: String,

    /// Output format: human-readable text, or a JSON array for
    /// programmatic consumption (e.g. by the web UI).
    #[arg(long, value_enum, default_value = "text")]
    output: OutputFormat,

    /// Optional path to write a live-updating JSON status file to, as each
    /// check starts and finishes — for a caller (e.g. a backend polling on
    /// behalf of a web client) that wants real-time, per-check progress
    /// instead of waiting for the full run to finish. When omitted, no
    /// status file is written and behavior is otherwise unchanged.
    #[arg(long)]
    status_file: Option<std::path::PathBuf>,
}

#[derive(Clone, clap::ValueEnum)]
enum OutputFormat {
    Text,
    Json,
}

/// One check's result, shaped for JSON export (`--output json`).
#[derive(Serialize)]
struct JsonCheckResult<'a> {
    name: &'a str,
    category: &'static str,
    status: &'static str,
    detail: &'a str,
    /// Only written when there is a value, so a result without one serializes
    /// exactly as before this field existed.
    #[serde(skip_serializing_if = "Option::is_none")]
    reason_code: Option<&'static str>,
}

/// How many results ended in each status.
#[derive(Debug, PartialEq, Eq)]
struct Tally {
    total: usize,
    passed: usize,
    failed: usize,
    inconclusive: usize,
    not_applicable: usize,
}

fn tally(results: &[CheckResult]) -> Tally {
    let count = |status: CheckStatus| results.iter().filter(|r| r.status == status).count();
    Tally {
        total: results.len(),
        passed: count(CheckStatus::Pass),
        failed: count(CheckStatus::Fail),
        inconclusive: count(CheckStatus::Inconclusive),
        not_applicable: count(CheckStatus::NotApplicable),
    }
}

fn summary_line(tally: &Tally) -> String {
    format!("Summary: {} checks, {} passed, {} failed", tally.total, tally.passed, tally.failed)
}

fn json_results(results: &[CheckResult]) -> Vec<JsonCheckResult<'_>> {
    results
        .iter()
        .map(|r| JsonCheckResult {
            name: &r.name,
            category: category_for(&r.name),
            status: r.status.as_report_str(),
            detail: &r.detail,
            reason_code: r.reason_code,
        })
        .collect()
}

/// Classifies a check by name into the two categories documented in
/// VAULT_CHECKS.md: the 7 Positive Conformance checks validate the core
/// SEP-56 interface directly on the target vault, while the 4
/// Security/Adversarial checks deploy their own throwaway vault clones.
fn category_for(check_name: &str) -> &'static str {
    match check_name {
        "total_assets" | "deposit" | "mint" | "withdraw" | "redeem" | "convert_to_shares"
        | "convert_to_assets" => "Positive Conformance",
        "donation_attack" | "overflow_protection" | "rounding_direction"
        | "access_control_probing" => "Security/Adversarial",
        _ => "Unknown",
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let vault = cli.vault.as_str();

    // Prerequisites first. A missing `stellar`, a missing identity or an
    // address that is not a contract is a problem with the environment, not a
    // finding about the vault, so it is reported on its own terms and no check
    // runs. Every account the checks below use is listed here.
    let accounts = [
        SOURCE_ACCOUNT,
        VICTIM_ACCOUNT,
        DONATION_ATTACKER_ACCOUNT,
        OVERFLOW_DEPLOYER_ACCOUNT,
        ROUNDING_DEPLOYER_ACCOUNT,
        ACCESS_OWNER_ACCOUNT,
        ACCESS_OPERATOR_ACCOUNT,
    ];
    match preflight::run(vault, &accounts).await {
        // Warnings go to stderr in both formats, so stdout stays exactly the
        // payload a consumer parses.
        Ok(preflight) => {
            for warning in &preflight.warnings {
                eprintln!("[WARN] {warning}");
            }
        }
        Err(failure) => {
            match cli.output {
                OutputFormat::Text => {
                    eprintln!("Prerequisite missing: {}", failure.problem);
                    eprintln!();
                    eprintln!("{}", failure.fix);
                    eprintln!();
                    eprintln!("No checks were run.");
                }
                OutputFormat::Json => {
                    let output = serde_json::to_string_pretty(&failure)
                        .expect("the preflight error is serializable");
                    println!("{output}");
                }
            }
            std::process::exit(EXIT_PREFLIGHT_FAILED);
        }
    }

    let status_reporter = StatusReporter::new(cli.status_file.clone(), vault).await;

    // The 7 Positive Conformance checks all read and mutate the SAME live
    // target vault and assert exact total_assets deltas (or, for the two
    // convert_* checks, that total_assets is unchanged) — running them
    // concurrently with each other would let one check's deposit or
    // withdrawal land inside another's before/after window and produce a
    // false FAIL. So they stay strictly sequential, in this order, on this
    // one account.
    let conformance = async {
        let total_assets = run_tracked(
            &status_reporter,
            "total_assets",
            checks::check_total_assets(vault, SOURCE_ACCOUNT),
        )
        .await;
        let deposit =
            run_tracked(&status_reporter, "deposit", checks::check_deposit(vault, SOURCE_ACCOUNT))
                .await;
        let mint =
            run_tracked(&status_reporter, "mint", checks::check_mint(vault, SOURCE_ACCOUNT)).await;
        let withdraw = run_tracked(
            &status_reporter,
            "withdraw",
            checks::check_withdraw(vault, SOURCE_ACCOUNT),
        )
        .await;
        let redeem =
            run_tracked(&status_reporter, "redeem", checks::check_redeem(vault, SOURCE_ACCOUNT))
                .await;
        let convert_to_shares = run_tracked(
            &status_reporter,
            "convert_to_shares",
            checks::check_convert_to_shares(vault, SOURCE_ACCOUNT),
        )
        .await;
        let convert_to_assets = run_tracked(
            &status_reporter,
            "convert_to_assets",
            checks::check_convert_to_assets(vault, SOURCE_ACCOUNT),
        )
        .await;
        [total_assets, deposit, mint, withdraw, redeem, convert_to_shares, convert_to_assets]
    };

    // The 4 Security/Adversarial checks are the opposite: each deploys and
    // operates entirely on its own throwaway vault clone and only *reads* the
    // target vault (wasm hash, asset, decimals), so none of them touch the
    // target vault's state or each other's. They therefore run concurrently
    // with each other AND with the conformance sequence above — the overlap
    // is where the time goes, since every check is a chain of network round
    // trips. See the account constants above for how the sequence-number race
    // this would otherwise cause is avoided. Each is wrapped in `run_tracked`,
    // so its status file entry updates the instant *that* check finishes.
    let security = async {
        tokio::join!(
            run_tracked(
                &status_reporter,
                "donation_attack",
                checks::check_donation_attack(vault, DONATION_ATTACKER_ACCOUNT, VICTIM_ACCOUNT),
            ),
            run_tracked(
                &status_reporter,
                "overflow_protection",
                checks::check_overflow_protection(vault, OVERFLOW_DEPLOYER_ACCOUNT),
            ),
            run_tracked(
                &status_reporter,
                "rounding_direction",
                checks::check_rounding_direction(vault, ROUNDING_DEPLOYER_ACCOUNT),
            ),
            run_tracked(
                &status_reporter,
                "access_control_probing",
                checks::check_access_control_probing(
                    vault,
                    ACCESS_OWNER_ACCOUNT,
                    ACCESS_OPERATOR_ACCOUNT
                ),
            ),
        )
    };

    let (
        conformance_results,
        (
            donation_attack_result,
            overflow_protection_result,
            rounding_direction_result,
            access_control_probing_result,
        ),
    ) = tokio::join!(conformance, security);

    let results: Vec<CheckResult> = conformance_results
        .into_iter()
        .chain([
            donation_attack_result,
            overflow_protection_result,
            rounding_direction_result,
            access_control_probing_result,
        ])
        .collect();

    let tally = tally(&results);

    match cli.output {
        OutputFormat::Text => {
            for result in &results {
                println!(
                    "[{}] {} - {}",
                    result.status.as_report_str(),
                    result.name,
                    result.detail
                );
            }
            println!("{}", summary_line(&tally));
        }
        OutputFormat::Json => {
            let output = serde_json::to_string_pretty(&json_results(&results))
                .expect("results are serializable");
            println!("{output}");
        }
    }

    // Exit codes are unchanged in this step: 1 whenever a check failed. The
    // other two statuses do not affect it yet.
    if tally.failed > 0 {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(name: &str, status: CheckStatus, reason_code: Option<&'static str>) -> CheckResult {
        CheckResult {
            name: name.to_string(),
            status,
            reason_code,
            detail: format!("detail for {name}"),
        }
    }

    #[test]
    fn report_strings_for_all_four_statuses() {
        assert_eq!(CheckStatus::Pass.as_report_str(), "PASS");
        assert_eq!(CheckStatus::Fail.as_report_str(), "FAIL");
        assert_eq!(CheckStatus::Inconclusive.as_report_str(), "INCONCLUSIVE");
        assert_eq!(CheckStatus::NotApplicable.as_report_str(), "NOT_APPLICABLE");
    }

    #[test]
    fn json_omits_reason_code_when_there_is_none() {
        let results = [result("deposit", CheckStatus::Pass, None)];
        let json = serde_json::to_string(&json_results(&results)).unwrap();
        assert_eq!(
            json,
            r#"[{"name":"deposit","category":"Positive Conformance","status":"PASS","detail":"detail for deposit"}]"#
        );
        assert!(!json.contains("reason_code"));
    }

    #[test]
    fn json_writes_reason_code_when_there_is_one() {
        let results = [result(
            "donation_attack",
            CheckStatus::Inconclusive,
            Some("insufficient_token_balance"),
        )];
        let json = serde_json::to_string(&json_results(&results)).unwrap();
        assert_eq!(
            json,
            r#"[{"name":"donation_attack","category":"Security/Adversarial","status":"INCONCLUSIVE","detail":"detail for donation_attack","reason_code":"insufficient_token_balance"}]"#
        );
    }

    #[test]
    fn tally_counts_a_mix_of_statuses() {
        let results = [
            result("total_assets", CheckStatus::Pass, None),
            result("deposit", CheckStatus::Pass, None),
            result("mint", CheckStatus::Fail, None),
            result("withdraw", CheckStatus::Inconclusive, Some("x")),
            result("redeem", CheckStatus::NotApplicable, Some("y")),
            result("convert_to_shares", CheckStatus::Inconclusive, Some("x")),
        ];
        assert_eq!(
            tally(&results),
            Tally { total: 6, passed: 2, failed: 1, inconclusive: 2, not_applicable: 1 }
        );
    }

    #[test]
    fn failed_comes_from_fail_not_from_total_minus_passed() {
        // Under the old `total - passed` rule this would report 3 failed.
        let results = [
            result("total_assets", CheckStatus::Pass, None),
            result("deposit", CheckStatus::Inconclusive, Some("x")),
            result("mint", CheckStatus::NotApplicable, Some("y")),
            result("withdraw", CheckStatus::Fail, None),
        ];
        let t = tally(&results);
        assert_eq!(t.failed, 1);
        assert_eq!(summary_line(&t), "Summary: 4 checks, 1 passed, 1 failed");
    }

    #[test]
    fn summary_line_for_passes_and_fails_only_keeps_its_shape() {
        let results = [
            result("total_assets", CheckStatus::Pass, None),
            result("deposit", CheckStatus::Fail, None),
        ];
        assert_eq!(summary_line(&tally(&results)), "Summary: 2 checks, 1 passed, 1 failed");
    }
}
