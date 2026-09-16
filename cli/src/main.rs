mod rpc;
mod checks;

const REFERENCE_VAULT_CONTRACT_ID: &str = "CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF";
const SOURCE_ACCOUNT: &str = "alice";

#[tokio::main]
async fn main() {
    let result = checks::check_total_assets(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await;

    let status = if result.passed { "PASS" } else { "FAIL" };
    println!("[{status}] {} - {}", result.name, result.detail);
}
