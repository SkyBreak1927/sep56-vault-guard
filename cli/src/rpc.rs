use std::fmt;
use std::process::Stdio;

use serde_json::Value;
use tokio::process::Command;

/// Errors that can occur while running a `stellar` CLI subprocess.
#[derive(Debug)]
pub enum RpcError {
    /// The `stellar` binary could not be spawned (e.g. not found on PATH).
    Spawn(std::io::Error),
    /// The process exited with a non-zero status.
    CommandFailed {
        exit_code: Option<i32>,
        stderr: String,
    },
    /// The process exited successfully (status 0) but still wrote to
    /// stderr. With `--quiet` this should only happen for genuine
    /// warnings, so it is treated as an error condition.
    UnexpectedStderr(String),
    /// Stdout was not valid JSON.
    InvalidJson {
        raw: String,
        source: serde_json::Error,
    },
}

impl fmt::Display for RpcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RpcError::Spawn(e) => write!(f, "failed to spawn `stellar` process: {e}"),
            RpcError::CommandFailed { exit_code, stderr } => write!(
                f,
                "`stellar` command failed (exit code {:?}): {}",
                exit_code,
                if stderr.is_empty() {
                    "<no stderr output>"
                } else {
                    stderr
                }
            ),
            RpcError::UnexpectedStderr(stderr) => write!(
                f,
                "`stellar` command exited successfully but wrote to stderr: {stderr}"
            ),
            RpcError::InvalidJson { raw, source } => write!(
                f,
                "failed to parse `stellar` command output as JSON: {source} (raw output: {raw:?})"
            ),
        }
    }
}

impl std::error::Error for RpcError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            RpcError::Spawn(e) => Some(e),
            RpcError::InvalidJson { source, .. } => Some(source),
            RpcError::CommandFailed { .. } | RpcError::UnexpectedStderr(_) => None,
        }
    }
}

/// Runs `stellar` with the given fully-formed argument list as a
/// subprocess, and returns trimmed stdout after verifying the process
/// exited successfully and wrote nothing to stderr.
///
/// Callers are responsible for placing `--quiet` correctly in `args`
/// (before any `--` subcommand-argument separator), since appending it
/// blindly at the end could land it past a `--` and be misinterpreted as
/// a positional argument to the invoked contract function instead of a
/// top-level CLI flag.
pub(crate) async fn run_stellar(args: &[String]) -> Result<String, RpcError> {
    let output = Command::new("stellar")
        .args(args)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(RpcError::Spawn)?;

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(RpcError::CommandFailed {
            exit_code: output.status.code(),
            stderr,
        });
    }

    if !stderr.is_empty() {
        return Err(RpcError::UnexpectedStderr(stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Invokes a function on a deployed Soroban contract by wrapping
/// `stellar contract invoke` as a subprocess (rather than talking to
/// RPC/XDR directly), and parses its stdout as JSON.
///
/// Runs:
/// `stellar contract invoke --id <contract_id> --source-account <source_account>
///  --network testnet --quiet -- <function_name> <args...>`
pub async fn invoke_contract(
    contract_id: &str,
    function_name: &str,
    args: &[String],
    source_account: &str,
) -> Result<Value, RpcError> {
    let mut full_args: Vec<String> = vec![
        "contract".to_string(),
        "invoke".to_string(),
        "--id".to_string(),
        contract_id.to_string(),
        "--source-account".to_string(),
        source_account.to_string(),
        "--network".to_string(),
        "testnet".to_string(),
        "--quiet".to_string(),
        "--".to_string(),
        function_name.to_string(),
    ];
    full_args.extend(args.iter().cloned());

    let stdout = run_stellar(&full_args).await?;

    if stdout.is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str(&stdout).map_err(|source| RpcError::InvalidJson {
        raw: stdout,
        source,
    })
}

/// Deploys a new instance of an already-uploaded contract (identified by
/// its wasm hash, so no re-upload is needed) via `stellar contract
/// deploy`, and returns the newly deployed contract's address.
///
/// Runs:
/// `stellar contract deploy --wasm-hash <wasm_hash> --source-account <source_account>
///  --network testnet --quiet -- <constructor_args...>`
pub async fn deploy_contract(
    wasm_hash: &str,
    source_account: &str,
    constructor_args: &[String],
) -> Result<String, RpcError> {
    let mut full_args: Vec<String> = vec![
        "contract".to_string(),
        "deploy".to_string(),
        "--wasm-hash".to_string(),
        wasm_hash.to_string(),
        "--source-account".to_string(),
        source_account.to_string(),
        "--network".to_string(),
        "testnet".to_string(),
        "--quiet".to_string(),
        "--".to_string(),
    ];
    full_args.extend(constructor_args.iter().cloned());

    run_stellar(&full_args).await
}

/// Fetches the SHA-256 hash of a deployed contract's Wasm executable, by
/// its contract address, via `stellar contract info hash`.
///
/// Runs:
/// `stellar contract info hash --contract-id <contract_id> --network testnet --quiet`
///
/// Note: this fails for a Stellar Asset Contract (SAC), which has no Wasm
/// of its own — a useful signal that `contract_id` isn't actually a
/// Soroban vault contract if this errors unexpectedly.
pub async fn fetch_wasm_hash(contract_id: &str) -> Result<String, RpcError> {
    let args = vec![
        "contract".to_string(),
        "info".to_string(),
        "hash".to_string(),
        "--contract-id".to_string(),
        contract_id.to_string(),
        "--network".to_string(),
        "testnet".to_string(),
        "--quiet".to_string(),
    ];

    run_stellar(&args).await
}

/// Fetches the current ledger sequence from Horizon testnet.
///
/// Used to compute a `live_until_ledger` value for `approve()` calls that
/// is guaranteed to not already be expired at the time the transaction
/// executes — the vault's `FungibleTokenError::InvalidLiveUntilLedger`
/// check requires `live_until_ledger >= current ledger sequence`, so a
/// hardcoded constant would eventually go stale as the network progresses.
pub async fn fetch_current_ledger_sequence() -> Result<u32, String> {
    #[derive(serde::Deserialize)]
    struct HorizonRoot {
        history_latest_ledger: u32,
    }

    let response = reqwest::get("https://horizon-testnet.stellar.org/")
        .await
        .map_err(|e| format!("Horizon request failed: {e}"))?;

    let body: HorizonRoot = response
        .json()
        .await
        .map_err(|e| format!("failed to parse Horizon response: {e}"))?;

    Ok(body.history_latest_ledger)
}

/// Which kind of `stellar` command an error text came from. The same words can
/// mean different things for different commands, so [`classify_error_text`]
/// is told which one it is looking at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub enum CommandKind {
    /// `stellar contract invoke`
    Invoke,
    /// `stellar contract deploy`
    Deploy,
    /// `stellar contract info ...`
    Info,
}

/// What an error from `stellar` is known to be about. `Unclassified` is the
/// answer whenever the text does not match a rule that was checked against a
/// real error; it is never a guess.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub enum ErrorClass {
    /// A token transfer failed because the paying account holds too little.
    InsufficientTokenBalance,
    /// A vault's constructor does not take the arguments the checker passes.
    ConstructorMismatch,
    /// The contract has no function the checker needs, or has no Wasm code of
    /// its own (a Stellar Asset Contract), or does not exist.
    NotAStandardVault,
    /// The RPC endpoint could not be reached.
    Network,
    /// Anything else, including an empty text.
    Unclassified,
}

impl ErrorClass {
    /// The machine-readable reason code for this class.
    #[allow(dead_code)]
    pub fn reason_code(self) -> &'static str {
        match self {
            ErrorClass::InsufficientTokenBalance => "insufficient_token_balance",
            ErrorClass::ConstructorMismatch => "constructor_mismatch",
            ErrorClass::NotAStandardVault => "not_a_standard_vault",
            ErrorClass::Network => "network_error",
            ErrorClass::Unclassified => "unclassified_error",
        }
    }
}

impl RpcError {
    /// The text `stellar` wrote about the failure, when there is any.
    #[allow(dead_code)]
    pub fn error_text(&self) -> Option<&str> {
        match self {
            RpcError::CommandFailed { stderr, .. } => Some(stderr),
            RpcError::UnexpectedStderr(stderr) => Some(stderr),
            RpcError::Spawn(_) | RpcError::InvalidJson { .. } => None,
        }
    }

    /// Classifies this error. A process that could not be started, or output
    /// that was not JSON, says nothing about the vault and is `Unclassified`.
    #[allow(dead_code)]
    pub fn classify(&self, kind: CommandKind) -> ErrorClass {
        self.error_text()
            .map_or(ErrorClass::Unclassified, |text| classify_error_text(kind, text))
    }
}

/// Classifies the text `stellar` wrote for a failed command.
///
/// Every rule below was written from error text collected from the real
/// `stellar` 28.0.0 on testnet (the cases are kept as test fixtures in this
/// file), and says which case it comes from and how far it has been checked.
/// A bare contract error number is never enough on its own: a number means
/// different things in different contracts, so a rule that uses one also
/// requires text showing which call failed.
///
/// Important: the checker runs `stellar` with `--quiet`, and with `--quiet`
/// the CLI prints NOTHING for a simulation failure or an unreachable RPC (it
/// still prints argument-parsing errors). Texts from such runs are empty, so
/// they classify as `Unclassified` until the cause is captured some other way.
#[allow(dead_code)]
pub fn classify_error_text(kind: CommandKind, text: &str) -> ErrorClass {
    // Unreachable RPC. Seen with a refused connection (127.0.0.1:9) and with an
    // unresolvable host; both print the same line. Not checked: timeouts, TLS
    // failures and HTTP error statuses, which may read differently.
    if text.contains("client error (Connect)") {
        return ErrorClass::Network;
    }

    match kind {
        // Seen deploying a clone of a vault whose constructor takes only
        // --name, --symbol and --asset, with --decimals_offset added. Both
        // markers are required, so an unknown flag anywhere else does not
        // match. Not checked: a constructor that wants an argument the
        // checker does not pass (a "required arguments" error).
        CommandKind::Deploy => {
            if text.contains("unexpected argument '--") && text.contains("Usage: __constructor") {
                return ErrorClass::ConstructorMismatch;
            }
        }
        CommandKind::Invoke => {
            // Seen invoking `query_asset` on a token contract, which has no
            // such function. Says only that the function is missing; whether
            // that makes the contract "not a standard vault" depends on which
            // function the caller needed.
            if text.contains("error: unrecognized subcommand '") {
                return ErrorClass::NotAStandardVault;
            }
            if text.contains("transaction simulation failed") && failed_transfer(text) {
                // stellar-tokens 0.7.2 (a custom token built from this
                // repository's `blind-asset`): the failed `transfer` carries
                // Error(Contract, #100), which that library defines as
                // InsufficientBalance (stellar-tokens-0.7.2,
                // src/fungible/mod.rs). Seen with a zero-balance account.
                // Another token library may use #100 for something else and
                // has not been tried.
                if text.contains("Error(Contract, #100)") {
                    return ErrorClass::InsufficientTokenBalance;
                }
                // The native asset's Stellar Asset Contract: the failed
                // `transfer` logs "resulting balance is not within the allowed
                // range" followed by three numbers whose second is the balance
                // the transfer would leave. A negative one means the account
                // holds less than the amount. Seen with a deposit of 10^18
                // stroops (the second number was balance - amount). A
                // non-negative one (an upper limit) is not claimed.
                if resulting_balance_is_negative(text) {
                    return ErrorClass::InsufficientTokenBalance;
                }
            }
        }
        // Seen with `contract info hash` on the native asset's contract
        // ("network built-in asset contract") and on an address with no
        // contract ("contract not found"). Other `info` failures not checked.
        CommandKind::Info => {
            if text.contains("does not have a downloadable code binary")
                || text.contains("error: contract not found:")
            {
                return ErrorClass::NotAStandardVault;
            }
        }
    }

    ErrorClass::Unclassified
}

/// True when the diagnostics show a cross-contract `transfer` call that failed.
fn failed_transfer(text: &str) -> bool {
    text.contains(r#"["contract call failed", transfer,"#)
}

/// Reads the numbers after "resulting balance is not within the allowed
/// range" and reports whether the second one (the balance the transfer would
/// leave) is negative.
fn resulting_balance_is_negative(text: &str) -> bool {
    const MARKER: &str = r#""resulting balance is not within the allowed range","#;
    let Some(start) = text.find(MARKER) else { return false };
    let rest = &text[start + MARKER.len()..];
    let list = rest.split(']').next().unwrap_or("");
    let numbers: Vec<i128> = list.split(',').filter_map(|n| n.trim().parse().ok()).collect();
    numbers.len() == 3 && numbers[1] < 0
}

#[cfg(test)]
mod tests {
    use super::*;

    // Raw text from the real `stellar` 28.0.0 on testnet, run without --quiet
    // (stderr, trimmed). Cases a, b, g and h were run with `--send=no`, so
    // nothing was submitted. Addresses are public.
    const A_TOKEN_BALANCE_ZERO: &str = r####"❌ error: transaction simulation failed: HostError: Error(Contract, #100)

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

    const B_NATIVE_OVER_BALANCE: &str = r####"❌ error: transaction simulation failed: HostError: Error(Contract, #10)

Event log (newest first):
   0: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[error, Error(Contract, #10)], data:"escalating error to VM trap from failed host function call: call"
   1: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[error, Error(Contract, #10)], data:["contract call failed", transfer, [GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, 1000000000000000000]]
   2: [Failed Diagnostic Event (not emitted)] contract:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, topics:[error, Error(Contract, #10)], data:["resulting balance is not within the allowed range", 10000000, -999999902309115978, 9223372036854775807]
   3: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[fn_call, CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, transfer], data:[GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, 1000000000000000000]
   4: [Diagnostic Event] contract:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, topics:[fn_return, balance], data:342501000
   5: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[fn_call, CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, balance], data:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF
   6: [Diagnostic Event] topics:[fn_call, CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, deposit], data:[1000000000000000000, GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554]"####;

    const C_UNKNOWN_CONSTRUCTOR_ARG: &str = r####"ℹ️  Deploying contract using wasm hash 67e44a6286e46ab0b0438e3e32fba05fdd5a618412b53086cfa587beb273a0ac
error: unexpected argument '--decimals_offset' found

Usage: __constructor --name <String> --symbol <String> --asset <Address>

For more information, try '--help'."####;

    const D_NO_SUCH_FUNCTION: &str = r####"error: unrecognized subcommand 'query_asset'

Usage: C:\Program Files (x86)\Stellar CLI\stellar.exe contract invoke --id CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7 --source-account carol --network testnet -- [COMMAND]

For more information, try '--help'."####;

    const E_RPC_REFUSED: &str = r####"❌ error: client error (Connect)"####;

    const F_RPC_UNRESOLVABLE: &str = r####"❌ error: client error (Connect)"####;

    const G_I128_MAX_VAULT_OVERFLOW: &str = r####"❌ error: transaction simulation failed: HostError: Error(Contract, #1500)

Event log (newest first):
   0: [Diagnostic Event] contract:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, topics:[error, Error(Contract, #1500)], data:"escalating error to VM trap from failed host function call: fail_with_error"
   1: [Diagnostic Event] contract:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, topics:[error, Error(Contract, #1500)], data:["failing with contract error", 1500]
   2: [Diagnostic Event] contract:CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, topics:[fn_return, balance], data:6004000
   3: [Diagnostic Event] contract:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, topics:[fn_call, CBLFFTLYJB2YA3DEO4WR7LR33QAAUAVIH5DZQC7Y2GKZ2HW27F652CB7, balance], data:CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM
   4: [Diagnostic Event] topics:[fn_call, CD6DPWCY6LLSNQIGYGTFLJPXT46SEZZQWUKTSVD5B5TX4H7ZWXK22WTM, deposit], data:[170141183460469231731687303715884105727, GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L, GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L, GAAYTSOWQNT6ZHGMQGYVWIRKPF5VMZ4LGYDGYE4YFJ3NAWJU23NL3F3L]"####;

    const H_I128_MAX_NATIVE_INT64: &str = r####"❌ error: transaction simulation failed: HostError: Error(Contract, #12)

Event log (newest first):
   0: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[error, Error(Contract, #12)], data:"escalating error to VM trap from failed host function call: call"
   1: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[error, Error(Contract, #12)], data:["contract call failed", transfer, [GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, 170141183460469231731687303715884105727]]
   2: [Failed Diagnostic Event (not emitted)] contract:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, topics:[error, Error(Contract, #12)], data:"spent amount is too large for an i64"
   3: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[fn_call, CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, transfer], data:[GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, 170141183460469231731687303715884105727]
   4: [Diagnostic Event] contract:CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, topics:[fn_return, balance], data:342501000
   5: [Diagnostic Event] contract:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, topics:[fn_call, CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC, balance], data:CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF
   6: [Diagnostic Event] topics:[fn_call, CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF, deposit], data:[170141183460469231731687303715884105727, GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554, GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554]"####;

    const I_INFO_HASH_OF_BUILT_IN_ASSET: &str = r####"❌ error: cannot fetch wasm for contract because the contract is a network built-in asset contract that does not have a downloadable code binary"####;

    const J_INFO_HASH_OF_MISSING_CONTRACT: &str = r####"❌ error: contract not found: CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"####;

    const EMPTY_STDERR_PLACEHOLDER: &str = "<no stderr output>";

    #[test]
    fn zero_balance_on_a_custom_token_is_insufficient_balance() {
        assert_eq!(
            classify_error_text(CommandKind::Invoke, A_TOKEN_BALANCE_ZERO),
            ErrorClass::InsufficientTokenBalance
        );
    }

    #[test]
    fn deposit_over_the_native_balance_is_insufficient_balance() {
        assert_eq!(
            classify_error_text(CommandKind::Invoke, B_NATIVE_OVER_BALANCE),
            ErrorClass::InsufficientTokenBalance
        );
    }

    #[test]
    fn unknown_constructor_argument_is_a_constructor_mismatch() {
        assert_eq!(
            classify_error_text(CommandKind::Deploy, C_UNKNOWN_CONSTRUCTOR_ARG),
            ErrorClass::ConstructorMismatch
        );
    }

    #[test]
    fn missing_function_is_not_a_standard_vault() {
        assert_eq!(
            classify_error_text(CommandKind::Invoke, D_NO_SUCH_FUNCTION),
            ErrorClass::NotAStandardVault
        );
    }

    #[test]
    fn unreachable_rpc_is_a_network_error() {
        for text in [E_RPC_REFUSED, F_RPC_UNRESOLVABLE] {
            for kind in [CommandKind::Invoke, CommandKind::Deploy, CommandKind::Info] {
                assert_eq!(classify_error_text(kind, text), ErrorClass::Network);
            }
        }
    }

    #[test]
    fn built_in_asset_and_missing_contract_are_not_a_standard_vault() {
        assert_eq!(
            classify_error_text(CommandKind::Info, I_INFO_HASH_OF_BUILT_IN_ASSET),
            ErrorClass::NotAStandardVault
        );
        assert_eq!(
            classify_error_text(CommandKind::Info, J_INFO_HASH_OF_MISSING_CONTRACT),
            ErrorClass::NotAStandardVault
        );
    }

    #[test]
    fn overflow_and_asset_limit_errors_are_not_taken_for_a_balance_problem() {
        // Error(Contract, #1500) is the math library's Overflow, and the
        // native asset's "spent amount is too large for an i64" is a limit on
        // the amount. Neither is a balance problem, and #1500 has no failed
        // transfer around it.
        assert_eq!(
            classify_error_text(CommandKind::Invoke, G_I128_MAX_VAULT_OVERFLOW),
            ErrorClass::Unclassified
        );
        assert_eq!(
            classify_error_text(CommandKind::Invoke, H_I128_MAX_NATIVE_INT64),
            ErrorClass::Unclassified
        );
    }

    #[test]
    fn empty_random_and_placeholder_text_is_unclassified() {
        for text in ["", "   ", EMPTY_STDERR_PLACEHOLDER, "something unrelated went wrong", "error"] {
            for kind in [CommandKind::Invoke, CommandKind::Deploy, CommandKind::Info] {
                assert_eq!(classify_error_text(kind, text), ErrorClass::Unclassified, "{text:?}");
            }
        }
    }

    #[test]
    fn a_bare_contract_error_number_is_not_enough() {
        // #100 and "simulation failed" without a failed transfer around it.
        let text = "error: transaction simulation failed: HostError: Error(Contract, #100)";
        assert_eq!(classify_error_text(CommandKind::Invoke, text), ErrorClass::Unclassified);
        // A failed transfer whose error number is not one the rules know.
        let text = r#"error: transaction simulation failed: HostError: Error(Contract, #7)
 0: [Diagnostic Event] data:["contract call failed", transfer, [A, B, 1]]"#;
        assert_eq!(classify_error_text(CommandKind::Invoke, text), ErrorClass::Unclassified);
    }

    #[test]
    fn a_native_range_message_with_a_non_negative_balance_is_not_claimed() {
        let text = r#"error: transaction simulation failed: HostError: Error(Contract, #10)
 0: [Diagnostic Event] data:["contract call failed", transfer, [A, B, 1]]
 1: data:["resulting balance is not within the allowed range", 10000000, 9223372036854775808, 9223372036854775807]"#;
        assert_eq!(classify_error_text(CommandKind::Invoke, text), ErrorClass::Unclassified);
    }

    #[test]
    fn the_command_kind_matters() {
        // The unknown-argument text means a constructor mismatch only for deploy.
        assert_eq!(
            classify_error_text(CommandKind::Invoke, C_UNKNOWN_CONSTRUCTOR_ARG),
            ErrorClass::Unclassified
        );
        assert_eq!(
            classify_error_text(CommandKind::Deploy, A_TOKEN_BALANCE_ZERO),
            ErrorClass::Unclassified
        );
    }

    #[test]
    fn rpc_error_classification_uses_its_text() {
        let failed = RpcError::CommandFailed {
            exit_code: Some(1),
            stderr: E_RPC_REFUSED.to_string(),
        };
        assert_eq!(failed.classify(CommandKind::Invoke), ErrorClass::Network);

        let quiet = RpcError::CommandFailed { exit_code: Some(1), stderr: String::new() };
        assert_eq!(quiet.classify(CommandKind::Invoke), ErrorClass::Unclassified);

        let spawn = RpcError::Spawn(std::io::Error::other("no such file"));
        assert_eq!(spawn.classify(CommandKind::Invoke), ErrorClass::Unclassified);
    }

    #[test]
    fn reason_codes() {
        assert_eq!(ErrorClass::InsufficientTokenBalance.reason_code(), "insufficient_token_balance");
        assert_eq!(ErrorClass::ConstructorMismatch.reason_code(), "constructor_mismatch");
        assert_eq!(ErrorClass::NotAStandardVault.reason_code(), "not_a_standard_vault");
        assert_eq!(ErrorClass::Network.reason_code(), "network_error");
        assert_eq!(ErrorClass::Unclassified.reason_code(), "unclassified_error");
    }
}
