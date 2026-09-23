//! Optional real-time progress reporting: as each of the 11 checks starts
//! and finishes, writes a JSON snapshot of every check's current status to
//! a file, so a separate process (e.g. the backend, polling on behalf of a
//! web client) can report granular progress instead of only "done" or
//! "not done". This module only *reports* results the checks already
//! computed — it never influences what those results are.
//!
//! Writing is opt-in: [`StatusReporter::new`] takes an `Option<PathBuf>`,
//! and every method is a no-op when it's `None`, so ordinary CLI usage
//! (text/JSON output, no `--status-file`) is completely unaffected.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::sync::Mutex;

use crate::checks::CheckResult;

#[derive(Clone, Serialize)]
pub struct CheckStatusEntry {
    pub id: &'static str,
    pub group: &'static str,
    /// "pending" | "running" | "pass" | "fail" | "warn". Only "pending",
    /// "running", "pass", and "fail" are ever produced today — "warn" is
    /// reserved in the schema for a future check that isn't a strict
    /// pass/fail, but no existing check emits it, so introducing it here
    /// doesn't change any check's actual result.
    pub status: String,
    pub detail: Option<String>,
}

#[derive(Serialize)]
struct StatusFile<'a> {
    vault: &'a str,
    updated_at_ms: u128,
    checks: &'a [CheckStatusEntry],
}

/// (check id, group) for all 11 checks, in the same fixed order the CLI
/// itself reports them in for `--output json`.
const CHECK_ORDER: &[(&str, &str)] = &[
    ("total_assets", "conformance"),
    ("deposit", "conformance"),
    ("mint", "conformance"),
    ("withdraw", "conformance"),
    ("redeem", "conformance"),
    ("convert_to_shares", "conformance"),
    ("convert_to_assets", "conformance"),
    ("donation_attack", "security"),
    ("overflow_protection", "security"),
    ("rounding_direction", "security"),
    ("access_control_probing", "security"),
];

/// Writes atomic (write-to-temp-then-rename) JSON snapshots of all 11
/// checks' progress. Updates are fully serialized against each other via
/// an internal lock (held across the write), so the 4 checks that run
/// concurrently via `tokio::join!` can never interleave or corrupt the
/// file, regardless of which one finishes first.
pub struct StatusReporter {
    path: Option<PathBuf>,
    vault: String,
    entries: Mutex<Vec<CheckStatusEntry>>,
}

impl StatusReporter {
    /// Creates the reporter and, if `path` is set, immediately writes the
    /// initial file with all 11 checks present and marked "pending" — so
    /// the very first read by a poller already sees the complete list,
    /// not a partial one that fills in over time.
    pub async fn new(path: Option<PathBuf>, vault: &str) -> Self {
        let entries: Vec<CheckStatusEntry> = CHECK_ORDER
            .iter()
            .map(|(id, group)| CheckStatusEntry {
                id,
                group,
                status: "pending".to_string(),
                detail: None,
            })
            .collect();

        let reporter = Self { path, vault: vault.to_string(), entries: Mutex::new(entries) };
        reporter.flush().await;
        reporter
    }

    /// Marks `id` as "running". No-op if `id` isn't one of the 11 known
    /// check ids (defensive; should never happen since callers pass a
    /// fixed string literal matching [`CHECK_ORDER`]).
    async fn mark_running(&self, id: &str) {
        let mut entries = self.entries.lock().await;
        if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
            entry.status = "running".to_string();
        }
        self.flush_locked(&entries).await;
    }

    /// Marks `id` as "pass" or "fail", taken directly from the check's own
    /// `passed` flag and `detail` string — this never fabricates or
    /// alters a result, only records the one the check already computed.
    async fn mark_done(&self, id: &str, passed: bool, detail: &str) {
        let mut entries = self.entries.lock().await;
        if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
            entry.status = if passed { "pass" } else { "fail" }.to_string();
            entry.detail = Some(detail.to_string());
        }
        self.flush_locked(&entries).await;
    }

    async fn flush(&self) {
        let entries = self.entries.lock().await;
        self.flush_locked(&entries).await;
    }

    async fn flush_locked(&self, entries: &[CheckStatusEntry]) {
        let Some(path) = &self.path else { return };

        let payload = StatusFile {
            vault: &self.vault,
            updated_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0),
            checks: entries,
        };
        let Ok(json) = serde_json::to_string_pretty(&payload) else { return };

        // Write-then-rename so a concurrent reader (the backend, polling)
        // never observes a partially-written file.
        let tmp_path = path.with_extension("tmp");
        if tokio::fs::write(&tmp_path, json).await.is_ok() {
            let _ = tokio::fs::rename(&tmp_path, path).await;
        }
    }
}

/// Runs `fut`, marking `id` "running" just before it starts and "pass"/
/// "fail" (with its detail) the moment it finishes — independent of
/// whatever else is running concurrently, so this reports in real time
/// even when several checks are joined together (see `main()`'s
/// `tokio::join!` of the 4 security checks).
pub async fn run_tracked(
    reporter: &StatusReporter,
    id: &'static str,
    fut: impl std::future::Future<Output = CheckResult>,
) -> CheckResult {
    reporter.mark_running(id).await;
    let result = fut.await;
    reporter.mark_done(id, result.passed, &result.detail).await;
    result
}
