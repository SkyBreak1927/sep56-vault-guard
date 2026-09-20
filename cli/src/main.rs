mod rpc;
mod checks;

use clap::Parser;
use serde::Serialize;

use checks::CheckResult;

const REFERENCE_VAULT_CONTRACT_ID: &str = "CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF";
const SOURCE_ACCOUNT: &str = "alice";
const VICTIM_ACCOUNT: &str = "bob";
// The 4 adversarial checks below run concurrently (see main()), each
// against its own throwaway vault clone. A `stellar` CLI transaction reads
// its source account's sequence number and submits with sequence+1, so two
// concurrent transactions from the SAME account race for that number —
// these checks are given one dedicated account apiece purely to avoid that,
// not because their on-chain work overlaps in any other way.
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

    // The 7 Positive Conformance checks all read and mutate the SAME live
    // target vault, each one's expected before-state being the previous
    // check's resulting after-state (e.g. deposit's total_assets delta is
    // checked against mint's starting point) — they are genuinely
    // sequential, not just conservatively run one at a time, and must stay
    // in this exact order on this one shared account.
    let total_assets_result = checks::check_total_assets(vault, SOURCE_ACCOUNT).await;
    let deposit_result = checks::check_deposit(vault, SOURCE_ACCOUNT).await;
    let mint_result = checks::check_mint(vault, SOURCE_ACCOUNT).await;
    let withdraw_result = checks::check_withdraw(vault, SOURCE_ACCOUNT).await;
    let redeem_result = checks::check_redeem(vault, SOURCE_ACCOUNT).await;
    let convert_to_shares_result = checks::check_convert_to_shares(vault, SOURCE_ACCOUNT).await;
    let convert_to_assets_result = checks::check_convert_to_assets(vault, SOURCE_ACCOUNT).await;

    // The 4 Security/Adversarial checks are the opposite: each deploys and
    // operates entirely on its own throwaway vault clone, so none of them
    // touch the target vault's state or each other's — they're safe to run
    // concurrently, which matters because each one is itself several
    // sequential network round trips (deploy + a handful of invokes), and
    // that I/O wait time is exactly what concurrency overlaps. See the
    // account constants above for how the sequence-number race that would
    // otherwise cause is avoided.
    let (
        donation_attack_result,
        overflow_protection_result,
        rounding_direction_result,
        access_control_probing_result,
    ) = tokio::join!(
        checks::check_donation_attack(vault, SOURCE_ACCOUNT, VICTIM_ACCOUNT),
        checks::check_overflow_protection(vault, OVERFLOW_DEPLOYER_ACCOUNT),
        checks::check_rounding_direction(vault, ROUNDING_DEPLOYER_ACCOUNT),
        checks::check_access_control_probing(vault, ACCESS_OWNER_ACCOUNT, ACCESS_OPERATOR_ACCOUNT),
    );

    let results: Vec<CheckResult> = vec![
        total_assets_result,
        deposit_result,
        mint_result,
        withdraw_result,
        redeem_result,
        convert_to_shares_result,
        convert_to_assets_result,
        donation_attack_result,
        overflow_protection_result,
        rounding_direction_result,
        access_control_probing_result,
    ];

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
