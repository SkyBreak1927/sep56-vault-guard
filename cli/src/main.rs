mod rpc;
mod checks;

use checks::CheckResult;

const REFERENCE_VAULT_CONTRACT_ID: &str = "CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF";
const REFERENCE_VAULT_WASM_HASH: &str =
    "8e9f12ca88aa575eaa28fd959f124eeceb636a3bf28d053254ae1a3ed3f60b3d";
const NATIVE_XLM_SAC_TESTNET: &str = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const SOURCE_ACCOUNT: &str = "alice";
const VICTIM_ACCOUNT: &str = "bob";

#[tokio::main]
async fn main() {
    let results: Vec<CheckResult> = vec![
        checks::check_total_assets(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_deposit(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_mint(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_withdraw(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_redeem(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_convert_to_shares(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_convert_to_assets(REFERENCE_VAULT_CONTRACT_ID, SOURCE_ACCOUNT).await,
        checks::check_donation_attack(
            REFERENCE_VAULT_WASM_HASH,
            SOURCE_ACCOUNT,
            VICTIM_ACCOUNT,
            NATIVE_XLM_SAC_TESTNET,
        )
        .await,
        checks::check_overflow_protection(
            REFERENCE_VAULT_WASM_HASH,
            SOURCE_ACCOUNT,
            NATIVE_XLM_SAC_TESTNET,
        )
        .await,
        checks::check_rounding_direction(
            REFERENCE_VAULT_WASM_HASH,
            SOURCE_ACCOUNT,
            NATIVE_XLM_SAC_TESTNET,
        )
        .await,
        checks::check_access_control_probing(
            REFERENCE_VAULT_WASM_HASH,
            SOURCE_ACCOUNT,
            VICTIM_ACCOUNT,
            NATIVE_XLM_SAC_TESTNET,
        )
        .await,
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
