//! Prerequisite checks that run once, before any vault check.
//!
//! Without these, a missing prerequisite surfaced as all 11 checks failing
//! with a low-level spawn or RPC error, which says nothing about what the
//! operator actually has to fix. This module answers that question first and
//! stops the run, so a prerequisite problem is never mistaken for a finding
//! about the vault.
//!
//! Every probe here goes through the same `run_stellar` helper the checks
//! themselves use. That matters on Windows: the checker starts the executable
//! directly, so a `stellar.cmd` or `stellar.bat` shim that works in a terminal
//! is not resolved. Probing through a shell instead would let preflight pass
//! and leave all 11 checks failing anyway.

use serde::Serialize;

use crate::rpc::{run_stellar, RpcError};

/// Lowest `stellar` major version the checks are known to work against.
const MIN_STELLAR_MAJOR: u32 = 28;

/// Native (XLM) balance below which a test account is flagged. The seven
/// accounts pay transaction fees and, for the security checks, the rent and
/// fees of a freshly deployed vault copy, so a nearly empty account will fail
/// partway through a run rather than cleanly at the start.
const LOW_BALANCE_XLM: f64 = 5.0;

/// A prerequisite that is missing, with what to do about it.
///
/// Serialized as the whole `--output json` payload when preflight fails, in
/// place of the usual array of check results.
#[derive(Serialize)]
pub struct PreflightError {
    /// Always `"preflight_failed"`, so a consumer can tell this payload from
    /// an array of check results without inspecting its shape.
    pub error: &'static str,
    /// Machine-readable reason, stable across message wording changes.
    pub code: &'static str,
    /// What is wrong, in one sentence.
    pub problem: String,
    /// What the operator should do about it.
    pub fix: String,
}

impl PreflightError {
    fn new(code: &'static str, problem: String, fix: String) -> Self {
        PreflightError { error: "preflight_failed", code, problem, fix }
    }
}

/// What preflight found when it did not fail: advisory notes that are worth
/// printing but are not reasons to stop.
pub struct Preflight {
    pub warnings: Vec<String>,
}

/// How to install a `stellar` the checker can actually start.
fn install_hint() -> String {
    let mut hint = String::from(
        "Install Stellar CLI v28 or newer and make sure it is on PATH \
         (https://github.com/stellar/stellar-cli/releases).",
    );
    if cfg!(windows) {
        hint.push_str(
            " On Windows, use a package that provides stellar.exe, such as the \
             official stellar-cli-<version>-x86_64-pc-windows-msvc archive. A \
             stellar.cmd or stellar.bat shim is not enough: the checker starts the \
             executable directly rather than through a shell, so a shim that works \
             in your terminal will not be found here.",
        );
    }
    hint
}

/// Runs every prerequisite check in order and stops at the first failure.
///
/// `Ok` means the run may proceed; any warnings are advisory. `Err` means no
/// check should run at all.
pub async fn run(vault: &str, accounts: &[&str]) -> Result<Preflight, PreflightError> {
    check_stellar_available().await?;
    check_identities(accounts).await?;
    check_vault_is_a_contract(vault).await?;
    Ok(Preflight { warnings: check_balances(accounts).await })
}

/// (a) `stellar` can be started, and is at least `MIN_STELLAR_MAJOR`.
async fn check_stellar_available() -> Result<(), PreflightError> {
    let raw = match run_stellar(&["--version".to_string()]).await {
        Ok(out) => out,
        Err(RpcError::Spawn(e)) => {
            return Err(PreflightError::new(
                "stellar_not_found",
                format!("the `stellar` executable could not be started: {e}"),
                install_hint(),
            ));
        }
        Err(e) => {
            return Err(PreflightError::new(
                "stellar_version_unreadable",
                format!("`stellar --version` did not succeed: {e}"),
                install_hint(),
            ));
        }
    };

    let version = raw.lines().next().unwrap_or_default().trim().to_string();
    match parse_major(&version) {
        Some(major) if major >= MIN_STELLAR_MAJOR => Ok(()),
        Some(major) => Err(PreflightError::new(
            "stellar_version_too_old",
            format!(
                "found `stellar` major version {major}, but the checks require \
                 {MIN_STELLAR_MAJOR} or newer (reported: {version})"
            ),
            install_hint(),
        )),
        None => Err(PreflightError::new(
            "stellar_version_unreadable",
            format!("could not read a version number out of `stellar --version` ({version:?})"),
            install_hint(),
        )),
    }
}

/// Pulls the major version out of a line like `stellar 28.0.0 (abc123)`.
fn parse_major(version_line: &str) -> Option<u32> {
    version_line
        .split_whitespace()
        .find_map(|word| word.split('.').next()?.parse::<u32>().ok())
}

/// (b) Every account the checks use resolves to an address.
async fn check_identities(accounts: &[&str]) -> Result<(), PreflightError> {
    let mut missing = Vec::new();
    for name in accounts {
        let args = vec!["keys".to_string(), "address".to_string(), (*name).to_string()];
        match run_stellar(&args).await {
            Ok(address) if address.starts_with('G') => {}
            _ => missing.push((*name).to_string()),
        }
    }

    if missing.is_empty() {
        return Ok(());
    }

    let list = missing.join(", ");
    let spaced = missing.join(" ");
    let quoted = missing.join("\",\"");
    let fix = [
        "Create and fund them on testnet, for example:".to_string(),
        format!("  sh:         for n in {spaced}; do stellar keys generate $n --network testnet --fund; done"),
        format!("  PowerShell: foreach ($n in \"{quoted}\") {{ stellar keys generate $n --network testnet --fund }}"),
        format!("  cmd:        for %n in ({spaced}) do stellar keys generate %n --network testnet --fund"),
    ]
    .join("
");

    Err(PreflightError::new(
        "identities_missing",
        format!("these test identities do not exist: {list}"),
        fix,
    ))
}

/// (c) The vault address is a Soroban contract that exists on testnet.
async fn check_vault_is_a_contract(vault: &str) -> Result<(), PreflightError> {
    // Catch an obviously malformed address before spending a round trip, so
    // the message names the real problem instead of relaying an RPC error.
    let well_formed = vault.len() == 56
        && vault.starts_with('C')
        && vault.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());
    if !well_formed {
        return Err(PreflightError::new(
            "vault_address_malformed",
            format!(
                "{vault} is not a contract address: a Soroban contract address is 56 \
                 characters and starts with C"
            ),
            "Pass a deployed vault's contract address with --vault.".to_string(),
        ));
    }

    let args = vec![
        "contract".to_string(),
        "info".to_string(),
        "hash".to_string(),
        "--contract-id".to_string(),
        vault.to_string(),
        "--network".to_string(),
        "testnet".to_string(),
        "--quiet".to_string(),
    ];

    match run_stellar(&args).await {
        Ok(_) => Ok(()),
        Err(e) => Err(PreflightError::new(
            "vault_not_a_contract",
            format!(
                "{vault} is not a contract on testnet, or has no Wasm of its own \
                 (a Stellar Asset Contract has none): {e}"
            ),
            "Check the address, and that it is deployed on testnet rather than \
             another network."
                .to_string(),
        )),
    }
}

/// (d) The test accounts hold enough XLM to pay their way through a run.
///
/// Advisory only: a thin balance is reported as a warning, never as a reason
/// to stop. Horizon being unreachable is not reported at all -- the checks
/// themselves will surface a network problem soon enough, and a warning about
/// a balance we could not read would only add noise.
async fn check_balances(accounts: &[&str]) -> Vec<String> {
    let mut warnings = Vec::new();

    for name in accounts {
        let args = vec!["keys".to_string(), "address".to_string(), (*name).to_string()];
        let Ok(address) = run_stellar(&args).await else { continue };

        match native_balance(&address).await {
            Ok(Some(balance)) if balance < LOW_BALANCE_XLM => warnings.push(format!(
                "{name} ({address}) holds {balance:.1} XLM, under the {LOW_BALANCE_XLM:.0} XLM \
                 a run is expected to need; top it up with Friendbot if a check runs out of funds"
            )),
            Ok(None) => warnings.push(format!(
                "{name} ({address}) does not exist on testnet yet; fund it with \
                 `stellar keys fund {name} --network testnet`"
            )),
            _ => {}
        }
    }

    warnings
}

/// Reads an account's native balance from Horizon. `Ok(None)` means Horizon
/// knows nothing about the account, which for testnet means unfunded.
async fn native_balance(address: &str) -> Result<Option<f64>, String> {
    #[derive(serde::Deserialize)]
    struct Account {
        balances: Vec<Balance>,
    }
    #[derive(serde::Deserialize)]
    struct Balance {
        asset_type: String,
        balance: String,
    }

    let url = format!("https://horizon-testnet.stellar.org/accounts/{address}");
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    let account: Account = response.json().await.map_err(|e| e.to_string())?;
    Ok(account
        .balances
        .iter()
        .find(|b| b.asset_type == "native")
        .and_then(|b| b.balance.parse::<f64>().ok()))
}

#[cfg(test)]
mod tests {
    use super::parse_major;

    #[test]
    fn reads_the_major_version_from_the_cli_banner() {
        assert_eq!(parse_major("stellar 28.0.0 (300aaf69ab)"), Some(28));
        assert_eq!(parse_major("stellar 29.1.4"), Some(29));
        assert_eq!(parse_major("stellar 7.0.0"), Some(7));
    }

    #[test]
    fn returns_nothing_when_there_is_no_version_to_read() {
        assert_eq!(parse_major("stellar"), None);
        assert_eq!(parse_major(""), None);
    }
}
