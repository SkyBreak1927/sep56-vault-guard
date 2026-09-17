mod rpc;
mod checks;

use clap::Parser;
use serde::Serialize;

use checks::CheckResult;

const REFERENCE_VAULT_CONTRACT_ID: &str = "CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF";
const SOURCE_ACCOUNT: &str = "alice";
const VICTIM_ACCOUNT: &str = "bob";

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

    let results: Vec<CheckResult> = vec![
        checks::check_total_assets(vault, SOURCE_ACCOUNT).await,
        checks::check_deposit(vault, SOURCE_ACCOUNT).await,
        checks::check_mint(vault, SOURCE_ACCOUNT).await,
        checks::check_withdraw(vault, SOURCE_ACCOUNT).await,
        checks::check_redeem(vault, SOURCE_ACCOUNT).await,
        checks::check_convert_to_shares(vault, SOURCE_ACCOUNT).await,
        checks::check_convert_to_assets(vault, SOURCE_ACCOUNT).await,
        checks::check_donation_attack(vault, SOURCE_ACCOUNT, VICTIM_ACCOUNT).await,
        checks::check_overflow_protection(vault, SOURCE_ACCOUNT).await,
        checks::check_rounding_direction(vault, SOURCE_ACCOUNT).await,
        checks::check_access_control_probing(vault, SOURCE_ACCOUNT, VICTIM_ACCOUNT).await,
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
