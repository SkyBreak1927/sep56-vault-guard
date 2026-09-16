use serde_json::Value;

use crate::rpc::invoke_contract;

/// Outcome of a single conformance check.
pub struct CheckResult {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

/// Checks that `total_assets()` can be called on the vault and returns a
/// valid non-negative amount.
///
/// This does not yet compare against a specific expected value — it only
/// validates that the call succeeds and the returned data is sane.
pub async fn check_total_assets(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "total_assets".to_string();

    match invoke_contract(contract_id, "total_assets", &[], source_account).await {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => CheckResult {
                name,
                passed: true,
                detail: format!("total_assets = {amount}"),
            },
            None => CheckResult {
                name,
                passed: false,
                detail: format!(
                    "total_assets returned a non-numeric or negative value: {value}"
                ),
            },
        },
        Err(e) => CheckResult {
            name,
            passed: false,
            detail: format!("invoke_contract failed: {e}"),
        },
    }
}

/// The stellar CLI encodes i128 results as JSON strings (e.g. `"100000000"`)
/// to avoid precision loss, but also accept a plain JSON number as a
/// fallback in case that encoding ever changes for values that fit.
fn parse_non_negative_i128(value: &Value) -> Option<i128> {
    let amount = match value {
        Value::String(s) => s.parse::<i128>().ok()?,
        Value::Number(n) => i128::try_from(n.as_i64()?).ok()?,
        _ => return None,
    };

    (amount >= 0).then_some(amount)
}
