//! Start-of-run interface probe.
//!
//! Before any check runs, the contract's interface is read from its spec with
//! `stellar contract info interface --output json`. That is a ledger read: no
//! source account, no simulation, no transaction, and no contract function is
//! invoked. The functions the 7 conformance checks call are then compared with
//! what the contract declares, by name, argument names (the checker calls by
//! argument name, e.g. `--assets`), argument types and return type.
//!
//! A contract that lacks any of them, or declares one differently, stops the
//! run in preflight with `code: "unsupported_interface"` (exit code 2), so a
//! contract that is not a SEP-56 vault is never reported as a list of FAILs.
//!
//! When the spec cannot be read at all, nothing is decided here: the run goes
//! ahead exactly as before, with a warning.
//!
//! `query_asset`, `decimals` and the constructor, which only the 4 security
//! checks need and which are not part of SEP-56, are deliberately not checked
//! here: a vault without them keeps getting NOT_APPLICABLE on those 4 checks.

use serde::Serialize;
use serde_json::Value;

use crate::rpc::run_stellar;

/// One function the conformance checks call: name, `(argument, type)` in
/// order, and the return type, as `stellar contract info interface --output
/// json` writes them.
type Expected = (&'static str, &'static [(&'static str, &'static str)], &'static str);

/// The SEP-56 functions the 7 conformance checks call, with the argument
/// names they pass.
pub const SEP56_FUNCTIONS: &[Expected] = &[
    ("total_assets", &[], "i128"),
    ("total_supply", &[], "i128"),
    ("convert_to_shares", &[("assets", "i128")], "i128"),
    ("convert_to_assets", &[("shares", "i128")], "i128"),
    ("preview_deposit", &[("assets", "i128")], "i128"),
    ("preview_mint", &[("shares", "i128")], "i128"),
    ("preview_withdraw", &[("assets", "i128")], "i128"),
    ("preview_redeem", &[("shares", "i128")], "i128"),
    ("max_deposit", &[("receiver", "address")], "i128"),
    ("max_mint", &[("receiver", "address")], "i128"),
    ("max_withdraw", &[("owner", "address")], "i128"),
    ("max_redeem", &[("owner", "address")], "i128"),
    (
        "deposit",
        &[("assets", "i128"), ("receiver", "address"), ("from", "address"), ("operator", "address")],
        "i128",
    ),
    (
        "mint",
        &[("shares", "i128"), ("receiver", "address"), ("from", "address"), ("operator", "address")],
        "i128",
    ),
    (
        "withdraw",
        &[("assets", "i128"), ("receiver", "address"), ("owner", "address"), ("operator", "address")],
        "i128",
    ),
    (
        "redeem",
        &[("shares", "i128"), ("receiver", "address"), ("owner", "address"), ("operator", "address")],
        "i128",
    ),
];

/// A function the contract declares, but not the way the checker calls it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Mismatch {
    pub name: String,
    /// The signature the checker calls, e.g. `deposit(assets: i128, …) -> i128`.
    pub expected: String,
    /// The signature the contract declares.
    pub found: String,
}

/// What the probe concluded.
#[derive(Debug, PartialEq, Eq)]
pub enum Assessment {
    /// Every function the conformance checks call is declared as expected.
    Complete,
    /// At least one is missing or declared differently.
    Incomplete { missing: Vec<String>, mismatched: Vec<Mismatch> },
    /// The spec could not be read; nothing is decided from it.
    Unreadable(String),
}

/// A type as the CLI writes it: a plain string for the primitive types
/// (`i128`, `address`, …), JSON for anything composite.
fn type_text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn signature(name: &str, inputs: &[(String, String)], outputs: &[String]) -> String {
    let args: Vec<String> = inputs.iter().map(|(n, t)| format!("{n}: {t}")).collect();
    let mut sig = format!("{name}({})", args.join(", "));
    if !outputs.is_empty() {
        sig.push_str(&format!(" -> {}", outputs.join(", ")));
    }
    sig
}

/// Compares a spec (the stdout of `stellar contract info interface --output
/// json`) with [`SEP56_FUNCTIONS`]. Pure, so it is unit-tested on saved specs.
pub fn assess(spec_json: &str) -> Assessment {
    let entries: Vec<Value> = match serde_json::from_str(spec_json) {
        Ok(Value::Array(entries)) => entries,
        Ok(_) => return Assessment::Unreadable("the contract spec is not a list".to_string()),
        Err(e) => return Assessment::Unreadable(format!("the contract spec is not valid JSON: {e}")),
    };

    struct Declared {
        name: String,
        inputs: Vec<(String, String)>,
        outputs: Vec<String>,
    }
    let mut declared: Vec<Declared> = Vec::new();
    for entry in &entries {
        let Some(f) = entry.get("function_v0") else { continue };
        let Some(name) = f.get("name").and_then(Value::as_str) else { continue };
        let inputs = f
            .get("inputs")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .map(|i| {
                        let n = i.get("name").and_then(Value::as_str).unwrap_or("").to_string();
                        let t = i.get("type").map(type_text).unwrap_or_default();
                        (n, t)
                    })
                    .collect()
            })
            .unwrap_or_default();
        let outputs = f
            .get("outputs")
            .and_then(Value::as_array)
            .map(|list| list.iter().map(type_text).collect())
            .unwrap_or_default();
        declared.push(Declared { name: name.to_string(), inputs, outputs });
    }

    if declared.is_empty() {
        return Assessment::Unreadable("the contract spec lists no functions".to_string());
    }

    let mut missing = Vec::new();
    let mut mismatched = Vec::new();
    for (name, args, output) in SEP56_FUNCTIONS {
        let expected_inputs: Vec<(String, String)> =
            args.iter().map(|(n, t)| (n.to_string(), t.to_string())).collect();
        let expected_outputs = vec![output.to_string()];
        match declared.iter().find(|d| d.name == *name) {
            None => missing.push(name.to_string()),
            Some(d) => {
                if d.inputs != expected_inputs || d.outputs != expected_outputs {
                    mismatched.push(Mismatch {
                        name: name.to_string(),
                        expected: signature(name, &expected_inputs, &expected_outputs),
                        found: signature(name, &d.inputs, &d.outputs),
                    });
                }
            }
        }
    }

    if missing.is_empty() && mismatched.is_empty() {
        Assessment::Complete
    } else {
        Assessment::Incomplete { missing, mismatched }
    }
}

/// Longest stretch of a failed probe's error kept in the warning.
const PROBE_ERROR_LIMIT: usize = 300;

/// Reads the target's spec from testnet and assesses it. Read-only.
pub async fn probe(vault: &str) -> Assessment {
    let args: Vec<String> = [
        "contract", "info", "interface", "--contract-id", vault, "--network", "testnet", "--output",
        "json", "--quiet",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    match run_stellar(&args).await {
        Ok(stdout) => assess(&stdout),
        Err(e) => {
            let text = e.to_string();
            let cut: String = text.chars().take(PROBE_ERROR_LIMIT).collect();
            Assessment::Unreadable(format!("`stellar contract info interface` failed: {cut}"))
        }
    }
}

/// The `problem` sentence of an `unsupported_interface` preflight error. The
/// web UI shows `problem` and `fix` as they are, so the lists live here.
pub fn unsupported_problem(vault: &str, missing: &[String], mismatched: &[Mismatch]) -> String {
    let mut parts = Vec::new();
    if !missing.is_empty() {
        parts.push(format!(
            "Missing ({} of the {} functions the checks call): {}.",
            missing.len(),
            SEP56_FUNCTIONS.len(),
            missing.join(", ")
        ));
    }
    if !mismatched.is_empty() {
        let list: Vec<String> = mismatched
            .iter()
            .map(|m| format!("{} (expected {}, found {})", m.name, m.expected, m.found))
            .collect();
        parts.push(format!("Declared with different arguments or types: {}.", list.join("; ")));
    }
    format!(
        "{vault} does not have the SEP-56 vault interface this tool checks. {} No check was run \
         and no contract function was invoked.",
        parts.join(" ")
    )
}

/// The `fix` text of an `unsupported_interface` preflight error.
pub fn unsupported_fix() -> String {
    "This tool checks SEP-56 tokenized vaults. If this contract is meant to be one, declare these \
     functions with the argument names and types SEP-56 uses (listed in VAULT_CHECKS.md), deploy \
     it, and run again."
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const REFERENCE: &str = include_str!("../testdata/interface/reference.json");
    const CELENGAN: &str = include_str!("../testdata/interface/celengan.json");
    const STELLARBIN: &str = include_str!("../testdata/interface/stellarbin.json");

    /// A spec declaring exactly [`SEP56_FUNCTIONS`], with `edit` applied to
    /// the function list first.
    fn spec_with(edit: impl FnOnce(&mut Vec<Value>)) -> String {
        let mut functions: Vec<Value> = SEP56_FUNCTIONS
            .iter()
            .map(|(name, args, output)| {
                let inputs: Vec<Value> = args
                    .iter()
                    .map(|(n, t)| serde_json::json!({"doc": "", "name": n, "type": t}))
                    .collect();
                serde_json::json!({"function_v0": {"doc": "", "name": name, "inputs": inputs, "outputs": [output]}})
            })
            .collect();
        edit(&mut functions);
        Value::Array(functions).to_string()
    }

    #[test]
    fn the_reference_vault_spec_is_complete() {
        assert_eq!(assess(REFERENCE), Assessment::Complete);
    }

    #[test]
    fn a_spec_with_exactly_the_expected_functions_is_complete() {
        assert_eq!(assess(&spec_with(|_| {})), Assessment::Complete);
    }

    #[test]
    fn extra_functions_and_other_entries_do_not_matter() {
        let spec = spec_with(|f| {
            f.push(serde_json::json!({"function_v0": {"name": "name", "inputs": [], "outputs": ["string"]}}));
            f.push(serde_json::json!({"event_v0": {"name": "Deposit"}}));
        });
        assert_eq!(assess(&spec), Assessment::Complete);
    }

    #[test]
    fn celengan_misses_every_function() {
        match assess(CELENGAN) {
            Assessment::Incomplete { missing, mismatched } => {
                let all: Vec<String> = SEP56_FUNCTIONS.iter().map(|(n, _, _)| n.to_string()).collect();
                assert_eq!(missing, all);
                assert!(mismatched.is_empty());
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn stellarbin_misses_some_and_declares_deposit_and_withdraw_differently() {
        match assess(STELLARBIN) {
            Assessment::Incomplete { missing, mismatched } => {
                assert_eq!(
                    missing,
                    [
                        "total_supply", "convert_to_shares", "convert_to_assets", "preview_deposit",
                        "preview_mint", "preview_withdraw", "preview_redeem", "max_deposit",
                        "max_mint", "max_withdraw", "max_redeem", "mint", "redeem",
                    ]
                );
                let names: Vec<&str> = mismatched.iter().map(|m| m.name.as_str()).collect();
                assert_eq!(names, ["deposit", "withdraw"]);
                assert_eq!(mismatched[0].found, "deposit(depositor: address, amount: i128) -> i128");
                assert_eq!(
                    mismatched[0].expected,
                    "deposit(assets: i128, receiver: address, from: address, operator: address) -> i128"
                );
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn one_missing_function_is_reported() {
        let spec = spec_with(|f| f.retain(|e| e["function_v0"]["name"] != "max_redeem"));
        assert_eq!(
            assess(&spec),
            Assessment::Incomplete { missing: vec!["max_redeem".to_string()], mismatched: vec![] }
        );
    }

    #[test]
    fn an_argument_with_a_different_name_is_a_mismatch() {
        let spec = spec_with(|f| {
            let deposit = f.iter_mut().find(|e| e["function_v0"]["name"] == "deposit").unwrap();
            deposit["function_v0"]["inputs"][1]["name"] = serde_json::json!("to");
        });
        match assess(&spec) {
            Assessment::Incomplete { missing, mismatched } => {
                assert!(missing.is_empty());
                assert_eq!(mismatched.len(), 1);
                assert_eq!(mismatched[0].name, "deposit");
                assert_eq!(
                    mismatched[0].found,
                    "deposit(assets: i128, to: address, from: address, operator: address) -> i128"
                );
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_different_argument_type_or_return_type_is_a_mismatch() {
        let arg = spec_with(|f| {
            let e = f.iter_mut().find(|e| e["function_v0"]["name"] == "preview_mint").unwrap();
            e["function_v0"]["inputs"][0]["type"] = serde_json::json!("u64");
        });
        let ret = spec_with(|f| {
            let e = f.iter_mut().find(|e| e["function_v0"]["name"] == "total_assets").unwrap();
            e["function_v0"]["outputs"] = serde_json::json!(["u64"]);
        });
        for (spec, name) in [(arg, "preview_mint"), (ret, "total_assets")] {
            match assess(&spec) {
                Assessment::Incomplete { missing, mismatched } => {
                    assert!(missing.is_empty());
                    assert_eq!(mismatched.iter().map(|m| m.name.as_str()).collect::<Vec<_>>(), [name]);
                }
                other => panic!("{other:?}"),
            }
        }
    }

    #[test]
    fn a_spec_that_cannot_be_read_decides_nothing() {
        assert!(matches!(assess("not json"), Assessment::Unreadable(_)));
        assert!(matches!(assess("{}"), Assessment::Unreadable(_)));
        assert!(matches!(assess("[]"), Assessment::Unreadable(_)));
        assert!(matches!(assess(r#"[{"event_v0": {}}]"#), Assessment::Unreadable(_)));
    }

    #[test]
    fn the_problem_text_lists_what_is_missing_and_what_differs() {
        let mismatched = vec![Mismatch {
            name: "deposit".to_string(),
            expected: "deposit(assets: i128) -> i128".to_string(),
            found: "deposit(amount: i128) -> i128".to_string(),
        }];
        let text = unsupported_problem("CVAULT", &["mint".to_string(), "redeem".to_string()], &mismatched);
        assert!(text.starts_with("CVAULT does not have the SEP-56 vault interface"));
        assert!(text.contains("Missing (2 of the 16 functions the checks call): mint, redeem."));
        assert!(text.contains(
            "deposit (expected deposit(assets: i128) -> i128, found deposit(amount: i128) -> i128)"
        ));
        assert!(text.ends_with("No check was run and no contract function was invoked."));
        // only the parts that apply
        let only_missing = unsupported_problem("CVAULT", &["mint".to_string()], &[]);
        assert!(!only_missing.contains("different arguments"));
    }
}
