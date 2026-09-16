mod rpc;
mod checks;

use checks::CheckResult;

const REFERENCE_VAULT_CONTRACT_ID: &str = "CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF";
const SOURCE_ACCOUNT: &str = "alice";

#[tokio::main]
async fn main() {
    let results: Vec<CheckResult> = vec![
        checks::check_total_assets(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_deposit(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_mint(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
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
