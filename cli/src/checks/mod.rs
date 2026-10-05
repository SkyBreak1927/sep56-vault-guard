use serde_json::Value;

use crate::rpc::{
    deploy_contract, diagnose_deploy, diagnose_info_hash, diagnose_invoke,
    fetch_current_ledger_sequence, fetch_wasm_hash, invoke_contract, Diagnosis, ErrorClass,
    RetryNote,
};

/// How a single check ended.
///
/// `Pass` and `Fail` are verdicts about the vault. `Inconclusive` means the
/// check could not reach a verdict (a prerequisite was not met), and
/// `NotApplicable` means the check does not fit this vault's design. No check
/// produces the last two yet.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CheckStatus {
    Pass,
    Fail,
    #[allow(dead_code)]
    Inconclusive,
    #[allow(dead_code)]
    NotApplicable,
}

impl CheckStatus {
    /// The string used in `--output json` and in the text output's prefix.
    pub fn as_report_str(self) -> &'static str {
        match self {
            CheckStatus::Pass => "PASS",
            CheckStatus::Fail => "FAIL",
            CheckStatus::Inconclusive => "INCONCLUSIVE",
            CheckStatus::NotApplicable => "NOT_APPLICABLE",
        }
    }

    /// The string used in the `--status-file` snapshots.
    pub fn as_status_file_str(self) -> &'static str {
        match self {
            CheckStatus::Pass => "pass",
            CheckStatus::Fail => "fail",
            CheckStatus::Inconclusive => "inconclusive",
            CheckStatus::NotApplicable => "not_applicable",
        }
    }
}

/// Outcome of a single conformance check.
pub struct CheckResult {
    pub name: String,
    pub status: CheckStatus,
    /// Machine-readable cause for an `Inconclusive` or `NotApplicable` result.
    /// `None` for `Pass` and `Fail`, and for every result produced today.
    pub reason_code: Option<&'static str>,
    pub detail: String,
}

impl CheckResult {
    /// A `Pass` result. The check bodies build every result through this and
    /// [`CheckResult::fail`], so adding a field never means touching each one.
    pub fn pass(name: String, detail: String) -> Self {
        CheckResult { name, status: CheckStatus::Pass, reason_code: None, detail }
    }

    /// A `Fail` result.
    pub fn fail(name: String, detail: String) -> Self {
        CheckResult { name, status: CheckStatus::Fail, reason_code: None, detail }
    }
}

impl CheckResult {
    /// An `Inconclusive` result: the check could not reach a verdict about the
    /// vault. `reason_code` says why, in a form a program can read.
    #[allow(dead_code)]
    pub fn inconclusive(name: String, reason_code: &'static str, detail: String) -> Self {
        CheckResult { name, status: CheckStatus::Inconclusive, reason_code: Some(reason_code), detail }
    }

    /// A `NotApplicable` result: the check does not fit this vault's design.
    #[allow(dead_code)]
    pub fn not_applicable(name: String, reason_code: &'static str, detail: String) -> Self {
        CheckResult { name, status: CheckStatus::NotApplicable, reason_code: Some(reason_code), detail }
    }
}

/// Why a step of a check stopped it. `Fail` keeps the check's existing FAIL
/// text; the other two carry the new status, its reason code and its detail.
#[allow(dead_code)]
pub(crate) enum Stop {
    Fail(String),
    Inconclusive { reason: &'static str, detail: String },
    NotApplicable { reason: &'static str, detail: String },
}

impl std::fmt::Display for Stop {
    /// The message of a `Fail`, or the detail of the other two.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Stop::Fail(text) => f.write_str(text),
            Stop::Inconclusive { detail, .. } | Stop::NotApplicable { detail, .. } => f.write_str(detail),
        }
    }
}

impl Stop {
    /// Turns this into the check's result. `wrap` builds the existing FAIL text
    /// around the message of a `Fail`, and is not used for the other two.
    #[allow(dead_code)]
    pub(crate) fn finish(self, name: String, wrap: impl FnOnce(&str) -> String) -> CheckResult {
        match self {
            Stop::Fail(message) => CheckResult::fail(name, wrap(&message)),
            Stop::Inconclusive { reason, detail } => CheckResult::inconclusive(name, reason, detail),
            Stop::NotApplicable { reason, detail } => CheckResult::not_applicable(name, reason, detail),
        }
    }

    /// Rewrites the message of a `Fail`; the other two pass through unchanged.
    #[allow(dead_code)]
    fn wrap_fail(self, wrap: impl FnOnce(&str) -> String) -> Stop {
        match self {
            Stop::Fail(message) => Stop::Fail(wrap(&message)),
            other => other,
        }
    }
}

/// What a failed command was doing, for [`verdict`].
#[allow(dead_code)]
enum Subject<'a> {
    /// A `stellar contract invoke` of `function`, started as test account
    /// `account`. `na_if_missing` is true only for a function that is not part
    /// of SEP-56 and that the tool calls anyway (`query_asset` on the vault,
    /// `decimals` on the underlying asset); a missing SEP-56 function stays a
    /// FAIL, as before.
    Call { function: &'a str, account: &'a str, na_if_missing: bool },
    /// Deploying the comparison copy of the vault.
    Deploy,
    /// Reading the target's Wasm hash.
    WasmHash,
}

/// Longest stretch of raw error text copied into a detail.
#[allow(dead_code)]
const RAW_ERROR_LIMIT: usize = 1500;

#[allow(dead_code)]
fn truncate_raw(raw: &str) -> String {
    match raw.char_indices().nth(RAW_ERROR_LIMIT) {
        Some((end, _)) => format!("{} [truncated]", &raw[..end]),
        None => raw.to_string(),
    }
}

/// Maps a diagnosis to a status, or `None` to leave the result a FAIL.
#[allow(dead_code)]
fn verdict(subject: &Subject<'_>, diag: &Diagnosis) -> Option<Stop> {
    let phrase = match subject {
        Subject::Call { function, .. } => format!("the call to {function}()"),
        Subject::Deploy => "the deploy of the comparison copy".to_string(),
        Subject::WasmHash => "the lookup of the target's Wasm hash".to_string(),
    };

    let (reason, lead, not_applicable) = match (diag.class, subject) {
        (ErrorClass::InsufficientTokenBalance, Subject::Call { account, .. }) => (
            "insufficient_token_balance",
            format!(
                "the token transfer needed for this check was rejected, which appears to be \
                 insufficient balance on the account paying for it (this check started the \
                 call as test account '{account}'). Fund that account with the vault's \
                 underlying asset and run again. This is a precondition problem, not a \
                 finding about the vault."
            ),
            false,
        ),
        (ErrorClass::ConstructorMismatch, Subject::Deploy) => (
            "constructor_mismatch",
            "this check deploys a comparison copy of the vault with the constructor arguments \
             --name, --symbol, --asset, --decimals_offset; the target vault's constructor does \
             not accept them, so the copy could not be deployed. No finding about the vault."
                .to_string(),
            true,
        ),
        (ErrorClass::NotAStandardVault, Subject::Call { function, na_if_missing: true, .. }) => (
            "not_a_standard_vault",
            format!(
                "the target does not expose the interface this check needs ({function}). No \
                 finding about the vault."
            ),
            true,
        ),
        (ErrorClass::NotAStandardVault, Subject::Call { .. }) => return None,
        (ErrorClass::NotAStandardVault, Subject::WasmHash) => (
            "not_a_standard_vault",
            "the target does not expose the interface this check needs (a contract with Wasm \
             code of its own, which a comparison copy is deployed from). No finding about the \
             vault."
                .to_string(),
            true,
        ),
        (ErrorClass::Network, _) => (
            "network_error",
            format!("{phrase} did not reach the RPC or network. Run again later."),
            false,
        ),
        _ => (
            "unclassified_error",
            format!(
                "{phrase} failed for a reason the tool could not classify. No finding about the \
                 vault."
            ),
            false,
        ),
    };

    let tail = match (&diag.raw, diag.retry) {
        (Some(raw), _) => format!(" Raw error: {}", truncate_raw(raw)),
        (None, RetryNote::RetriedSucceeded) => " The call succeeded when repeated as a simulation, \
            so the first failure could not be reproduced and its cause is unknown."
            .to_string(),
        (None, RetryNote::RetriedNoText) => " The CLI printed no error text, also when the call \
            was repeated without --quiet."
            .to_string(),
        (None, _) => " No error text was available.".to_string(),
    };
    let detail = format!("{lead}{tail}");

    Some(if not_applicable {
        Stop::NotApplicable { reason, detail }
    } else {
        Stop::Inconclusive { reason, detail }
    })
}

/// Calls a contract function like [`invoke_contract`]. A failure is diagnosed
/// (see [`diagnose_invoke`]) and becomes a [`Stop`]; the success path is
/// exactly `invoke_contract`, with no extra call.
#[allow(dead_code)]
pub(crate) async fn invoke_checked(
    contract_id: &str,
    function_name: &str,
    args: &[String],
    account: &str,
    na_if_missing: bool,
) -> Result<Value, Stop> {
    match invoke_contract(contract_id, function_name, args, account).await {
        Ok(value) => Ok(value),
        Err(e) => {
            let diag = diagnose_invoke(contract_id, function_name, args, account, &e).await;
            let subject = Subject::Call { function: function_name, account, na_if_missing };
            Err(verdict(&subject, &diag).unwrap_or_else(|| Stop::Fail(e.to_string())))
        }
    }
}

/// Deploys like [`deploy_contract`]. A failure is classified from the text it
/// already has and is never repeated; it never stays a FAIL.
#[allow(dead_code)]
pub(crate) async fn deploy_checked(
    wasm_hash: &str,
    account: &str,
    constructor_args: &[String],
) -> Result<String, Stop> {
    match deploy_contract(wasm_hash, account, constructor_args).await {
        Ok(id) => Ok(id),
        Err(e) => {
            let diag = diagnose_deploy(&e).await;
            Err(verdict(&Subject::Deploy, &diag)
                .unwrap_or_else(|| Stop::Fail(e.to_string())))
        }
    }
}

/// Fetches the target's Wasm hash like [`fetch_wasm_hash`], diagnosing a failure.
#[allow(dead_code)]
async fn wasm_hash_checked(target_vault: &str) -> Result<String, Stop> {
    match fetch_wasm_hash(target_vault).await {
        Ok(hash) => Ok(hash),
        Err(e) => {
            let diag = diagnose_info_hash(target_vault, &e).await;
            Err(verdict(&Subject::WasmHash, &diag)
                .unwrap_or_else(|| Stop::Fail(e.to_string())))
        }
    }
}

/// Reads the current ledger sequence like [`fetch_current_ledger_sequence`].
/// That function only talks to Horizon, so a failed request is a network
/// problem; a reply that could not be read is not classified.
#[allow(dead_code)]
async fn ledger_checked() -> Result<u32, Stop> {
    match fetch_current_ledger_sequence().await {
        Ok(sequence) => Ok(sequence),
        Err(message) => {
            let (reason, lead) = if message.starts_with("Horizon request failed") {
                (
                    "network_error",
                    "the request for the current ledger sequence did not reach Horizon. Run \
                     again later.",
                )
            } else {
                (
                    "unclassified_error",
                    "the reply with the current ledger sequence could not be read, for a \
                     reason the tool could not classify. No finding about the vault.",
                )
            };
            Err(Stop::Inconclusive {
                reason,
                detail: format!("{lead} Raw error: {}", truncate_raw(&message)),
            })
        }
    }
}

/// Checks that `total_assets()` can be called on the vault and returns a
/// valid non-negative amount.
///
/// This does not yet compare against a specific expected value — it only
/// validates that the call succeeds and the returned data is sane.
pub async fn check_total_assets(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "total_assets".to_string();

    match read_total_assets(contract_id, source_account).await {
        Ok(amount) => CheckResult::pass(name, format!("total_assets = {amount}")),
        Err(stop) => stop.finish(name, |m| m.to_string()),
    }
}

/// Deposits a fixed amount into the vault (receiver = from = operator =
/// `source_account`) and checks that:
/// 1. The shares minted (the call's return value) match `preview_deposit()`
///    computed for the same amount just before executing — this correctly
///    accounts for vaults that are not at a clean 1:1 share:asset ratio
///    (which most real-world vaults, having accrued yield or donations,
///    will not be).
/// 2. `total_assets()` after the deposit equals `total_assets()` before
///    the deposit plus the deposited amount.
pub async fn check_deposit(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "deposit".to_string();
    const DEPOSIT_AMOUNT: i128 = 5_000_000; // 0.5 XLM in stroops

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets before deposit: {detail}"))
        }
    };

    let expected_shares = match call_preview(
        contract_id,
        source_account,
        "preview_deposit",
        "assets",
        DEPOSIT_AMOUNT,
    )
    .await
    {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not compute preview_deposit: {detail}"))
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

    let shares_minted = match invoke_checked(contract_id, "deposit", &args, source_account, false).await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!("deposit returned a non-numeric or negative value: {value}"))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("deposit invoke failed: {e}"))
        }
    };

    if shares_minted != expected_shares {
        return CheckResult::fail(name, format!(
                "shares minted ({shares_minted}) does not match preview_deposit({DEPOSIT_AMOUNT}) \
                 = {expected_shares}"
            ));
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets after deposit: {detail}"))
        }
    };

    let expected_after = before + DEPOSIT_AMOUNT;
    if after != expected_after {
        return CheckResult::fail(name, format!(
                "total_assets after deposit ({after}) != before ({before}) + deposited \
                 ({DEPOSIT_AMOUNT}) = {expected_after}"
            ));
    }

    CheckResult::pass(name, format!(
            "deposited {DEPOSIT_AMOUNT} stroops, minted {shares_minted} shares matching \
             preview_deposit(), total_assets {before} -> {after}"
        ))
}

/// Mints a fixed amount of vault shares (receiver = from = operator =
/// `source_account`) and checks that:
/// 1. The assets pulled (the call's return value) match `preview_mint()`
///    computed for the same amount just before executing — this correctly
///    accounts for vaults that are not at a clean 1:1 share:asset ratio.
/// 2. `total_assets()` after the mint equals `total_assets()` before the
///    mint plus the assets pulled in.
pub async fn check_mint(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "mint".to_string();
    const MINT_SHARES: i128 = 3_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets before mint: {detail}"))
        }
    };

    let expected_assets = match call_preview(
        contract_id,
        source_account,
        "preview_mint",
        "shares",
        MINT_SHARES,
    )
    .await
    {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not compute preview_mint: {detail}"))
        }
    };

    let args = vec![
        "--shares".to_string(),
        MINT_SHARES.to_string(),
        "--receiver".to_string(),
        source_account.to_string(),
        "--from".to_string(),
        source_account.to_string(),
        "--operator".to_string(),
        source_account.to_string(),
    ];

    let assets_pulled = match invoke_checked(contract_id, "mint", &args, source_account, false).await {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!("mint returned a non-numeric or negative value: {value}"))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("mint invoke failed: {e}"))
        }
    };

    if assets_pulled != expected_assets {
        return CheckResult::fail(name, format!(
                "assets pulled ({assets_pulled}) does not match preview_mint({MINT_SHARES}) = \
                 {expected_assets}"
            ));
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets after mint: {detail}"))
        }
    };

    let expected_after = before + assets_pulled;
    if after != expected_after {
        return CheckResult::fail(name, format!(
                "total_assets after mint ({after}) != before ({before}) + assets pulled \
                 ({assets_pulled}) = {expected_after}"
            ));
    }

    CheckResult::pass(name, format!(
            "minted {MINT_SHARES} shares, pulled {assets_pulled} assets matching \
             preview_mint(), total_assets {before} -> {after}"
        ))
}

/// Withdraws a fixed amount of underlying assets from the vault
/// (receiver = owner = operator = `source_account`) and checks that:
/// 1. The shares burned (the call's return value) match `preview_withdraw()`
///    computed for the same amount just before executing — this correctly
///    accounts for vaults that are not at a clean 1:1 share:asset ratio.
/// 2. `total_assets()` after the withdrawal equals `total_assets()`
///    before the withdrawal minus the withdrawn amount.
pub async fn check_withdraw(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "withdraw".to_string();
    const WITHDRAW_AMOUNT: i128 = 2_000_000; // 0.2 XLM in stroops

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets before withdraw: {detail}"))
        }
    };

    let expected_shares = match call_preview(
        contract_id,
        source_account,
        "preview_withdraw",
        "assets",
        WITHDRAW_AMOUNT,
    )
    .await
    {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not compute preview_withdraw: {detail}"))
        }
    };

    let args = vec![
        "--assets".to_string(),
        WITHDRAW_AMOUNT.to_string(),
        "--receiver".to_string(),
        source_account.to_string(),
        "--owner".to_string(),
        source_account.to_string(),
        "--operator".to_string(),
        source_account.to_string(),
    ];

    let shares_burned = match invoke_checked(contract_id, "withdraw", &args, source_account, false).await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!("withdraw returned a non-numeric or negative value: {value}"))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("withdraw invoke failed: {e}"))
        }
    };

    if shares_burned != expected_shares {
        return CheckResult::fail(name, format!(
                "shares burned ({shares_burned}) does not match preview_withdraw({WITHDRAW_AMOUNT}) \
                 = {expected_shares}"
            ));
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets after withdraw: {detail}"))
        }
    };

    let expected_after = before - WITHDRAW_AMOUNT;
    if after != expected_after {
        return CheckResult::fail(name, format!(
                "total_assets after withdraw ({after}) != before ({before}) - withdrawn \
                 ({WITHDRAW_AMOUNT}) = {expected_after}"
            ));
    }

    CheckResult::pass(name, format!(
            "withdrew {WITHDRAW_AMOUNT} stroops, burned {shares_burned} shares matching \
             preview_withdraw(), total_assets {before} -> {after}"
        ))
}

/// Redeems a fixed amount of vault shares (receiver = owner = operator =
/// `source_account`) and checks that:
/// 1. The assets received (the call's return value) match `preview_redeem()`
///    computed for the same amount just before executing — this correctly
///    accounts for vaults that are not at a clean 1:1 share:asset ratio.
/// 2. `total_assets()` after the redemption equals `total_assets()`
///    before the redemption minus the assets received.
pub async fn check_redeem(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "redeem".to_string();
    const REDEEM_SHARES: i128 = 1_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets before redeem: {detail}"))
        }
    };

    let expected_assets = match call_preview(
        contract_id,
        source_account,
        "preview_redeem",
        "shares",
        REDEEM_SHARES,
    )
    .await
    {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not compute preview_redeem: {detail}"))
        }
    };

    let args = vec![
        "--shares".to_string(),
        REDEEM_SHARES.to_string(),
        "--receiver".to_string(),
        source_account.to_string(),
        "--owner".to_string(),
        source_account.to_string(),
        "--operator".to_string(),
        source_account.to_string(),
    ];

    let assets_received = match invoke_checked(contract_id, "redeem", &args, source_account, false).await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!("redeem returned a non-numeric or negative value: {value}"))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("redeem invoke failed: {e}"))
        }
    };

    if assets_received != expected_assets {
        return CheckResult::fail(name, format!(
                "assets received ({assets_received}) does not match preview_redeem({REDEEM_SHARES}) \
                 = {expected_assets}"
            ));
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets after redeem: {detail}"))
        }
    };

    let expected_after = before - assets_received;
    if after != expected_after {
        return CheckResult::fail(name, format!(
                "total_assets after redeem ({after}) != before ({before}) - assets received \
                 ({assets_received}) = {expected_after}"
            ));
    }

    CheckResult::pass(name, format!(
            "redeemed {REDEEM_SHARES} shares, received {assets_received} assets matching \
             preview_redeem(), total_assets {before} -> {after}"
        ))
}

/// Calls `convert_to_shares(assets = 4_000_000)` (a read-only conversion,
/// no vault shares are actually minted) and checks that:
/// 1. Round-trip bound: `convert_to_assets(convert_to_shares(4_000_000))`
///    does not *exceed* `4_000_000`. This is compared via a round trip
///    rather than a hardcoded 1:1 expectation, since a vault's share:asset
///    ratio depends on its `decimals_offset` and accrued activity — a
///    hardcoded "shares == assets" assumption would only ever hold for a
///    fresh `decimals_offset = 0` vault.
///
///    The bound is `<=`, not `==`: SEP-56 requires both conversions to
///    round DOWN, and composing two floor divisions is only guaranteed to
///    ever lose precision, never gain it — `floor(floor(x·n/d)·d/n) <= x`
///    holds for any positive integers `x, n, d`. Exact equality only ever
///    holds by coincidence, at ratios that happen to divide evenly (e.g.
///    a fresh vault's 1:1 ratio, or an exact power-of-ten
///    `decimals_offset`); at any other ratio, two floor roundings can
///    legitimately lose a few units without indicating a bug. A result
///    that *exceeds* the original, however, would mean the vault created
///    value out of a round trip — that's the actual defect this check
///    exists to catch, and `<=` still catches it (as does a vault that
///    rounds UP instead of down, like `contracts/rounding-bug-vault`,
///    whose round-trip is provably `>= x` instead).
/// 2. `total_assets()` is unchanged before/after the calls, since pure
///    conversions must not have any side effects on vault state.
pub async fn check_convert_to_shares(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "convert_to_shares".to_string();
    const CONVERT_ASSETS: i128 = 4_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!(
                    "could not read total_assets before convert_to_shares: {detail}"
                ))
        }
    };

    let shares = match convert_to_shares(contract_id, source_account, CONVERT_ASSETS).await {
        Ok(amount) => amount,
        Err(detail) => return detail.finish(name, |m| m.to_string()),
    };

    let roundtrip_assets = match convert_to_assets(contract_id, source_account, shares).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("round-trip convert_to_assets call failed: {detail}"))
        }
    };

    if roundtrip_assets > CONVERT_ASSETS {
        return CheckResult::fail(name, format!(
                "round-trip violation: convert_to_assets(convert_to_shares({CONVERT_ASSETS})) \
                 = convert_to_assets({shares}) = {roundtrip_assets}, which EXCEEDS \
                 {CONVERT_ASSETS} — floor/floor round-tripping must never gain value"
            ));
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets after convert_to_shares: {detail}"))
        }
    };

    if after != before {
        return CheckResult::fail(name, format!(
                "convert_to_shares is not read-only: total_assets changed from {before} \
                 to {after}"
            ));
    }

    CheckResult::pass(name, format!(
            "convert_to_shares({CONVERT_ASSETS}) = {shares}, round-trip \
             convert_to_assets({shares}) = {roundtrip_assets} (<= {CONVERT_ASSETS}, \
             as required of floor/floor round-tripping), total_assets unchanged at {before}"
        ))
}

/// Calls `convert_to_assets(shares = 4_000_000)` (a read-only conversion)
/// and checks that:
/// 1. Round-trip bound: `convert_to_shares(convert_to_assets(4_000_000))`
///    does not *exceed* `4_000_000` — compared via round trip, not a
///    hardcoded 1:1 expectation, for the same reason as
///    [`check_convert_to_shares`] (ratio depends on `decimals_offset`); see
///    that function's doc comment for why the bound is `<=` rather than
///    exact equality.
/// 2. `total_assets()` is unchanged before/after the calls, since pure
///    conversions must not have any side effects on vault state.
pub async fn check_convert_to_assets(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "convert_to_assets".to_string();
    const CONVERT_SHARES: i128 = 4_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!(
                    "could not read total_assets before convert_to_assets: {detail}"
                ))
        }
    };

    let assets = match convert_to_assets(contract_id, source_account, CONVERT_SHARES).await {
        Ok(amount) => amount,
        Err(detail) => return detail.finish(name, |m| m.to_string()),
    };

    let roundtrip_shares = match convert_to_shares(contract_id, source_account, assets).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("round-trip convert_to_shares call failed: {detail}"))
        }
    };

    if roundtrip_shares > CONVERT_SHARES {
        return CheckResult::fail(name, format!(
                "round-trip violation: convert_to_shares(convert_to_assets({CONVERT_SHARES})) \
                 = convert_to_shares({assets}) = {roundtrip_shares}, which EXCEEDS \
                 {CONVERT_SHARES} — floor/floor round-tripping must never gain value"
            ));
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!("could not read total_assets after convert_to_assets: {detail}"))
        }
    };

    if after != before {
        return CheckResult::fail(name, format!(
                "convert_to_assets is not read-only: total_assets changed from {before} \
                 to {after}"
            ));
    }

    CheckResult::pass(name, format!(
            "convert_to_assets({CONVERT_SHARES}) = {assets}, round-trip \
             convert_to_shares({assets}) = {roundtrip_shares} (<= {CONVERT_SHARES}, \
             as required of floor/floor round-tripping), total_assets unchanged at {before}"
        ))
}

/// Calls `convert_to_shares(assets)` and parses the result as a
/// non-negative `i128`.
async fn convert_to_shares(
    contract_id: &str,
    source_account: &str,
    assets: i128,
) -> Result<i128, Stop> {
    let args = vec!["--assets".to_string(), assets.to_string()];
    match invoke_checked(contract_id, "convert_to_shares", &args, source_account, false).await {
        Ok(value) => parse_non_negative_i128(&value).ok_or_else(|| {
            Stop::Fail(format!("convert_to_shares returned a non-numeric or negative value: {value}"))
        }),
        Err(e) => Err(e.wrap_fail(|e| format!("convert_to_shares invoke failed: {e}"))),
    }
}

/// Calls `convert_to_assets(shares)` and parses the result as a
/// non-negative `i128`.
async fn convert_to_assets(
    contract_id: &str,
    source_account: &str,
    shares: i128,
) -> Result<i128, Stop> {
    let args = vec!["--shares".to_string(), shares.to_string()];
    match invoke_checked(contract_id, "convert_to_assets", &args, source_account, false).await {
        Ok(value) => parse_non_negative_i128(&value).ok_or_else(|| {
            Stop::Fail(format!("convert_to_assets returned a non-numeric or negative value: {value}"))
        }),
        Err(e) => Err(e.wrap_fail(|e| format!("convert_to_assets invoke failed: {e}"))),
    }
}

/// Simulates a donation/inflation attack against a **freshly deployed**
/// vault instance of the given `wasm_hash`, with `attacker_account` as the
/// attacker and `victim_account` as an unrelated victim depositor.
///
/// This check is self-contained: it deploys its own throwaway vault
/// instance rather than touching `target_vault` itself. The wasm hash,
/// underlying asset, and decimals_offset are all resolved from
/// `target_vault` first (via [`resolve_target_vault`]), so the throwaway
/// instance matches whatever vault is actually being checked — not a
/// hardcoded reference — and this check can be re-run against any SEP-56
/// vault regardless of its configured decimals_offset.
///
/// Scenario:
/// 1. Resolve `target_vault`'s wasm hash, underlying asset, and
///    decimals_offset, then deploy a fresh vault from that same
///    configuration.
/// 2. Attacker deposits a dust amount (1 stroop) to become the sole,
///    near-worthless first shareholder.
/// 3. Attacker donates a large amount directly to the vault's contract
///    address via the underlying asset's `transfer()`, bypassing
///    `deposit()` entirely — inflating `total_assets()` without minting
///    any shares.
/// 4. Victim deposits a normal amount and receives however many shares
///    the (now heavily donation-inflated) exchange rate yields.
/// 5. Attacker's shares are redeemed to record a P&L figure, purely as
///    supplementary context.
///
/// # Pass/fail criteria
///
/// The verdict is driven **solely** by whether the victim received a
/// reasonably proportional number of shares — at least `SHARE_TOLERANCE_PCT`%
/// of what an undisturbed, fresh vault at this exact decimals_offset would
/// have minted for the same deposit (`assets * 10^decimals_offset`, the
/// vault's own genesis-state formula), not a hardcoded 1:1 assumption that
/// would only hold at `decimals_offset = 0`. Attacker profit/loss is
/// recorded in the detail string for context only — it does not affect
/// PASS/FAIL, because the victim is harmed by a donation attack regardless
/// of whether the attacker personally profits.
///
/// If `target_vault`'s wasm hash or underlying asset cannot be resolved
/// (e.g. it's a Stellar Asset Contract or otherwise not a valid Soroban
/// vault), the check fails with a clear error rather than panicking.
pub async fn check_donation_attack(
    target_vault: &str,
    attacker_account: &str,
    victim_account: &str,
) -> CheckResult {
    let name = "donation_attack".to_string();
    const ATTACKER_DUST_DEPOSIT: i128 = 1;
    const DONATION_AMOUNT: i128 = 100_000_000;
    const VICTIM_DEPOSIT: i128 = 5_000_000;
    const SHARE_TOLERANCE_PCT: i128 = 90;

    let (wasm_hash, underlying_asset, decimals_offset) =
        match resolve_target_vault(target_vault, attacker_account).await {
            Ok(triple) => triple,
            Err(detail) => return detail.finish(name, |m| m.to_string()),
        };

    let constructor_args = vec![
        "--name".to_string(),
        "Donation Attack Check Vault".to_string(),
        "--symbol".to_string(),
        "DACHK".to_string(),
        "--asset".to_string(),
        underlying_asset.clone(),
        "--decimals_offset".to_string(),
        decimals_offset.to_string(),
    ];

    let vault_id = match deploy_checked(&wasm_hash, attacker_account, &constructor_args).await {
        Ok(id) => id,
        Err(e) => {
            return e.finish(name, |e| format!(
                    "could not deploy a fresh vault instance for the attack simulation: {e}"
                ))
        }
    };

    let attacker_deposit_args = vec![
        "--assets".to_string(),
        ATTACKER_DUST_DEPOSIT.to_string(),
        "--receiver".to_string(),
        attacker_account.to_string(),
        "--from".to_string(),
        attacker_account.to_string(),
        "--operator".to_string(),
        attacker_account.to_string(),
    ];
    let attacker_shares = match invoke_checked(
        &vault_id,
        "deposit",
        &attacker_deposit_args,
        attacker_account,
        false,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!(
                        "attacker dust deposit on {vault_id} returned an unexpected value: {value}"
                    ))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("attacker dust deposit failed on {vault_id}: {e}"))
        }
    };

    let donation_args = vec![
        "--from".to_string(),
        attacker_account.to_string(),
        "--to".to_string(),
        vault_id.clone(),
        "--amount".to_string(),
        DONATION_AMOUNT.to_string(),
    ];
    if let Err(e) =
        invoke_checked(&underlying_asset, "transfer", &donation_args, attacker_account, false).await
    {
        return e.finish(name, |e| format!("attacker donation transfer to {vault_id} failed: {e}"));
    }

    let victim_deposit_args = vec![
        "--assets".to_string(),
        VICTIM_DEPOSIT.to_string(),
        "--receiver".to_string(),
        victim_account.to_string(),
        "--from".to_string(),
        victim_account.to_string(),
        "--operator".to_string(),
        victim_account.to_string(),
    ];
    let victim_shares =
        match invoke_checked(&vault_id, "deposit", &victim_deposit_args, victim_account, false).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult::fail(name, format!(
                            "victim deposit on {vault_id} returned an unexpected value: {value}"
                        ))
                }
            },
            Err(e) => {
                return e.finish(name, |e| format!("victim deposit failed on {vault_id}: {e}"))
            }
        };

    // Attacker P&L is supplementary context only — failures here never
    // affect the pass/fail verdict, which is driven solely by the
    // victim's share of the expected proportional amount.
    let attacker_cost = ATTACKER_DUST_DEPOSIT + DONATION_AMOUNT;
    let attacker_pnl_detail = if attacker_shares > 0 {
        let redeem_args = vec![
            "--shares".to_string(),
            attacker_shares.to_string(),
            "--receiver".to_string(),
            attacker_account.to_string(),
            "--owner".to_string(),
            attacker_account.to_string(),
            "--operator".to_string(),
            attacker_account.to_string(),
        ];
        match invoke_contract(&vault_id, "redeem", &redeem_args, attacker_account).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(proceeds) => {
                    let net = proceeds - attacker_cost;
                    if net > 0 {
                        format!(
                            "attacker P&L: NET PROFIT of {net} stroops \
                             (spent {attacker_cost}, redeemed {proceeds})"
                        )
                    } else {
                        format!(
                            "attacker P&L: net loss of {} stroops \
                             (spent {attacker_cost}, redeemed {proceeds})",
                            -net
                        )
                    }
                }
                None => {
                    format!("attacker P&L: could not parse redeem result (spent {attacker_cost})")
                }
            },
            Err(e) => format!(
                "attacker P&L: could not redeem attacker shares to determine proceeds \
                 ({e}); spent {attacker_cost}"
            ),
        }
    } else {
        format!("attacker P&L: attacker holds 0 shares, nothing to redeem; spent {attacker_cost}")
    };

    // The "fair" baseline is whatever a completely undisturbed, fresh vault
    // of this exact decimals_offset would mint for a first deposit of
    // VICTIM_DEPOSIT: shares = assets * 10^offset / 1 (genesis formula,
    // totalSupply=0, totalAssets=0). Comparing against this instead of a
    // hardcoded 1:1 assumption keeps the check meaningful for any
    // decimals_offset, not just 0.
    let offset_scale = 10i128.checked_pow(decimals_offset).unwrap_or(i128::MAX);
    let expected_shares = VICTIM_DEPOSIT.checked_mul(offset_scale).unwrap_or(i128::MAX);
    let min_acceptable_shares = (expected_shares / 100).saturating_mul(SHARE_TOLERANCE_PCT);
    let victim_pct_of_expected = victim_shares.saturating_mul(100) / expected_shares.max(1);

    let verdict_detail = format!(
        "fresh vault {vault_id} (decimals_offset={decimals_offset}): attacker deposited \
         {ATTACKER_DUST_DEPOSIT} stroop(s) then donated {DONATION_AMOUNT} stroops directly \
         (bypassing deposit()); victim then deposited {VICTIM_DEPOSIT} stroops and received \
         {victim_shares} shares ({victim_pct_of_expected}% of the {expected_shares} expected \
         from an undisturbed deposit at this vault's decimals_offset); {attacker_pnl_detail}"
    );

    if victim_shares < min_acceptable_shares {
        CheckResult::fail(name, format!("VULNERABLE to donation/inflation attack — {verdict_detail}"))
    } else {
        CheckResult::pass(name, format!("resilient to donation/inflation attack — {verdict_detail}"))
    }
}

/// Simulates an extreme-input overflow scenario against a **freshly
/// deployed** vault instance (built from `target_vault`'s own resolved
/// wasm hash and underlying asset): calling `deposit()` with `assets =
/// i128::MAX`.
///
/// # What this check actually validates, and which layer actually fails
///
/// This check verifies that an extreme input fails **cleanly** — the call
/// returns an error and leaves no partial/corrupted vault state behind
/// (`total_assets()` stays `0`) — rather than silently succeeding with a
/// wrong result. *Which* layer rejects the call depends on
/// `decimals_offset`, and the detail string identifies the actual layer
/// rather than assuming one:
///
/// - **`decimals_offset >= 1`**: `preview_deposit()` computes
///   `assets * 10^decimals_offset` before any asset transfer is
///   attempted. For `assets = i128::MAX` this overflows `i128` regardless
///   of the underlying asset — `stellar-tokens`' `mul_div_with_rounding`
///   panics (`SorobanFixedPointError::Overflow`) rather than truncating.
///   This *does* exercise the vault's own checked-arithmetic overflow
///   protection.
/// - **`decimals_offset == 0`**: the share computation is `i128::MAX * 1`,
///   which fits in `i128` without overflowing, so the call proceeds to
///   actually attempt transferring `i128::MAX` of the underlying asset.
///   For a classic/native asset (a Stellar Asset Contract), that transfer
///   is rejected by the SAC's own `int64` amount ceiling — a limit
///   entirely outside the vault's control, so this case does **not**
///   confirm the vault's own overflow protection. For a genuine custom
///   Soroban token asset (confirmed by checking it has its own uploaded
///   Wasm, i.e. it isn't a SAC), the rejection is instead an ordinary
///   insufficient-balance error on the depositor's account — also not an
///   overflow demonstration.
///
/// An earlier version of this check's detail string unconditionally
/// claimed the SAC/native-XLM explanation regardless of `decimals_offset`
/// or the actual underlying asset — which is simply wrong for any vault
/// with `decimals_offset >= 1` (this was true even for the already-tested
/// Vault A, `decimals_offset = 6`) or one using a non-SAC custom asset.
/// This was caught by testing a vault combining both (`decimals_offset =
/// 3`, a custom Soroban token) as a deliberate blind generalization test.
pub async fn check_overflow_protection(target_vault: &str, deployer_account: &str) -> CheckResult {
    let name = "overflow_protection".to_string();

    let (wasm_hash, underlying_asset, decimals_offset) =
        match resolve_target_vault(target_vault, deployer_account).await {
            Ok(triple) => triple,
            Err(detail) => return detail.finish(name, |m| m.to_string()),
        };

    let constructor_args = vec![
        "--name".to_string(),
        "Overflow Test Vault".to_string(),
        "--symbol".to_string(),
        "OVFCHK".to_string(),
        "--asset".to_string(),
        underlying_asset.clone(),
        "--decimals_offset".to_string(),
        decimals_offset.to_string(),
    ];

    let vault_id = match deploy_checked(&wasm_hash, deployer_account, &constructor_args).await {
        Ok(id) => id,
        Err(e) => {
            return e.finish(name, |e| format!(
                    "could not deploy a fresh vault instance for the overflow test: {e}"
                ))
        }
    };

    let extreme_deposit_args = vec![
        "--assets".to_string(),
        i128::MAX.to_string(),
        "--receiver".to_string(),
        deployer_account.to_string(),
        "--from".to_string(),
        deployer_account.to_string(),
        "--operator".to_string(),
        deployer_account.to_string(),
    ];

    let deposit_result =
        invoke_contract(&vault_id, "deposit", &extreme_deposit_args, deployer_account).await;

    // Regardless of what happened above, confirm the vault's state is
    // still sane — a clean rejection must leave no partial/corrupted
    // state behind.
    let total_assets_after = match read_total_assets(&vault_id, deployer_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            let outcome = match &deposit_result {
                Ok(v) => format!("unexpectedly SUCCEEDED, returned {v}"),
                Err(e) => format!("failed as expected ({e})"),
            };
            return detail.finish(name, |detail| format!(
                    "deposit(assets=i128::MAX) {outcome}; additionally could not read \
                     total_assets afterwards to confirm clean state: {detail}"
                ));
        }
    };

    match deposit_result {
        Ok(shares) => CheckResult::fail(name, format!(
                "VULNERABLE: deposit(assets=i128::MAX) unexpectedly SUCCEEDED and minted \
                 {shares} shares on fresh vault {vault_id} (total_assets afterwards: \
                 {total_assets_after}) — an extreme input should be rejected cleanly, not \
                 accepted with a possibly-wrong result"
            )),
        Err(e) if total_assets_after != 0 => CheckResult::fail(name, format!(
                "VULNERABLE: deposit(assets=i128::MAX) failed as expected ({e}), but \
                 total_assets on {vault_id} is {total_assets_after} instead of 0 — the failed \
                 transaction left behind corrupted/partial state"
            )),
        Err(e) => {
            let layer_detail = if decimals_offset >= 1 {
                format!(
                    "this vault's decimals_offset={decimals_offset} means preview_deposit() \
                     computes assets * 10^{decimals_offset}, which overflows i128 for \
                     assets=i128::MAX regardless of the underlying asset — so this IS the \
                     vault's own checked-arithmetic overflow protection (stellar-tokens' \
                     mul_div_with_rounding, which panics rather than truncating), confirmed \
                     before any asset transfer was even attempted"
                )
            } else {
                // decimals_offset == 0: assets * 10^0 = assets, so i128::MAX fits without
                // overflowing the vault's own math, and the call proceeds to actually attempt
                // transferring i128::MAX of the underlying asset. Whether that transfer itself
                // hits a ceiling depends on whether the asset is a classic Stellar Asset
                // Contract (has no Wasm of its own) or a genuine custom Soroban token.
                match fetch_wasm_hash(&underlying_asset).await {
                    Err(_) => "at decimals_offset=0, the vault's own share math does not \
                        overflow for i128::MAX (shares = assets exactly), so this failure is \
                        instead triggered by the classic Stellar Asset Contract's own int64 \
                        amount ceiling (\"spent amount is too large for an i64\") on the \
                        underlying asset transfer — a limit outside the vault's control, NOT a \
                        demonstration of the vault's own overflow protection"
                        .to_string(),
                    Ok(_) => "at decimals_offset=0, the vault's own share math does not \
                        overflow for i128::MAX (shares = assets exactly), and the underlying \
                        asset is a genuine custom Soroban token (confirmed to have its own \
                        uploaded Wasm, i.e. not a Stellar Asset Contract) rather than one with \
                        an int64 ceiling — so this failure is most likely an ordinary \
                        insufficient-balance rejection on the depositor's account, NOT an \
                        overflow demonstration of any kind"
                        .to_string(),
                }
            };

            CheckResult::pass(name, format!(
                    "deposit(assets=i128::MAX) on fresh vault {vault_id} failed cleanly ({e}), \
                     and total_assets remained 0 — no silent-wrong-result observed. {layer_detail}."
                ))
        }
    }
}

/// Simulates the two rounding-direction scenarios from the exploratory
/// analysis against a **freshly deployed** vault instance, at a
/// deliberately fractional share:asset ratio (so there is an actual
/// remainder to observe the rounding direction of).
///
/// Scenario:
/// 1. Deploy a fresh vault (`decimals_offset = 0`, given `underlying_asset`).
/// 2. Seed deposit (1000) to establish an initial 1:1 supply.
/// 3. Direct donation (500), breaking the ratio to `total_assets:total_supply
///    = 1500:1000` (2:3), so subsequent conversions have a real remainder.
/// 4. **Test A** (`deposit()` must round shares DOWN/floor, favoring the
///    vault): compare `preview_deposit(100)` against the shares actually
///    minted by `deposit(100)` — they must match, and both must reflect
///    floor division.
/// 5. **Test B** (`mint()` must round the assets charged UP/ceil,
///    favoring the vault, in contrast to the always-floor idealized rate):
///    compare `preview_mint(100)` and the assets actually pulled by
///    `mint(shares=100)` — they must match each other, AND must be
///    strictly greater than `convert_to_assets(100)` (the idealized,
///    always-floor conversion), proving the rounding directions are
///    deliberately different rather than accidentally identical.
///
/// # Pass/fail criteria
///
/// PASS only if both Test A and Test B hold exactly; FAIL with a specific
/// detail identifying which comparison broke.
pub async fn check_rounding_direction(target_vault: &str, deployer_account: &str) -> CheckResult {
    let name = "rounding_direction".to_string();
    const SEED_DEPOSIT: i128 = 1000;
    const DONATION: i128 = 500;
    const DEPOSIT_TEST_ASSETS: i128 = 100;
    const MINT_TEST_SHARES: i128 = 100;

    let (wasm_hash, underlying_asset, decimals_offset) =
        match resolve_target_vault(target_vault, deployer_account).await {
            Ok(triple) => triple,
            Err(detail) => return detail.finish(name, |m| m.to_string()),
        };

    let constructor_args = vec![
        "--name".to_string(),
        "Rounding Test Vault".to_string(),
        "--symbol".to_string(),
        "RNDCHK".to_string(),
        "--asset".to_string(),
        underlying_asset.clone(),
        "--decimals_offset".to_string(),
        decimals_offset.to_string(),
    ];

    let vault_id = match deploy_checked(&wasm_hash, deployer_account, &constructor_args).await {
        Ok(id) => id,
        Err(e) => {
            return e.finish(name, |e| format!("could not deploy a fresh vault instance for the rounding test: {e}"))
        }
    };

    let seed_args = vec![
        "--assets".to_string(),
        SEED_DEPOSIT.to_string(),
        "--receiver".to_string(),
        deployer_account.to_string(),
        "--from".to_string(),
        deployer_account.to_string(),
        "--operator".to_string(),
        deployer_account.to_string(),
    ];
    if let Err(e) = invoke_checked(&vault_id, "deposit", &seed_args, deployer_account, false).await {
        return e.finish(name, |e| format!("seed deposit failed on {vault_id}: {e}"));
    }

    let donation_args = vec![
        "--from".to_string(),
        deployer_account.to_string(),
        "--to".to_string(),
        vault_id.clone(),
        "--amount".to_string(),
        DONATION.to_string(),
    ];
    if let Err(e) =
        invoke_checked(&underlying_asset, "transfer", &donation_args, deployer_account, false).await
    {
        return e.finish(name, |e| format!("donation transfer to {vault_id} failed: {e}"));
    }

    // --- Test A: deposit() must floor, matching preview_deposit() ---
    let preview_deposit_shares = match invoke_checked(
        &vault_id,
        "preview_deposit",
        &["--assets".to_string(), DEPOSIT_TEST_ASSETS.to_string()],
        deployer_account,
        false,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!(
                        "preview_deposit on {vault_id} returned an unexpected value: {value}"
                    ))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("preview_deposit failed on {vault_id}: {e}"))
        }
    };

    let deposit_args = vec![
        "--assets".to_string(),
        DEPOSIT_TEST_ASSETS.to_string(),
        "--receiver".to_string(),
        deployer_account.to_string(),
        "--from".to_string(),
        deployer_account.to_string(),
        "--operator".to_string(),
        deployer_account.to_string(),
    ];
    let actual_deposit_shares =
        match invoke_checked(&vault_id, "deposit", &deposit_args, deployer_account, false).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult::fail(name, format!(
                            "deposit on {vault_id} returned an unexpected value: {value}"
                        ))
                }
            },
            Err(e) => {
                return e.finish(name, |e| format!("deposit failed on {vault_id}: {e}"))
            }
        };

    if actual_deposit_shares != preview_deposit_shares {
        return CheckResult::fail(name, format!(
                "Test A failed: actual deposit() shares ({actual_deposit_shares}) does not \
                 match preview_deposit() ({preview_deposit_shares}) on {vault_id}"
            ));
    }

    // --- Test B: mint() must ceil, matching preview_mint() and strictly
    //     exceeding the always-floor convert_to_assets() ---
    let preview_mint_assets = match invoke_checked(
        &vault_id,
        "preview_mint",
        &["--shares".to_string(), MINT_TEST_SHARES.to_string()],
        deployer_account,
        false,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!(
                        "preview_mint on {vault_id} returned an unexpected value: {value}"
                    ))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("preview_mint failed on {vault_id}: {e}"))
        }
    };

    let idealized_assets = match invoke_checked(
        &vault_id,
        "convert_to_assets",
        &["--shares".to_string(), MINT_TEST_SHARES.to_string()],
        deployer_account,
        false,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult::fail(name, format!(
                        "convert_to_assets on {vault_id} returned an unexpected value: {value}"
                    ))
            }
        },
        Err(e) => {
            return e.finish(name, |e| format!("convert_to_assets failed on {vault_id}: {e}"))
        }
    };

    let mint_args = vec![
        "--shares".to_string(),
        MINT_TEST_SHARES.to_string(),
        "--receiver".to_string(),
        deployer_account.to_string(),
        "--from".to_string(),
        deployer_account.to_string(),
        "--operator".to_string(),
        deployer_account.to_string(),
    ];
    let actual_mint_assets =
        match invoke_checked(&vault_id, "mint", &mint_args, deployer_account, false).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult::fail(name, format!("mint on {vault_id} returned an unexpected value: {value}"))
                }
            },
            Err(e) => {
                return e.finish(name, |e| format!("mint failed on {vault_id}: {e}"))
            }
        };

    if actual_mint_assets != preview_mint_assets {
        return CheckResult::fail(name, format!(
                "Test B failed: actual mint() assets pulled ({actual_mint_assets}) does not \
                 match preview_mint() ({preview_mint_assets}) on {vault_id}"
            ));
    }

    if actual_mint_assets <= idealized_assets {
        return CheckResult::fail(name, format!(
                "Test B failed: mint() assets pulled ({actual_mint_assets}) is not strictly \
                 greater than the idealized convert_to_assets() ({idealized_assets}) on \
                 {vault_id} at a fractional ratio — mint() should round UP (ceil), charging the \
                 user strictly more, distinct from the always-floor idealized rate"
            ));
    }

    CheckResult::pass(name, format!(
            "fresh vault {vault_id} at fractional ratio (seed {SEED_DEPOSIT} + donation \
             {DONATION}): Test A — deposit({DEPOSIT_TEST_ASSETS}) minted \
             {actual_deposit_shares} shares matching preview_deposit() (floor, favors vault); \
             Test B — mint({MINT_TEST_SHARES} shares) pulled {actual_mint_assets} assets \
             matching preview_mint() (ceil) and strictly greater than the idealized \
             convert_to_assets() ({idealized_assets}) — rounding direction confirmed to always \
             favor the vault over the user"
        ))
}

/// Probes the vault's access-control (allowance) enforcement on
/// operator-initiated `withdraw()` calls against a **freshly deployed**
/// vault instance (built from `target_vault`'s own resolved wasm hash,
/// underlying asset, and decimals_offset), replicating the exploratory
/// experiment:
///
/// 1. Deploy a fresh vault and have `owner_account` seed-deposit shares.
/// 2. `operator_account` attempts `withdraw()` on the owner's behalf
///    **without any prior `approve()`** — must fail (insufficient
///    allowance).
/// 3. Owner `approve()`s the operator for a limited share allowance,
///    sized from `preview_withdraw()` rather than a hardcoded share
///    count, so it stays sensible at any decimals_offset.
/// 4. Operator withdraws WITHIN that allowance — must succeed, and the
///    allowance must decrease by exactly the shares spent (not reset to
///    `0`, not left unchanged).
/// 5. Operator attempts to withdraw MORE than the remaining allowance —
///    must fail, and the allowance must remain untouched (a failed
///    transaction must not partially spend allowance).
///
/// # Pass/fail criteria
///
/// PASS only if all steps behave exactly as above; FAIL with a specific
/// detail identifying which step diverged. An unauthorized withdrawal
/// succeeding (step 2 or step 5) is the most severe possible finding.
pub async fn check_access_control_probing(
    target_vault: &str,
    owner_account: &str,
    operator_account: &str,
) -> CheckResult {
    let name = "access_control_probing".to_string();
    const SEED_DEPOSIT: i128 = 10_000_000;
    const UNAUTHORIZED_WITHDRAW: i128 = 500_000;
    const WITHDRAW_WITHIN_ALLOWANCE: i128 = 500_000;
    // Multiplier (not a fixed share count) for the second withdraw attempt,
    // so its required shares clearly exceed the remaining allowance
    // regardless of the vault's decimals_offset / share:asset scale.
    const EXCEEDING_ASSET_MULTIPLIER: i128 = 3;
    const LIVE_UNTIL_LEDGER_HORIZON: u32 = 500_000;

    let (wasm_hash, underlying_asset, decimals_offset) =
        match resolve_target_vault(target_vault, owner_account).await {
            Ok(triple) => triple,
            Err(detail) => return detail.finish(name, |m| m.to_string()),
        };

    let constructor_args = vec![
        "--name".to_string(),
        "Access Control Test Vault".to_string(),
        "--symbol".to_string(),
        "ACLCHK".to_string(),
        "--asset".to_string(),
        underlying_asset,
        "--decimals_offset".to_string(),
        decimals_offset.to_string(),
    ];

    let vault_id = match deploy_checked(&wasm_hash, owner_account, &constructor_args).await {
        Ok(id) => id,
        Err(e) => {
            return e.finish(name, |e| format!(
                    "could not deploy a fresh vault instance for the access-control probe: {e}"
                ))
        }
    };

    let seed_args = vec![
        "--assets".to_string(),
        SEED_DEPOSIT.to_string(),
        "--receiver".to_string(),
        owner_account.to_string(),
        "--from".to_string(),
        owner_account.to_string(),
        "--operator".to_string(),
        owner_account.to_string(),
    ];
    if let Err(e) = invoke_checked(&vault_id, "deposit", &seed_args, owner_account, false).await {
        return e.finish(name, |e| format!("owner seed deposit failed on {vault_id}: {e}"));
    }

    // --- Step 1: unauthorized withdraw (0 allowance) must fail ---
    let unauthorized_args = vec![
        "--assets".to_string(),
        UNAUTHORIZED_WITHDRAW.to_string(),
        "--receiver".to_string(),
        operator_account.to_string(),
        "--owner".to_string(),
        owner_account.to_string(),
        "--operator".to_string(),
        operator_account.to_string(),
    ];
    if let Ok(shares) =
        invoke_contract(&vault_id, "withdraw", &unauthorized_args, operator_account).await
    {
        return CheckResult::fail(name, format!(
                "VULNERABLE: operator withdrew {shares} shares from owner on {vault_id} \
                 WITHOUT any prior approve() — access control was not enforced"
            ));
    }

    // Determine how many shares WITHDRAW_WITHIN_ALLOWANCE actually requires
    // at this vault's current ratio/decimals_offset, so the approved
    // allowance is set in proportion rather than a hardcoded share count
    // that would only make sense at decimals_offset=0.
    let shares_needed_for_within = match call_preview(
        &vault_id,
        owner_account,
        "preview_withdraw",
        "assets",
        WITHDRAW_WITHIN_ALLOWANCE,
    )
    .await
    {
        Ok(amount) => amount,
        Err(detail) => {
            return detail.finish(name, |detail| format!(
                    "could not compute preview_withdraw on {vault_id} to size the allowance: \
                     {detail}"
                ))
        }
    };
    let approved_allowance = shares_needed_for_within.saturating_mul(2);

    // --- Step 2: owner approves operator for a limited allowance ---
    let current_ledger = match ledger_checked().await {
        Ok(seq) => seq,
        Err(e) => {
            return e.finish(name, |e| format!(
                    "could not fetch current ledger sequence to compute a valid \
                     live_until_ledger for approve() on {vault_id}: {e}"
                ))
        }
    };
    let live_until_ledger = current_ledger + LIVE_UNTIL_LEDGER_HORIZON;

    let approve_args = vec![
        "--owner".to_string(),
        owner_account.to_string(),
        "--spender".to_string(),
        operator_account.to_string(),
        "--amount".to_string(),
        approved_allowance.to_string(),
        "--live_until_ledger".to_string(),
        live_until_ledger.to_string(),
    ];
    if let Err(e) = invoke_checked(&vault_id, "approve", &approve_args, owner_account, false).await {
        return e.finish(name, |e| format!("owner approve() failed on {vault_id}: {e}"));
    }

    // --- Step 3: withdraw within the allowance must succeed, decrementing
    //     the allowance by exactly the shares spent ---
    let within_args = vec![
        "--assets".to_string(),
        WITHDRAW_WITHIN_ALLOWANCE.to_string(),
        "--receiver".to_string(),
        operator_account.to_string(),
        "--owner".to_string(),
        owner_account.to_string(),
        "--operator".to_string(),
        operator_account.to_string(),
    ];
    let shares_spent =
        match invoke_checked(&vault_id, "withdraw", &within_args, operator_account, false).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult::fail(name, format!(
                            "authorized withdraw on {vault_id} returned an unexpected value: \
                             {value}"
                        ))
                }
            },
            Err(e) => {
                return e.finish(name, |e| format!(
                        "authorized withdraw within allowance unexpectedly failed on \
                         {vault_id}: {e}"
                    ))
            }
        };

    let allowance_args = vec![
        "--owner".to_string(),
        owner_account.to_string(),
        "--spender".to_string(),
        operator_account.to_string(),
    ];
    let allowance_after_spend =
        match invoke_checked(&vault_id, "allowance", &allowance_args, owner_account, false).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult::fail(name, format!(
                            "allowance query on {vault_id} returned an unexpected value: {value}"
                        ))
                }
            },
            Err(e) => {
                return e.finish(name, |e| format!("allowance query failed on {vault_id}: {e}"))
            }
        };

    let expected_remaining = approved_allowance - shares_spent;
    if allowance_after_spend != expected_remaining {
        return CheckResult::fail(name, format!(
                "VULNERABLE: after operator spent {shares_spent} shares of a \
                 {approved_allowance}-share allowance on {vault_id}, remaining allowance is \
                 {allowance_after_spend}, expected {expected_remaining} — allowance was not \
                 decremented correctly (reset to 0, left unchanged, or otherwise wrong)"
            ));
    }

    // --- Step 4: withdraw exceeding the remaining allowance must fail,
    //     leaving the allowance untouched ---
    let withdraw_exceeding_assets = WITHDRAW_WITHIN_ALLOWANCE.saturating_mul(EXCEEDING_ASSET_MULTIPLIER);
    let exceeding_args = vec![
        "--assets".to_string(),
        withdraw_exceeding_assets.to_string(),
        "--receiver".to_string(),
        operator_account.to_string(),
        "--owner".to_string(),
        owner_account.to_string(),
        "--operator".to_string(),
        operator_account.to_string(),
    ];
    if let Ok(shares) =
        invoke_contract(&vault_id, "withdraw", &exceeding_args, operator_account).await
    {
        return CheckResult::fail(name, format!(
                "VULNERABLE: operator withdrew {shares} shares on {vault_id} exceeding the \
                 remaining allowance of {allowance_after_spend} — allowance limit was not \
                 enforced"
            ));
    }

    let allowance_final =
        match invoke_checked(&vault_id, "allowance", &allowance_args, owner_account, false).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult::fail(name, format!(
                            "final allowance query on {vault_id} returned an unexpected value: \
                             {value}"
                        ))
                }
            },
            Err(e) => {
                return e.finish(name, |e| format!("final allowance query failed on {vault_id}: {e}"))
            }
        };

    if allowance_final != allowance_after_spend {
        return CheckResult::fail(name, format!(
                "VULNERABLE: allowance on {vault_id} changed from {allowance_after_spend} to \
                 {allowance_final} after a REJECTED over-allowance withdraw attempt — a failed \
                 transaction must not partially spend allowance"
            ));
    }

    CheckResult::pass(name, format!(
            "fresh vault {vault_id} (decimals_offset={decimals_offset}): unauthorized withdraw \
             (no approval) correctly rejected; after owner approved operator for \
             {approved_allowance} shares, operator withdrew {shares_spent} shares (allowance \
             {approved_allowance} -> {allowance_after_spend}, decremented exactly); operator's \
             over-allowance withdraw attempt of {withdraw_exceeding_assets} assets (requiring \
             more shares than the remaining {allowance_after_spend}-share allowance) correctly \
             rejected with allowance left untouched at {allowance_final}"
        ))
}

/// Calls `total_assets()` and parses it as a non-negative `i128`. A failed
/// call becomes a [`Stop`] (see [`invoke_checked`]); a reply that is not a
/// non-negative number is a `Stop::Fail`.
async fn read_total_assets(contract_id: &str, source_account: &str) -> Result<i128, Stop> {
    match invoke_checked(contract_id, "total_assets", &[], source_account, false).await {
        Ok(value) => parse_non_negative_i128(&value).ok_or_else(|| {
            Stop::Fail(format!("total_assets returned a non-numeric or negative value: {value}"))
        }),
        Err(e) => Err(e.wrap_fail(|e| format!("invoke_contract failed: {e}"))),
    }
}

/// Resolves the wasm hash, underlying asset, and actual `decimals_offset`
/// of `target_vault`, so the self-contained adversarial checks can deploy
/// their own throwaway instances that match the *exact* configuration of
/// whatever vault is actually being checked, instead of a hardcoded
/// reference (`decimals_offset = 0`).
///
/// The vault contract doesn't expose its decimals offset directly, so it's
/// derived as `vault.decimals() - underlying_asset.decimals()` — this
/// holds because the vault's `decimals()` is defined as the underlying
/// asset's decimals plus the offset.
///
/// Returns a [`Stop`] on failure, so callers end the check cleanly rather than
/// panicking. Which status it carries depends on why: a missing `query_asset`
/// or asset `decimals()`, an offset that cannot be derived, or a target with
/// no Wasm of its own is `NotApplicable`; an unreachable network or an
/// unclassified failure is `Inconclusive`; the other failures stay `Fail`.
async fn resolve_target_vault(
    target_vault: &str,
    caller_account: &str,
) -> Result<(String, String, u32), Stop> {
    let wasm_hash = wasm_hash_checked(target_vault).await?;

    // `query_asset` is not part of SEP-56; a vault without it is a design this
    // check does not cover, not a vault that failed.
    let underlying_asset =
        match invoke_checked(target_vault, "query_asset", &[], caller_account, true).await {
            Ok(value) => match value.as_str() {
                Some(s) => s.to_string(),
                None => {
                    return Err(Stop::Fail(format!(
                        "query_asset on {target_vault} returned an unexpected value: {value}"
                    )))
                }
            },
            Err(e) => {
                return Err(e.wrap_fail(|e| {
                    format!("could not query underlying asset from target vault {target_vault}: {e}")
                }))
            }
        };

    let vault_decimals =
        match invoke_checked(target_vault, "decimals", &[], caller_account, false).await {
            Ok(value) => parse_u32(&value).ok_or_else(|| {
                Stop::Fail(format!(
                    "decimals() on {target_vault} returned an unexpected value: {value}"
                ))
            })?,
            Err(e) => {
                return Err(e.wrap_fail(|e| {
                    format!("could not query decimals() from target vault {target_vault}: {e}")
                }))
            }
        };

    // `decimals` on the underlying asset is a token function the tool calls, not
    // part of SEP-56; an asset without it is treated like a missing `query_asset`.
    let asset_decimals =
        match invoke_checked(&underlying_asset, "decimals", &[], caller_account, true).await {
            Ok(value) => parse_u32(&value).ok_or_else(|| {
                Stop::Fail(format!(
                    "decimals() on underlying asset {underlying_asset} returned an unexpected \
                     value: {value}"
                ))
            })?,
            Err(e) => {
                return Err(e.wrap_fail(|e| {
                    format!(
                        "could not query decimals() from underlying asset {underlying_asset}: {e}"
                    )
                }))
            }
        };

    let decimals_offset = vault_decimals.checked_sub(asset_decimals).ok_or_else(|| {
        Stop::NotApplicable {
            reason: "not_a_standard_vault",
            detail: format!(
                "the target vault's decimals() ({vault_decimals}) is smaller than its underlying \
                 asset's decimals() ({asset_decimals}), so the decimals offset this check needs \
                 cannot be derived. No finding about the vault."
            ),
        }
    })?;

    Ok((wasm_hash, underlying_asset, decimals_offset))
}

/// Calls a single-argument preview function (`preview_deposit`,
/// `preview_mint`, `preview_withdraw`, or `preview_redeem`) and parses the
/// result as a non-negative `i128`. `arg_name` is the CLI flag name for
/// that function's sole argument (`"assets"` or `"shares"`).
async fn call_preview(
    contract_id: &str,
    source_account: &str,
    function_name: &str,
    arg_name: &str,
    amount: i128,
) -> Result<i128, Stop> {
    let args = vec![format!("--{arg_name}"), amount.to_string()];
    match invoke_checked(contract_id, function_name, &args, source_account, false).await {
        Ok(value) => parse_non_negative_i128(&value).ok_or_else(|| {
            Stop::Fail(format!("{function_name} returned a non-numeric or negative value: {value}"))
        }),
        Err(e) => Err(e.wrap_fail(|e| format!("{function_name} invoke failed: {e}"))),
    }
}

/// The stellar CLI encodes i128 results as JSON strings (e.g. `"100000000"`)
/// to avoid precision loss, but also accept a plain JSON number as a
/// fallback in case that encoding ever changes for values that fit.
fn parse_non_negative_i128(value: &Value) -> Option<i128> {
    let amount = match value {
        Value::String(s) => s.parse::<i128>().ok()?,
        Value::Number(n) => i128::from(n.as_i64()?),
        _ => return None,
    };

    (amount >= 0).then_some(amount)
}

/// Parses a `u32` (e.g. `decimals()`'s return value) from a JSON value,
/// which the stellar CLI encodes as a plain JSON number for types small
/// enough not to risk precision loss.
fn parse_u32(value: &Value) -> Option<u32> {
    match value {
        Value::Number(n) => u32::try_from(n.as_u64()?).ok(),
        Value::String(s) => s.parse::<u32>().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Raw text from the real `stellar` 28.0.0 on testnet (see `rpc.rs`).
    const BALANCE_TEXT: &str = r####"❌ error: transaction simulation failed: HostError: Error(Contract, #100)

Event log (newest first):
   0: [Diagnostic Event] contract:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, topics:[error, Error(Contract, #100)], data:"escalating error to VM trap from failed host function call: call"
   1: [Diagnostic Event] contract:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, topics:[error, Error(Contract, #100)], data:["contract call failed", transfer, [GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L, CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, 1000]]
   2: [Failed Diagnostic Event (not emitted)] contract:CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, topics:[log], data:["VM call trapped with HostError", transfer, Error(Contract, #100)]
   3: [Failed Diagnostic Event (not emitted)] contract:CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, topics:[error, Error(Contract, #100)], data:"escalating error to VM trap from failed host function call: fail_with_error"
   4: [Failed Diagnostic Event (not emitted)] contract:CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, topics:[error, Error(Contract, #100)], data:["failing with contract error", 100]
   5: [Diagnostic Event] contract:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, topics:[fn_call, CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, transfer], data:[GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L, CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, 1000]
   6: [Diagnostic Event] contract:CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, topics:[fn_return, balance], data:6004000
   7: [Diagnostic Event] contract:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, topics:[fn_call, CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, balance], data:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM
   8: [Diagnostic Event] topics:[fn_call, CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, deposit], data:[1000, GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L, GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L, GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L]"####;
    const CONSTRUCTOR_TEXT: &str = r####"ℹ️  Deploying contract using wasm hash 67e44a6286e46ab0b0438e3e32fba05fdd5a618412b53086cfa587beb273a0ac
error: unexpected argument '--decimals_offset' found

Usage: __constructor --name <String> --symbol <String> --asset <Address>

For more information, try '--help'."####;
    const MISSING_FUNCTION_TEXT: &str = r####"error: unrecognized subcommand 'query_asset'

Usage: C:\Program Files (x86)\Stellar CLI\stellar.exe contract invoke --id CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7 --source-account carol --network testnet -- [COMMAND]

For more information, try '--help'."####;
    const CONNECT_TEXT: &str = r####"❌ error: client error (Connect)"####;

    fn diag(class: ErrorClass, raw: Option<&str>, retry: RetryNote) -> Diagnosis {
        Diagnosis { class, raw: raw.map(str::to_string), retry }
    }

    fn call(function: &'static str, na_if_missing: bool) -> Subject<'static> {
        Subject::Call { function, account: "alice", na_if_missing }
    }

    fn result_of(stop: Stop, wrap: &'static str) -> CheckResult {
        stop.finish("deposit".to_string(), move |m| format!("{wrap}: {m}"))
    }

    // P1: a proven vault defect, and every failure the tool does not remap, stays a FAIL
    // with its existing text.
    #[test]
    fn p1_a_fail_keeps_its_text_and_has_no_reason_code() {
        let r = result_of(Stop::Fail("shares differ".to_string()), "deposit invoke failed");
        assert_eq!(r.status, CheckStatus::Fail);
        assert_eq!(r.reason_code, None);
        assert_eq!(r.detail, "deposit invoke failed: shares differ");
    }

    // P2
    #[test]
    fn p2_insufficient_balance_is_inconclusive_with_the_raw_error() {
        let d = diag(ErrorClass::InsufficientTokenBalance, Some(BALANCE_TEXT), RetryNote::RetriedFoundText);
        let r = result_of(verdict(&call("deposit", false), &d).unwrap(), "unused");
        assert_eq!(r.status, CheckStatus::Inconclusive);
        assert_eq!(r.reason_code, Some("insufficient_token_balance"));
        assert!(r.detail.contains("test account 'alice'"));
        assert!(r.detail.contains("not a finding about the vault"));
        assert!(r.detail.ends_with(BALANCE_TEXT.trim()) || r.detail.contains("Raw error: "));
        assert!(r.detail.contains("Error(Contract, #100)"));
        // no balance figure is claimed
        assert!(!r.detail.contains("holds"));
    }

    // P3
    #[test]
    fn p3_a_constructor_mismatch_is_not_applicable() {
        let d = diag(ErrorClass::ConstructorMismatch, Some(CONSTRUCTOR_TEXT), RetryNote::NotRetried);
        let r = result_of(verdict(&Subject::Deploy, &d).unwrap(), "unused");
        assert_eq!(r.status, CheckStatus::NotApplicable);
        assert_eq!(r.reason_code, Some("constructor_mismatch"));
        assert!(r.detail.contains("--name, --symbol, --asset, --decimals_offset"));
        assert!(r.detail.contains("No finding about the vault"));
        assert!(r.detail.contains("unexpected argument '--decimals_offset' found"));
    }

    #[test]
    fn p3_other_deploy_failures_are_inconclusive() {
        let net = diag(ErrorClass::Network, Some(CONNECT_TEXT), RetryNote::NotRetried);
        let r = result_of(verdict(&Subject::Deploy, &net).unwrap(), "unused");
        assert_eq!((r.status, r.reason_code), (CheckStatus::Inconclusive, Some("network_error")));

        let silent = diag(ErrorClass::Unclassified, None, RetryNote::NotRetried);
        let r = result_of(verdict(&Subject::Deploy, &silent).unwrap(), "unused");
        assert_eq!((r.status, r.reason_code), (CheckStatus::Inconclusive, Some("unclassified_error")));
        assert!(r.detail.contains("No error text was available."));
    }

    // P4
    #[test]
    fn p4_a_missing_non_sep56_function_is_not_applicable() {
        let d = diag(ErrorClass::NotAStandardVault, Some(MISSING_FUNCTION_TEXT), RetryNote::NotRetried);
        let r = result_of(verdict(&call("query_asset", true), &d).unwrap(), "unused");
        assert_eq!(r.status, CheckStatus::NotApplicable);
        assert_eq!(r.reason_code, Some("not_a_standard_vault"));
        assert!(r.detail.contains("(query_asset)"));
        assert!(r.detail.contains("unrecognized subcommand 'query_asset'"));
    }

    #[test]
    fn p4_no_wasm_of_its_own_is_not_applicable_and_a_network_error_is_inconclusive() {
        let d = diag(ErrorClass::NotAStandardVault, Some("error: cannot fetch wasm"), RetryNote::NotRetried);
        let r = result_of(verdict(&Subject::WasmHash, &d).unwrap(), "unused");
        assert_eq!((r.status, r.reason_code), (CheckStatus::NotApplicable, Some("not_a_standard_vault")));
        let n = diag(ErrorClass::Network, Some(CONNECT_TEXT), RetryNote::RetriedFoundText);
        let r = result_of(verdict(&Subject::WasmHash, &n).unwrap(), "unused");
        assert_eq!((r.status, r.reason_code), (CheckStatus::Inconclusive, Some("network_error")));
    }

    // P5
    #[test]
    fn p5_a_network_error_anywhere_is_inconclusive() {
        let d = diag(ErrorClass::Network, Some(CONNECT_TEXT), RetryNote::RetriedFoundText);
        for function in ["deposit", "total_assets", "preview_mint", "allowance"] {
            let r = result_of(verdict(&call(function, false), &d).unwrap(), "unused");
            assert_eq!((r.status, r.reason_code), (CheckStatus::Inconclusive, Some("network_error")));
            assert!(r.detail.contains(&format!("the call to {function}()")));
            assert!(r.detail.contains("Run again later."));
        }
    }

    // P6
    #[test]
    fn p6_an_unknown_error_is_inconclusive_and_says_what_the_repeat_showed() {
        let cases = [
            (None, RetryNote::RetriedSucceeded, "could not be reproduced"),
            (None, RetryNote::RetriedNoText, "also when the call was repeated without --quiet"),
            (Some("error: something new"), RetryNote::RetriedFoundText, "Raw error: error: something new"),
        ];
        for (raw, retry, expected) in cases {
            let d = diag(ErrorClass::Unclassified, raw, retry);
            let r = result_of(verdict(&call("mint", false), &d).unwrap(), "unused");
            assert_eq!((r.status, r.reason_code), (CheckStatus::Inconclusive, Some("unclassified_error")));
            assert!(r.detail.contains(expected), "{}", r.detail);
        }
    }

    // P7: a missing SEP-56 function is left exactly as it is today (a FAIL).
    #[test]
    fn p7_a_missing_required_function_stays_a_fail() {
        let d = diag(ErrorClass::NotAStandardVault, Some(MISSING_FUNCTION_TEXT), RetryNote::NotRetried);
        for function in [
            "total_assets", "deposit", "mint", "withdraw", "redeem", "convert_to_shares",
            "convert_to_assets", "preview_deposit", "max_withdraw", "decimals",
        ] {
            assert!(verdict(&call(function, false), &d).is_none(), "{function}");
        }
    }

    #[test]
    fn a_new_status_carries_a_reason_code_and_a_fail_does_not() {
        assert_eq!(CheckResult::fail("x".into(), "d".into()).reason_code, None);
        assert_eq!(CheckResult::pass("x".into(), "d".into()).reason_code, None);
        assert_eq!(CheckResult::inconclusive("x".into(), "network_error", "d".into()).reason_code, Some("network_error"));
        assert_eq!(CheckResult::not_applicable("x".into(), "constructor_mismatch", "d".into()).reason_code, Some("constructor_mismatch"));
    }

    #[test]
    fn raw_error_text_is_cut_at_the_limit() {
        let long = "x".repeat(RAW_ERROR_LIMIT + 50);
        let cut = truncate_raw(&long);
        assert!(cut.ends_with(" [truncated]"));
        assert_eq!(cut.chars().count(), RAW_ERROR_LIMIT + " [truncated]".chars().count());
        assert_eq!(truncate_raw("short"), "short");
    }
}
