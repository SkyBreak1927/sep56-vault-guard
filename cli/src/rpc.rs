use std::fmt;
use std::process::Stdio;

use serde_json::Value;
use tokio::process::Command;

/// Errors that can occur while invoking a contract function via the
/// `stellar` CLI subprocess.
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
                "`stellar contract invoke` failed (exit code {:?}): {}",
                exit_code,
                if stderr.is_empty() {
                    "<no stderr output>"
                } else {
                    stderr
                }
            ),
            RpcError::UnexpectedStderr(stderr) => write!(
                f,
                "`stellar contract invoke` exited successfully but wrote to stderr: {stderr}"
            ),
            RpcError::InvalidJson { raw, source } => write!(
                f,
                "failed to parse `stellar contract invoke` output as JSON: {source} (raw output: {raw:?})"
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
    let output = Command::new("stellar")
        .arg("contract")
        .arg("invoke")
        .arg("--id")
        .arg(contract_id)
        .arg("--source-account")
        .arg(source_account)
        .arg("--network")
        .arg("testnet")
        .arg("--quiet")
        .arg("--")
        .arg(function_name)
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

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if stdout.is_empty() {
        return Ok(Value::Null);
    }

    serde_json::from_str(&stdout).map_err(|source| RpcError::InvalidJson {
        raw: stdout,
        source,
    })
}
