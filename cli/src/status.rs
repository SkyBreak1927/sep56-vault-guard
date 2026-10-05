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

use crate::checks::{CheckResult, CheckStatus};

#[derive(Clone, Serialize)]
pub struct CheckStatusEntry {
    pub id: &'static str,
    pub group: &'static str,
    /// "pending" | "running" | "pass" | "fail" | "inconclusive" |
    /// "not_applicable". The last two exist in the schema but no check
    /// produces them yet. ("warn" was reserved here earlier and never
    /// emitted; the web still understands it.)
    pub status: String,
    pub detail: Option<String>,
    /// Machine-readable cause for "inconclusive" and "not_applicable". Left
    /// out of the file entirely when there is none, so a snapshot of a run
    /// with only pass and fail results is unchanged.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<&'static str>,
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
                reason_code: None,
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

    /// Records `id`'s final status, `reason_code` and `detail`, taken directly
    /// from the check's own result — this never fabricates or alters a
    /// result, only records the one the check already computed.
    async fn mark_done(
        &self,
        id: &str,
        status: CheckStatus,
        reason_code: Option<&'static str>,
        detail: &str,
    ) {
        let mut entries = self.entries.lock().await;
        if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
            entry.status = status.as_status_file_str().to_string();
            entry.reason_code = reason_code;
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
/// its final status (with its detail) the moment it finishes — independent of
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
    reporter.mark_done(id, result.status, result.reason_code, &result.detail).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_file_strings_for_all_four_final_statuses() {
        assert_eq!(CheckStatus::Pass.as_status_file_str(), "pass");
        assert_eq!(CheckStatus::Fail.as_status_file_str(), "fail");
        assert_eq!(CheckStatus::Inconclusive.as_status_file_str(), "inconclusive");
        assert_eq!(CheckStatus::NotApplicable.as_status_file_str(), "not_applicable");
    }

    fn entry(reason_code: Option<&'static str>) -> CheckStatusEntry {
        CheckStatusEntry {
            id: "deposit",
            group: "conformance",
            status: "pass".to_string(),
            detail: Some("ok".to_string()),
            reason_code,
        }
    }

    #[test]
    fn entry_without_reason_code_keeps_the_old_shape() {
        let json = serde_json::to_string(&entry(None)).unwrap();
        assert_eq!(json, r#"{"id":"deposit","group":"conformance","status":"pass","detail":"ok"}"#);
    }

    #[test]
    fn entry_with_reason_code_writes_it_last() {
        let json = serde_json::to_string(&entry(Some("network_error"))).unwrap();
        assert_eq!(
            json,
            r#"{"id":"deposit","group":"conformance","status":"pass","detail":"ok","reason_code":"network_error"}"#
        );
    }

    #[tokio::test]
    async fn snapshot_file_carries_every_status_and_only_present_reason_codes() {
        let path = std::env::temp_dir()
            .join(format!("aegis-status-test-{}.json", std::process::id()));
        let reporter = StatusReporter::new(Some(path.clone()), "CVAULT").await;

        reporter.mark_running("total_assets").await;
        reporter.mark_done("deposit", CheckStatus::Pass, None, "d1").await;
        reporter.mark_done("mint", CheckStatus::Fail, None, "d2").await;
        reporter
            .mark_done("withdraw", CheckStatus::Inconclusive, Some("insufficient_token_balance"), "d3")
            .await;
        reporter
            .mark_done("redeem", CheckStatus::NotApplicable, Some("constructor_mismatch"), "d4")
            .await;

        let parsed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let _ = std::fs::remove_file(&path);
        let status_of = |id: &str| {
            let c = parsed["checks"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == id)
                .unwrap()
                .clone();
            (c["status"].as_str().unwrap().to_string(), c.get("reason_code").cloned())
        };

        assert_eq!(status_of("convert_to_shares"), ("pending".to_string(), None));
        assert_eq!(status_of("total_assets"), ("running".to_string(), None));
        assert_eq!(status_of("deposit"), ("pass".to_string(), None));
        assert_eq!(status_of("mint"), ("fail".to_string(), None));
        assert_eq!(
            status_of("withdraw"),
            ("inconclusive".to_string(), Some(serde_json::json!("insufficient_token_balance")))
        );
        assert_eq!(
            status_of("redeem"),
            ("not_applicable".to_string(), Some(serde_json::json!("constructor_mismatch")))
        );
    }
}
