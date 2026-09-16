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
async fn run_stellar(args: &[String]) -> Result<String, RpcError> {
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
