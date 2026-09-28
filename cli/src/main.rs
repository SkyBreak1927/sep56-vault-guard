mod rpc;
mod checks;
mod status;

use clap::Parser;
use serde::Serialize;

use checks::CheckResult;
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

    let total = results.len();
    let passed = results.iter().filter(|r| r.passed).count();
    let failed = total - passed;

    match cli.output {
        OutputFormat::Text => {
            for result in &results {
                let status = if result.passed { "PASS" } else { "FAIL" };
                println!("[{status}] {} - {}", result.name, result.detail);
            }
            println!("Summary: {total} checks, {passed} passed, {failed} failed");
        }
        OutputFormat::Json => {
            let json_results: Vec<JsonCheckResult> = results
                .iter()
                .map(|r| JsonCheckResult {
                    name: &r.name,
                    category: category_for(&r.name),
                    status: if r.passed { "PASS" } else { "FAIL" },
                    detail: &r.detail,
                })
                .collect();
            let output =
                serde_json::to_string_pretty(&json_results).expect("results are serializable");
            println!("{output}");
        }
    }

    if failed > 0 {
        std::process::exit(1);
    }
}
