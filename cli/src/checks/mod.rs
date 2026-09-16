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

    match read_total_assets(contract_id, source_account).await {
        Ok(amount) => CheckResult {
            name,
            passed: true,
            detail: format!("total_assets = {amount}"),
        },
        Err(detail) => CheckResult {
            name,
            passed: false,
            detail,
        },
    }
}

/// Deposits a fixed amount into the vault (receiver = from = operator =
/// `source_account`) and checks that:
/// 1. The shares minted (the call's return value) match the deposited
///    assets 1:1, matching the ratio observed on this vault so far.
/// 2. `total_assets()` after the deposit equals `total_assets()` before
///    the deposit plus the deposited amount.
pub async fn check_deposit(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "deposit".to_string();
    const DEPOSIT_AMOUNT: i128 = 5_000_000; // 0.5 XLM in stroops

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets before deposit: {detail}"),
            }
        }
    };

    let args = vec![
        "--assets".to_string(),
        DEPOSIT_AMOUNT.to_string(),
        "--receiver".to_string(),
        source_account.to_string(),
        "--from".to_string(),
        source_account.to_string(),
        "--operator".to_string(),
        source_account.to_string(),
    ];

    let shares_minted = match invoke_contract(contract_id, "deposit", &args, source_account).await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("deposit returned a non-numeric or negative value: {value}"),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("deposit invoke failed: {e}"),
            }
        }
    };

    if shares_minted != DEPOSIT_AMOUNT {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "shares minted ({shares_minted}) does not match deposited assets \
                 ({DEPOSIT_AMOUNT}) at the expected 1:1 ratio"
            ),
        };
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets after deposit: {detail}"),
            }
        }
    };

    let expected_after = before + DEPOSIT_AMOUNT;
    if after != expected_after {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "total_assets after deposit ({after}) != before ({before}) + deposited \
                 ({DEPOSIT_AMOUNT}) = {expected_after}"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "deposited {DEPOSIT_AMOUNT} stroops, minted {shares_minted} shares (1:1 ratio), \
             total_assets {before} -> {after}"
        ),
    }
}

/// Calls `total_assets()` and parses it as a non-negative `i128`, collapsing
/// both invoke and parse failures into a single human-readable error string.
async fn read_total_assets(contract_id: &str, source_account: &str) -> Result<i128, String> {
    match invoke_contract(contract_id, "total_assets", &[], source_account).await {
        Ok(value) => parse_non_negative_i128(&value)
            .ok_or_else(|| format!("total_assets returned a non-numeric or negative value: {value}")),
        Err(e) => Err(format!("invoke_contract failed: {e}")),
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
