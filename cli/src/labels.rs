//! Labels added to every report row (SOW 2): the run mode, the SEP-56 text
//! the checks were written against, where each check runs, and a structured
//! `reason` for every row that is not a PASS.
//!
//! All of this is derived from what a check already returned. Nothing here
//! changes a status, a `reason_code`, a `detail` or an exit code; the JSON,
//! Markdown and status-file outputs only gain fields.

use serde::Serialize;

use crate::checks::{CheckResult, CheckStatus};

/// How this run reaches the chain. Testnet is the only mode today: the 7
/// conformance checks change the target vault's state there.
/// `mainnet_read_only` is reserved for a later mode and never emitted.
pub const MODE: &str = "testnet";

/// The SEP-56 text the checks were written against. Keep in step with
/// VAULT_CHECKS.md and `SPEC_REFERENCE` in `web/src/lib/report.ts`.
pub const SPEC_REFERENCE: &str = "SEP-0056 v0.1.2 (Draft)";

/// `runs_on` for the 7 conformance checks: they call the target vault itself.
pub const RUNS_ON_TARGET: &str = "target";
/// `runs_on` for the 4 security checks: they deploy and use a temporary copy.
pub const RUNS_ON_TEMPORARY_COPY: &str = "temporary_copy";

/// `reason.code` of a FAIL caused by a SEP-56 function the vault does not
/// declare (only reachable when the preflight spec could not be read).
pub const INTERFACE_MISSING: &str = "interface_missing";
/// `reason.code` of a conformance FAIL: the function exists, its result broke
/// the check's assertion.
pub const BEHAVIOR_MISMATCH: &str = "behavior_mismatch";
/// `reason.code` of a security FAIL.
pub const SECURITY_FINDING: &str = "security_finding";

/// The 4 checks that run on a temporary copy of the vault.
const SECURITY_CHECKS: [&str; 4] =
    ["donation_attack", "overflow_protection", "rounding_direction", "access_control_probing"];

fn is_security_check(name: &str) -> bool {
    SECURITY_CHECKS.contains(&name)
}

/// Where a check runs: on the target vault or on a temporary copy of it.
pub fn runs_on(check_name: &str) -> &'static str {
    if is_security_check(check_name) {
        RUNS_ON_TEMPORARY_COPY
    } else {
        RUNS_ON_TARGET
    }
}

/// The structured reason of a row that is not a PASS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Reason {
    /// A fixed code a program can branch on. For INCONCLUSIVE and
    /// NOT_APPLICABLE rows it equals `reason_code`.
    pub code: &'static str,
    /// One fixed sentence per code. Never contains raw `stellar` text or
    /// account names; those stay in `detail` and `raw_error`.
    pub message: &'static str,
}

/// The fixed sentence for each code.
pub fn reason_message(code: &str) -> &'static str {
    match code {
        BEHAVIOR_MISMATCH => {
            "The function exists, but what it returned or changed did not match what this check \
             expects. See detail."
        }
        SECURITY_FINDING => {
            "This check ran a scenario on a temporary copy of the vault and flagged the result. \
             This applies to that scenario only, not to the vault as a whole. See detail."
        }
        INTERFACE_MISSING => "The vault does not declare a SEP-56 function this check calls.",
        "insufficient_token_balance" => {
            "A test account holds too little of the vault's underlying asset. Fund it and run \
             again. Not a finding about the vault."
        }
        "network_error" => "The RPC or network could not be reached. Run again later. Not a finding about the vault.",
        "unclassified_error" => {
            "A call failed for a reason the tool could not classify. Not a finding about the \
             vault. See detail. raw_error holds the error text when the CLI printed any, and is \
             absent when it printed none."
        }
        "constructor_mismatch" => {
            "The vault's constructor does not accept the arguments (name, symbol, asset, \
             decimals_offset) under these names, so the temporary copy could not be deployed. Not \
             a finding about the vault."
        }
        "not_a_standard_vault" => {
            "The vault does not expose what this check needs (query_asset, decimals, or Wasm code \
             of its own). Not a finding about the vault."
        }
        "token_interface_mismatch" => {
            "approve or allowance cannot be called by this check. It needs approve(address, \
             address, i128, u32) and allowance(address, address), the second argument of each \
             named spender, and a readable contract spec. Not a finding about the vault."
        }
        _ => "See detail.",
    }
}

/// The `reason` of a finished check: none for a PASS; `reason_code` for
/// INCONCLUSIVE and NOT_APPLICABLE; for a FAIL, `interface_missing` when the
/// check recorded it, otherwise `behavior_mismatch` (conformance) or
/// `security_finding` (security).
pub fn reason_for(result: &CheckResult) -> Option<Reason> {
    let code = match result.status {
        CheckStatus::Pass => return None,
        CheckStatus::Inconclusive | CheckStatus::NotApplicable => result.reason_code?,
        CheckStatus::Fail => result.fail_reason.unwrap_or(if is_security_check(&result.name) {
            SECURITY_FINDING
        } else {
            BEHAVIOR_MISMATCH
        }),
    };
    Some(Reason { code, message: reason_message(code) })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(name: &str, status: CheckStatus, reason_code: Option<&'static str>) -> CheckResult {
        CheckResult {
            name: name.to_string(),
            status,
            reason_code,
            detail: "d".to_string(),
            raw_error: None,
            fail_reason: None,
        }
    }

    #[test]
    fn a_pass_has_no_reason() {
        assert_eq!(reason_for(&result("deposit", CheckStatus::Pass, None)), None);
        assert_eq!(reason_for(&result("donation_attack", CheckStatus::Pass, None)), None);
    }

    #[test]
    fn a_conformance_fail_is_a_behavior_mismatch() {
        for name in ["total_assets", "deposit", "mint", "withdraw", "redeem", "convert_to_shares", "convert_to_assets"] {
            let r = reason_for(&result(name, CheckStatus::Fail, None)).unwrap();
            assert_eq!(r.code, "behavior_mismatch", "{name}");
        }
    }

    #[test]
    fn a_security_fail_is_a_security_finding() {
        for name in SECURITY_CHECKS {
            let r = reason_for(&result(name, CheckStatus::Fail, None)).unwrap();
            assert_eq!(r.code, "security_finding", "{name}");
        }
    }

    #[test]
    fn a_recorded_interface_missing_wins_on_a_fail() {
        let mut r = result("deposit", CheckStatus::Fail, None);
        r.fail_reason = Some(INTERFACE_MISSING);
        assert_eq!(reason_for(&r).unwrap().code, "interface_missing");
    }

    #[test]
    fn inconclusive_and_not_applicable_copy_reason_code() {
        for (status, code) in [
            (CheckStatus::Inconclusive, "insufficient_token_balance"),
            (CheckStatus::Inconclusive, "network_error"),
            (CheckStatus::Inconclusive, "unclassified_error"),
            (CheckStatus::NotApplicable, "constructor_mismatch"),
            (CheckStatus::NotApplicable, "not_a_standard_vault"),
            (CheckStatus::NotApplicable, "token_interface_mismatch"),
        ] {
            let r = reason_for(&result("deposit", status, Some(code))).unwrap();
            assert_eq!(r.code, code);
            assert_eq!(r.message, reason_message(code));
        }
    }

    #[test]
    fn every_code_has_its_own_message_without_raw_text() {
        let codes = [
            "behavior_mismatch", "security_finding", "interface_missing",
            "insufficient_token_balance", "network_error", "unclassified_error",
            "constructor_mismatch", "not_a_standard_vault", "token_interface_mismatch",
        ];
        let messages: Vec<&str> = codes.iter().map(|c| reason_message(c)).collect();
        for (code, m) in codes.iter().zip(&messages) {
            assert_ne!(*m, "See detail.", "{code} has no message of its own");
            assert!(!m.contains("Raw error") && !m.contains("alice"), "{code}");
        }
        let mut unique = messages.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), codes.len(), "messages must differ per code");
    }

    #[test]
    fn the_security_finding_message_is_about_the_scenario_and_gives_no_verdict() {
        let m = reason_message(SECURITY_FINDING);
        assert!(m.contains("temporary copy") && m.contains("that scenario only"));
        assert!(!m.to_lowercase().contains("vulnerable"));
    }

    #[test]
    fn the_unclassified_message_says_raw_error_can_be_absent() {
        let m = reason_message("unclassified_error");
        assert!(m.contains("See detail") && m.contains("absent when it printed none"));
    }

    #[test]
    fn the_token_interface_message_names_the_role_of_the_second_argument() {
        let m = reason_message("token_interface_mismatch");
        assert!(m.contains("second argument of each named spender"));
    }

    #[test]
    fn no_message_uses_a_word_the_project_does_not_use() {
        for code in [
            "behavior_mismatch", "security_finding", "interface_missing", "insufficient_token_balance",
            "network_error", "unclassified_error", "constructor_mismatch", "not_a_standard_vault",
            "token_interface_mismatch",
        ] {
            let m = reason_message(code).to_lowercase();
            for word in ["audit", "certif", "guarantee", "full conformance", "100% sa", "sertifikasi", "menjamin"] {
                assert!(!m.contains(word), "{code}: {word}");
            }
        }
    }

    #[test]
    fn conformance_runs_on_the_target_and_security_on_a_temporary_copy() {
        assert_eq!(runs_on("deposit"), "target");
        assert_eq!(runs_on("convert_to_assets"), "target");
        assert_eq!(runs_on("donation_attack"), "temporary_copy");
        assert_eq!(runs_on("access_control_probing"), "temporary_copy");
    }

    #[test]
    fn the_labels_are_the_documented_values() {
        assert_eq!(MODE, "testnet");
        assert_eq!(SPEC_REFERENCE, "SEP-0056 v0.1.2 (Draft)");
    }
}
