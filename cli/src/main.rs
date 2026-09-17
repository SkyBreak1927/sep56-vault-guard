mod rpc;
mod checks;

use clap::Parser;

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

    for result in &results {
        let status = if result.passed { "PASS" } else { "FAIL" };
        println!("[{status}] {} - {}", result.name, result.detail);
    }

    let total = results.len();
    let passed = results.iter().filter(|r| r.passed).count();
    let failed = total - passed;

    println!("Summary: {total} checks, {passed} passed, {failed} failed");

    if failed > 0 {
        std::process::exit(1);
    }
}
