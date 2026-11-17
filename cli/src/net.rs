//! The read-only gate for Mainnet (SOW 2, D1; design in
//! `docs/sow2/design-mainnet-readonly.md`, section 2).
//!
//! Every `stellar` subprocess goes through `rpc::run_stellar`, which calls
//! [`mainnet_policy`] first. A list of arguments is **Testnet-class** when it
//! names exactly one network, `--network testnet`, and no RPC URL. Those lists
//! are the ones the tool builds today, and the gate lets them through
//! untouched. Every other list is checked against an allow-list, and anything
//! not on it is refused before a process is started.
//!
//! No flag in the CLI selects Mainnet yet. This module is the rule that code
//! reaching Mainnet will have to pass, and the tests below prove it.

use std::fmt;

/// Why the gate refused an argument list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Refusal {
    /// The command is not on the allow-list (or the list is empty).
    NotAllowed(String),
    /// `contract invoke` without exactly one `--send=no`.
    InvokeNeedsSendNo,
    /// A flag that can sign, build for signing, or change what is sent.
    ForbiddenFlag(String),
    /// The source account is missing, repeated, or not a `G…` public key.
    SourceMustBeAPublicKey,
    /// The network is not named by `--rpc-url` and `--network-passphrase`.
    NetworkNotExplicit,
}

impl fmt::Display for Refusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Refusal::NotAllowed(what) => {
                write!(f, "refused: `{what}` is not on the read-only allow-list for this network")
            }
            Refusal::InvokeNeedsSendNo => {
                write!(f, "refused: a contract invoke on this network must carry exactly one --send=no")
            }
            Refusal::ForbiddenFlag(flag) => {
                write!(f, "refused: the flag `{flag}` is not allowed on this network")
            }
            Refusal::SourceMustBeAPublicKey => write!(
                f,
                "refused: the source account on this network must be given once, as a G… public key \
                 (not an identity name, a secret key or a seed phrase)"
            ),
            Refusal::NetworkNotExplicit => write!(
                f,
                "refused: a contract invoke on this network must name it with --rpc-url and \
                 --network-passphrase, and must not use --network"
            ),
        }
    }
}

/// Environment variables of the Stellar CLI (read from its `--help`, the
/// `[env: …]` entries) that can change the network, the source account, whether
/// a transaction is sent, or how it is signed. Removed from every process that
/// is not Testnet-class, so the flags in the argument list are the only input.
/// `STELLAR_RPC_HEADERS` is not here: it carries an API key for an RPC provider
/// and cannot make anything send.
pub const SCRUBBED_ENV: [&str; 11] = [
    "STELLAR_ACCOUNT",
    "STELLAR_AUTH_MODE",
    "STELLAR_CONTRACT_ID",
    "STELLAR_INVOKE_VIEW",
    "STELLAR_NETWORK",
    "STELLAR_NETWORK_PASSPHRASE",
    "STELLAR_RPC_URL",
    "STELLAR_SEND",
    "STELLAR_SIGN_WITH_KEY",
    "STELLAR_SIGN_WITH_LAB",
    "STELLAR_SIGN_WITH_LEDGER",
];

/// The variables to remove from the process for this argument list: none for a
/// Testnet-class list (so Testnet behaviour is unchanged), all of them
/// otherwise.
pub fn env_to_scrub(args: &[String]) -> impl Iterator<Item = &'static str> {
    let scrub = !is_testnet_class(args);
    SCRUBBED_ENV.iter().copied().filter(move |_| scrub)
}

fn has(args: &[String], token: &str) -> bool {
    args.iter().any(|a| a == token)
}

/// Exactly one `--network testnet`, and no RPC URL, passphrase or other
/// network flag. `--network=testnet` is not recognised on purpose: the tool
/// never writes it, so it is policed.
pub fn is_testnet_class(args: &[String]) -> bool {
    let networks: Vec<usize> =
        args.iter().enumerate().filter(|(_, a)| *a == "--network" || *a == "-n").map(|(i, _)| i).collect();
    if networks.len() != 1 {
        return false;
    }
    let Some(value) = args.get(networks[0] + 1) else { return false };
    if value != "testnet" {
        return false;
    }
    !args.iter().any(|a| {
        a == "--rpc-url"
            || a == "--network-passphrase"
            || a.starts_with("--rpc-url=")
            || a.starts_with("--network-passphrase=")
            || a.starts_with("--network=")
    })
}

/// The values given for any of `names`, as `--name value` or `--name=value`.
fn values_of<'a>(head: &'a [String], names: &[&str]) -> Vec<&'a str> {
    let mut found = Vec::new();
    for (i, token) in head.iter().enumerate() {
        for name in names {
            if token == name {
                if let Some(next) = head.get(i + 1) {
                    found.push(next.as_str());
                } else {
                    found.push("");
                }
            } else if let Some(rest) = token.strip_prefix(&format!("{name}=")) {
                found.push(rest);
            }
        }
    }
    found
}

/// Applies the rule to one argument list. `Ok` for a Testnet-class list and for
/// the read-only forms below; `Err` for everything else.
///
/// Allowed when the list is not Testnet-class:
/// - `--version`;
/// - `contract info hash …`, `contract info interface …`, `contract fetch …`,
///   `contract id asset …`, `network info …`, `network health …`;
/// - `keys address <name>` (local, prints a public address);
/// - `contract invoke …` with exactly one `--send=no`, one `G…` public key as
///   the source, `--rpc-url` and `--network-passphrase`, no `--network`, and none
///   of `--build-only`, `--view`, `--sign-with…`, or another `--send…`.
///
/// Only the options before the first `--` are read; what follows it belongs to
/// the contract function.
pub fn mainnet_policy(args: &[String]) -> Result<(), Refusal> {
    if is_testnet_class(args) {
        return Ok(());
    }
    let word = |i: usize| args.get(i).map(String::as_str).unwrap_or("");
    let describe = || args.iter().take(3).cloned().collect::<Vec<_>>().join(" ");

    match (word(0), word(1), word(2)) {
        ("--version", _, _) if args.len() == 1 => Ok(()),
        ("contract", "info", "hash" | "interface") => Ok(()),
        ("contract", "fetch", _) => Ok(()),
        ("contract", "id", "asset") => Ok(()),
        ("network", "info" | "health", _) => Ok(()),
        ("keys", "address", name) if args.len() == 3 && !name.starts_with('-') => Ok(()),
        ("contract", "invoke", _) => invoke_policy(args),
        _ => Err(Refusal::NotAllowed(describe())),
    }
}

fn invoke_policy(args: &[String]) -> Result<(), Refusal> {
    // Options are before the first `--`; the function and its arguments follow.
    let split = args.iter().position(|a| a == "--").unwrap_or(args.len());
    let head = &args[..split];

    for token in head {
        let bare = token.split('=').next().unwrap_or(token);
        if bare == "--build-only" || bare == "--view" || bare.starts_with("--sign-with") {
            return Err(Refusal::ForbiddenFlag(bare.to_string()));
        }
        if bare == "--send" && token != "--send=no" {
            return Err(Refusal::ForbiddenFlag(token.clone()));
        }
    }
    if head.iter().filter(|t| *t == "--send=no").count() != 1 {
        return Err(Refusal::InvokeNeedsSendNo);
    }

    let sources = values_of(head, &["--source-account", "--source", "-s"]);
    if sources.len() != 1 || !is_public_key(sources[0]) {
        return Err(Refusal::SourceMustBeAPublicKey);
    }

    let named = |name: &str| !values_of(head, &[name]).is_empty();
    let no_network_flag = !has(head, "--network") && !has(head, "-n") && !head.iter().any(|t| t.starts_with("--network="));
    if !(named("--rpc-url") && named("--network-passphrase") && no_network_flag) {
        return Err(Refusal::NetworkNotExplicit);
    }
    Ok(())
}

/// A Stellar `G…` public key: 56 base32 characters that decode to the account
/// version byte, 32 key bytes and a matching CRC16 checksum. An identity name,
/// a secret key (`S…`), a muxed account (`M…`), a seed phrase and a malformed
/// string are all `false`.
pub fn is_public_key(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() != 56 || bytes[0] != b'G' {
        return false;
    }
    let mut out = Vec::with_capacity(35);
    let (mut bits, mut count) = (0u32, 0u32);
    for &c in bytes {
        let value = match c {
            b'A'..=b'Z' => c - b'A',
            b'2'..=b'7' => c - b'2' + 26,
            _ => return false,
        };
        bits = (bits << 5) | u32::from(value);
        count += 5;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    if out.len() != 35 || out[0] != 6 << 3 {
        return false;
    }
    let crc = crc16_xmodem(&out[..33]);
    out[33] == (crc & 0xff) as u8 && out[34] == (crc >> 8) as u8
}

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &byte in data {
        crc ^= u16::from(byte) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    crc
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::checks;
    use crate::interface::{TokenArgNames, TokenArgs};
    use crate::rpc::{testing, RpcError};
    use std::collections::HashMap;

    const MAINNET_PASSPHRASE: &str = "Public Global Stellar Network ; September 2015";
    const RPC: &str = "https://rpc.example.invalid";

    // ---- strkey helpers (public keys are built here, never typed in) --------

    fn base32(data: &[u8]) -> String {
        const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let (mut out, mut bits, mut count) = (String::new(), 0u32, 0u32);
        for &byte in data {
            bits = (bits << 8) | u32::from(byte);
            count += 8;
            while count >= 5 {
                count -= 5;
                out.push(ALPHABET[((bits >> count) & 31) as usize] as char);
            }
        }
        if count > 0 {
            out.push(ALPHABET[((bits << (5 - count)) & 31) as usize] as char);
        }
        out
    }

    /// A strkey with the given version byte over 32 key bytes.
    fn strkey(version: u8, key: [u8; 32]) -> String {
        let mut payload = vec![version];
        payload.extend_from_slice(&key);
        let crc = crc16_xmodem(&payload);
        payload.push((crc & 0xff) as u8);
        payload.push((crc >> 8) as u8);
        base32(&payload)
    }

    fn public_key(seed: u8) -> String {
        strkey(6 << 3, [seed; 32])
    }

    fn v(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|s| s.to_string()).collect()
    }

    /// A Mainnet-class invoke that satisfies every rule.
    fn good_invoke() -> Vec<String> {
        let source = public_key(1);
        v(&[
            "contract", "invoke", "--id", "CVAULT", "--source-account", &source, "--rpc-url", RPC,
            "--network-passphrase", MAINNET_PASSPHRASE, "--send=no", "--", "total_assets",
        ])
    }

    fn with(mut args: Vec<String>, extra: &[&str], at: usize) -> Vec<String> {
        for (i, e) in extra.iter().enumerate() {
            args.insert(at + i, e.to_string());
        }
        args
    }

    fn refused(args: &[String]) -> Refusal {
        mainnet_policy(args).expect_err(&format!("should be refused: {args:?}"))
    }

    // ---- the public key check ----------------------------------------------

    #[test]
    fn a_public_key_is_recognised_and_nothing_else_is() {
        assert!(is_public_key(&public_key(1)));
        assert!(is_public_key(&public_key(200)));
        // secret key and muxed-account version bytes, identity names, phrases
        assert!(!is_public_key(&strkey(18 << 3, [1; 32])), "an S… secret key");
        assert!(!is_public_key("alice"));
        assert!(!is_public_key("kite urban dust oven sleep able hollow near light ship rack bar"));
        assert!(!is_public_key(""));
        // a wrong checksum
        let mut bad = public_key(1).into_bytes();
        let last = bad.len() - 1;
        bad[last] = if bad[last] == b'A' { b'B' } else { b'A' };
        assert!(!is_public_key(&String::from_utf8(bad).unwrap()));
        // a lower-case or padded string
        assert!(!is_public_key(&public_key(1).to_lowercase()));
        assert!(!is_public_key(&format!("{}A", public_key(1))));
    }

    // ---- Testnet-class lists pass untouched ---------------------------------

    #[test]
    fn the_lists_the_tool_builds_for_testnet_are_testnet_class_and_pass() {
        let invoke = v(&["contract", "invoke", "--id", "C", "--source-account", "alice", "--network", "testnet", "--quiet", "--", "deposit", "--assets", "5"]);
        let deploy = v(&["contract", "deploy", "--wasm-hash", "H", "--source-account", "dave", "--network", "testnet", "--quiet", "--", "--name", "N"]);
        let hash = v(&["contract", "info", "hash", "--contract-id", "C", "--network", "testnet"]);
        for args in [&invoke, &deploy, &hash] {
            assert!(is_testnet_class(args));
            assert_eq!(mainnet_policy(args), Ok(()), "{args:?}");
        }
    }

    #[test]
    fn a_list_that_adds_an_rpc_url_or_another_network_is_not_testnet_class() {
        let base = ["contract", "deploy", "--wasm-hash", "H", "--source-account", "dave"];
        for tail in [
            &["--network", "testnet", "--rpc-url", RPC][..],
            &["--network", "testnet", "--network-passphrase", MAINNET_PASSPHRASE][..],
            &["--network", "mainnet"][..],
            &["--network", "testnet", "--network", "mainnet"][..],
            &["--network=testnet"][..],
            &[][..],
        ] {
            let mut args = v(&base);
            args.extend(v(tail));
            assert!(!is_testnet_class(&args), "{args:?}");
            assert!(matches!(refused(&args), Refusal::NotAllowed(_)), "{args:?}");
        }
    }

    // ---- allowed forms (one test per form) ----------------------------------

    #[test]
    fn allowed_version() {
        assert_eq!(mainnet_policy(&v(&["--version"])), Ok(()));
        assert!(mainnet_policy(&v(&["--version", "--help"])).is_err());
    }

    #[test]
    fn allowed_contract_info_hash() {
        assert_eq!(mainnet_policy(&v(&["contract", "info", "hash", "--contract-id", "C", "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE])), Ok(()));
    }

    #[test]
    fn allowed_contract_info_interface() {
        assert_eq!(mainnet_policy(&v(&["contract", "info", "interface", "--contract-id", "C", "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE, "--output", "json"])), Ok(()));
    }

    #[test]
    fn allowed_contract_fetch() {
        assert_eq!(mainnet_policy(&v(&["contract", "fetch", "--id", "C", "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE, "--out-file", "f.wasm"])), Ok(()));
    }

    #[test]
    fn allowed_contract_id_asset() {
        assert_eq!(mainnet_policy(&v(&["contract", "id", "asset", "--asset", "native", "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE])), Ok(()));
    }

    #[test]
    fn allowed_network_info_and_health() {
        for sub in ["info", "health"] {
            assert_eq!(mainnet_policy(&v(&["network", sub, "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE])), Ok(()), "{sub}");
        }
    }

    #[test]
    fn allowed_keys_address_by_name() {
        assert_eq!(mainnet_policy(&v(&["keys", "address", "alice"])), Ok(()));
    }

    #[test]
    fn allowed_invoke_with_send_no_a_public_key_and_an_explicit_network() {
        assert_eq!(mainnet_policy(&good_invoke()), Ok(()));
    }

    #[test]
    fn allowed_invoke_source_spelled_every_way() {
        let g = public_key(2);
        for source in [v(&["--source-account", &g]), v(&["--source", &g]), v(&["-s", &g]), v(&[&format!("--source-account={g}")]), v(&[&format!("--source={g}")])] {
            let mut args = v(&["contract", "invoke", "--id", "C"]);
            args.extend(source);
            args.extend(v(&["--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE, "--send=no", "--quiet", "--", "decimals"]));
            assert_eq!(mainnet_policy(&args), Ok(()), "{args:?}");
        }
    }

    #[test]
    fn allowed_invoke_where_the_function_arguments_hold_policed_words() {
        // After `--` the words belong to the function, not to the CLI.
        let mut args = good_invoke();
        args.extend(v(&["--note", "--send=yes", "--sign-with-key", "alice", "--build-only"]));
        assert_eq!(mainnet_policy(&args), Ok(()));
    }

    // ---- refused forms (one test per form) ----------------------------------

    #[test]
    fn refused_contract_deploy() {
        let args = v(&["contract", "deploy", "--wasm-hash", "H", "--source-account", "G", "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE]);
        assert!(matches!(refused(&args), Refusal::NotAllowed(_)));
    }

    #[test]
    fn refused_contract_upload_install_and_ttl_changes() {
        for sub in ["upload", "install", "bump", "extend", "restore", "init", "build"] {
            let args = v(&["contract", sub, "--source-account", "G", "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE]);
            assert!(matches!(refused(&args), Refusal::NotAllowed(_)), "{sub}");
        }
    }

    #[test]
    fn refused_tx_commands() {
        for sub in ["send", "sign", "new", "simulate", "update"] {
            let args = v(&["tx", sub, "--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE]);
            assert!(matches!(refused(&args), Refusal::NotAllowed(_)), "{sub}");
        }
    }

    #[test]
    fn refused_keys_commands_other_than_address() {
        for args in [
            v(&["keys", "generate", "bob", "--fund"]),
            v(&["keys", "fund", "bob"]),
            v(&["keys", "add", "bob"]),
            v(&["keys", "rm", "bob"]),
            v(&["keys", "show", "alice"]),
            v(&["keys", "secret", "alice"]),
            v(&["keys", "address"]),
            v(&["keys", "address", "alice", "--extra"]),
        ] {
            assert!(matches!(refused(&args), Refusal::NotAllowed(_)), "{args:?}");
        }
    }

    #[test]
    fn refused_invoke_without_send_no() {
        let args: Vec<String> = good_invoke().into_iter().filter(|a| a != "--send=no").collect();
        assert_eq!(refused(&args), Refusal::InvokeNeedsSendNo);
    }

    #[test]
    fn refused_invoke_with_another_send_value() {
        for send in ["--send=yes", "--send=default", "--send"] {
            let args = with(good_invoke(), &[send], 2);
            assert!(matches!(refused(&args), Refusal::ForbiddenFlag(_)), "{send}");
        }
        // the split form is not written by the tool and is refused too
        let args: Vec<String> = good_invoke().into_iter().map(|a| if a == "--send=no" { "--send".to_string() } else { a }).collect();
        assert!(matches!(refused(&args), Refusal::ForbiddenFlag(_)));
    }

    #[test]
    fn refused_invoke_with_send_no_twice() {
        assert_eq!(refused(&with(good_invoke(), &["--send=no"], 2)), Refusal::InvokeNeedsSendNo);
    }

    #[test]
    fn refused_invoke_from_an_identity_name() {
        let mut args = good_invoke();
        let i = args.iter().position(|a| a == "--source-account").unwrap();
        args[i + 1] = "alice".to_string();
        assert_eq!(refused(&args), Refusal::SourceMustBeAPublicKey);
    }

    #[test]
    fn refused_invoke_from_a_secret_key() {
        let mut args = good_invoke();
        let i = args.iter().position(|a| a == "--source-account").unwrap();
        args[i + 1] = strkey(18 << 3, [3; 32]); // built here, never typed in
        assert_eq!(refused(&args), Refusal::SourceMustBeAPublicKey);
    }

    #[test]
    fn refused_invoke_from_a_seed_phrase_a_muxed_account_or_a_bad_key() {
        for bad in [
            "kite urban dust oven sleep able hollow near light ship rack bar".to_string(),
            strkey(12 << 3, [4; 32]),
            public_key(1)[..55].to_string(),
        ] {
            let mut args = good_invoke();
            let i = args.iter().position(|a| a == "--source-account").unwrap();
            args[i + 1] = bad.clone();
            assert_eq!(refused(&args), Refusal::SourceMustBeAPublicKey, "{bad}");
        }
    }

    #[test]
    fn refused_invoke_with_no_source_or_two() {
        let no_source: Vec<String> = {
            let mut a = good_invoke();
            let i = a.iter().position(|x| x == "--source-account").unwrap();
            a.drain(i..=i + 1);
            a
        };
        assert_eq!(refused(&no_source), Refusal::SourceMustBeAPublicKey);
        let two = with(good_invoke(), &["--source", &public_key(5)], 2);
        assert_eq!(refused(&two), Refusal::SourceMustBeAPublicKey);
    }

    #[test]
    fn refused_invoke_with_a_signing_or_build_flag() {
        for flag in [&["--sign-with-key", "alice"][..], &["--sign-with-key=alice"][..], &["--sign-with-lab"][..], &["--sign-with-ledger"][..], &["--build-only"][..], &["--view"][..]] {
            let args = with(good_invoke(), flag, 2);
            assert!(matches!(refused(&args), Refusal::ForbiddenFlag(_)), "{flag:?}");
        }
    }

    #[test]
    fn refused_invoke_whose_network_is_not_explicit() {
        let without = |name: &str| -> Vec<String> {
            let mut a = good_invoke();
            let i = a.iter().position(|x| x == name).unwrap();
            a.drain(i..=i + 1);
            a
        };
        assert_eq!(refused(&without("--rpc-url")), Refusal::NetworkNotExplicit);
        assert_eq!(refused(&without("--network-passphrase")), Refusal::NetworkNotExplicit);
        assert_eq!(refused(&with(good_invoke(), &["--network", "mainnet"], 2)), Refusal::NetworkNotExplicit);
        assert_eq!(refused(&with(good_invoke(), &["--network=mainnet"], 2)), Refusal::NetworkNotExplicit);
        // `--network testnet` beside an RPC URL is not Testnet-class and has no explicit network of its own
        assert_eq!(refused(&with(good_invoke(), &["--network", "testnet"], 2)), Refusal::NetworkNotExplicit);
    }

    #[test]
    fn refused_invoke_in_the_equals_form_of_the_testnet_network() {
        let args = v(&["contract", "invoke", "--id", "C", "--source-account", "alice", "--network=testnet", "--", "deposit"]);
        assert!(!is_testnet_class(&args));
        assert_eq!(refused(&args), Refusal::InvokeNeedsSendNo);
    }

    #[test]
    fn refused_anything_else() {
        for args in [v(&[]), v(&["contract"]), v(&["contract", "invoke"]), v(&["wat"]), v(&["--help"]), v(&["config"]), v(&["snapshot", "create"]), v(&["plugin", "ls"]), v(&["events", "--rpc-url", RPC])] {
            assert!(mainnet_policy(&args).is_err(), "{args:?}");
        }
    }

    // ---- the environment ----------------------------------------------------

    #[test]
    fn the_environment_is_scrubbed_for_policed_lists_and_left_alone_for_testnet() {
        let testnet = v(&["contract", "invoke", "--id", "C", "--source-account", "alice", "--network", "testnet", "--", "x"]);
        assert_eq!(env_to_scrub(&testnet).count(), 0, "Testnet behaviour must not change");

        let scrubbed: Vec<&str> = env_to_scrub(&good_invoke()).collect();
        for var in [
            "STELLAR_SEND", "STELLAR_INVOKE_VIEW", "STELLAR_ACCOUNT", "STELLAR_NETWORK", "STELLAR_NETWORK_PASSPHRASE",
            "STELLAR_RPC_URL", "STELLAR_SIGN_WITH_KEY", "STELLAR_SIGN_WITH_LAB", "STELLAR_SIGN_WITH_LEDGER",
        ] {
            assert!(scrubbed.contains(&var), "{var}");
        }
        assert!(!scrubbed.contains(&"STELLAR_RPC_HEADERS"), "an RPC key is not a send risk");
    }

    // ---- the gate is in run_stellar, and run_stellar is the only spawn ------

    fn source_files() -> Vec<(String, String)> {
        fn walk(dir: &std::path::Path, out: &mut Vec<(String, String)>) {
            for entry in std::fs::read_dir(dir).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    walk(&path, out);
                } else if path.extension().is_some_and(|e| e == "rs") {
                    out.push((path.display().to_string(), std::fs::read_to_string(&path).unwrap()));
                }
            }
        }
        let mut out = Vec::new();
        walk(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src"), &mut out);
        out
    }

    /// Fails when a process is started anywhere but in `rpc::run_stellar`.
    #[test]
    fn no_process_is_started_outside_run_stellar() {
        // Built from pieces so this test does not count itself.
        let spawn = concat!("Command", "::new(");
        let other_spawns = [concat!("process::Command", "::new"), concat!("std::process::", "Command"), concat!("tokio::process::", "Command")];
        let mut found = Vec::new();
        for (path, text) in source_files() {
            for (line_no, line) in text.lines().enumerate() {
                let code = line.trim_start();
                if code.starts_with("//") {
                    continue;
                }
                if code.contains(spawn) {
                    found.push((path.clone(), line_no + 1, text.clone()));
                }
                if other_spawns.iter().any(|p| code.contains(p)) && !path.ends_with("rpc.rs") && !path.ends_with("net.rs") {
                    panic!("{path}:{}: another way to start a process: {code}", line_no + 1);
                }
            }
        }
        assert_eq!(found.len(), 1, "exactly one place may start a process, found {}: {:?}", found.len(), found.iter().map(|(p, l, _)| (p, l)).collect::<Vec<_>>());
        let (path, _, text) = &found[0];
        assert!(path.ends_with("rpc.rs"), "the spawn must be in rpc.rs, it is in {path}");
        let text = text.replace("\r\n", "\n");
        let tail = &text[text.find("async fn run_stellar").expect("rpc.rs must define run_stellar")..];
        let function = &tail[..tail.find("\n}\n").expect("the end of run_stellar")];
        assert!(function.contains(spawn), "the spawn must be inside run_stellar");
        let gate = function.find("mainnet_policy(args)").expect("run_stellar must call the gate");
        assert!(gate < function.find(spawn).unwrap(), "the gate must run before the process is started");
        assert!(function.contains("env_to_scrub(args)"), "run_stellar must scrub the environment");
    }

    /// Horizon is the one other network the tool reaches by itself; every URL
    /// in the code must be the Testnet one.
    #[test]
    fn every_horizon_url_in_the_code_is_testnet() {
        let needle = concat!("https://", "horizon");
        for (path, text) in source_files() {
            for line in text.lines() {
                if line.trim_start().starts_with("//") {
                    continue;
                }
                if let Some(at) = line.find(needle) {
                    assert!(line[at..].starts_with("https://horizon-testnet.stellar.org"), "{path}: {line}");
                }
            }
        }
    }

    // ---- the recording runner ------------------------------------------------

    /// A small vault world, enough for the 11 checks to run to their end:
    /// 1:1 at first, floor and ceiling rounding as SEP-56 asks, an allowance
    /// for operators, a rejected `i128::MAX` deposit, and copies from `deploy`.
    struct World {
        vaults: HashMap<String, (i128, i128, i128)>, // assets, supply, allowance
        copies: u32,
    }

    const TARGET: &str = "CTARGET";
    const ASSET: &str = "CASSET";

    fn arg<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
        args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).map(String::as_str)
    }

    fn contract_error(code: u32) -> RpcError {
        RpcError::CommandFailed { exit_code: Some(1), stderr: format!("error: Error(Contract, #{code})") }
    }

    fn num(n: i128) -> Result<String, RpcError> {
        Ok(format!("\"{n}\""))
    }

    fn world_reply(world: &mut World, args: &[String]) -> Result<String, RpcError> {
        if args == ["--version"] {
            return Ok("stellar 28.0.0 (fake)".to_string());
        }
        if args.first().map(String::as_str) == Some("keys") {
            return Ok(public_key(9));
        }
        if args.len() > 2 && args[0] == "contract" && args[1] == "info" {
            return Ok("ab".repeat(32));
        }
        if args.len() > 2 && args[0] == "contract" && args[1] == "deploy" {
            world.copies += 1;
            let id = format!("CCOPY{}", world.copies);
            world.vaults.insert(id.clone(), (0, 0, 0));
            return Ok(id);
        }
        assert!(args[0] == "contract" && args[1] == "invoke", "unexpected command: {args:?}");
        let id = arg(args, "--id").unwrap().to_string();
        let split = args.iter().position(|a| a == "--").unwrap();
        let function = args[split + 1].as_str();
        let f = &args[split + 2..];
        let amount = |name: &str| arg(f, name).and_then(|x| x.parse::<i128>().ok()).unwrap_or(0);

        if id == ASSET {
            return match function {
                "decimals" => Ok("7".to_string()),
                "transfer" => {
                    if let Some(vault) = world.vaults.get_mut(arg(f, "--to").unwrap_or("")) {
                        vault.0 += amount("--amount");
                    }
                    Ok(String::new())
                }
                _ => Err(contract_error(1)),
            };
        }
        let vault = world.vaults.get_mut(&id).expect("an unknown vault id");
        let (assets, supply) = (vault.0, vault.1);
        let floor = |a: i128, num: i128, den: i128| if den == 0 { a } else { a.checked_mul(num).map_or(i128::MAX, |p| p / den) };
        let ceil = |a: i128, num: i128, den: i128| if den == 0 { a } else { a.checked_mul(num).map_or(i128::MAX, |p| (p + den - 1) / den) };
        match function {
            "query_asset" => Ok(format!("\"{ASSET}\"")),
            "decimals" => Ok("7".to_string()),
            "total_assets" => num(assets),
            "total_supply" => num(supply),
            "max_deposit" | "max_mint" | "max_withdraw" | "max_redeem" => num(i128::MAX),
            "preview_deposit" | "convert_to_shares" => num(if assets == 0 { amount("--assets") } else { floor(amount("--assets"), supply, assets) }),
            "preview_mint" => num(if supply == 0 { amount("--shares") } else { ceil(amount("--shares"), assets, supply) }),
            "preview_withdraw" => num(if assets == 0 { amount("--assets") } else { ceil(amount("--assets"), supply, assets) }),
            "preview_redeem" | "convert_to_assets" => num(if supply == 0 { amount("--shares") } else { floor(amount("--shares"), assets, supply) }),
            "deposit" => {
                let a = amount("--assets");
                if a == i128::MAX {
                    return Err(contract_error(1500));
                }
                let s = if assets == 0 || supply == 0 { a } else { floor(a, supply, assets) };
                vault.0 += a;
                vault.1 += s;
                num(s)
            }
            "mint" => {
                let s = amount("--shares");
                let a = if supply == 0 { s } else { ceil(s, assets, supply) };
                vault.0 += a;
                vault.1 += s;
                num(a)
            }
            "withdraw" | "redeem" => {
                let (a, s) = if function == "withdraw" {
                    let a = amount("--assets");
                    (a, if assets == 0 { a } else { ceil(a, supply, assets) })
                } else {
                    let s = amount("--shares");
                    (if supply == 0 { s } else { floor(s, assets, supply) }, s)
                };
                if arg(f, "--operator") != arg(f, "--owner") {
                    if vault.2 < s {
                        return Err(contract_error(101));
                    }
                    vault.2 -= s;
                }
                vault.0 -= a;
                vault.1 -= s;
                num(if function == "withdraw" { s } else { a })
            }
            "approve" => {
                vault.2 = amount("--amount");
                Ok(String::new())
            }
            "allowance" => num(vault.2),
            _ => Err(RpcError::CommandFailed { exit_code: Some(2), stderr: "error: unrecognized subcommand".to_string() }),
        }
    }

    fn token_names() -> TokenArgs {
        Ok(TokenArgNames {
            approve: ["owner", "spender", "amount", "live_until_ledger"].map(str::to_string),
            allowance: ["owner", "spender"].map(str::to_string),
        })
    }

    /// Runs all 11 checks against the fake world and returns every argument
    /// list `run_stellar` was given.
    async fn run_all_checks_recorded() -> Vec<Vec<String>> {
        let mut world = World { vaults: HashMap::new(), copies: 0 };
        world.vaults.insert(TARGET.to_string(), (1_000_000_000, 1_000_000_000, 0));
        testing::install(move |args| world_reply(&mut world, args));

        checks::check_total_assets(TARGET, "alice").await;
        checks::check_deposit(TARGET, "alice").await;
        checks::check_mint(TARGET, "alice").await;
        checks::check_withdraw(TARGET, "alice").await;
        checks::check_redeem(TARGET, "alice").await;
        checks::check_convert_to_shares(TARGET, "alice").await;
        checks::check_convert_to_assets(TARGET, "alice").await;
        checks::check_donation_attack(TARGET, "grace", "bob").await;
        checks::check_overflow_protection(TARGET, "carol").await;
        checks::check_rounding_direction(TARGET, "dave").await;
        checks::check_access_control_probing(TARGET, "erin", "frank", &token_names()).await;
        testing::take_calls()
    }

    fn function_of(args: &[String]) -> Option<&str> {
        let split = args.iter().position(|a| a == "--")?;
        args.get(split + 1).map(String::as_str)
    }

    /// The same list with Testnet swapped for an explicit Mainnet.
    fn mainnet_form(args: &[String]) -> Vec<String> {
        let mut out = Vec::new();
        let mut i = 0;
        while i < args.len() {
            if args[i] == "--network" && args.get(i + 1).map(String::as_str) == Some("testnet") {
                out.extend(v(&["--rpc-url", RPC, "--network-passphrase", MAINNET_PASSPHRASE]));
                i += 2;
            } else {
                out.push(args[i].clone());
                i += 1;
            }
        }
        out
    }

    #[tokio::test]
    async fn the_recording_runner_sees_the_calls_of_all_11_checks() {
        let calls = run_all_checks_recorded().await;
        let functions: std::collections::BTreeSet<&str> = calls.iter().filter_map(|c| function_of(c)).collect();
        // Every write path of every check was reached, so the next test covers them all.
        for f in ["deposit", "mint", "withdraw", "redeem", "transfer", "approve", "allowance", "query_asset", "preview_mint"] {
            assert!(functions.contains(f), "the fake world never reached `{f}`; calls seen: {functions:?}");
        }
        assert!(calls.iter().any(|c| c[1] == "deploy"), "no deploy was recorded");
        assert!(calls.len() > 60, "only {} calls were recorded", calls.len());
    }

    #[tokio::test]
    async fn every_recorded_call_passes_the_gate_on_testnet() {
        for call in run_all_checks_recorded().await {
            assert!(is_testnet_class(&call) || call[0] == "keys" || call == ["--version"], "{call:?}");
            assert_eq!(mainnet_policy(&call), Ok(()), "{call:?}");
        }
    }

    /// The proof for D2: none of the 11 checks, as written, can send or deploy
    /// on Mainnet. Take every call they make, point it at Mainnet, and the gate
    /// must refuse each `invoke` and `deploy` (they use identity names and no
    /// `--send=no`) and let only the read-only forms through.
    #[tokio::test]
    async fn pointed_at_mainnet_the_gate_refuses_every_invoke_and_deploy_the_checks_make() {
        let (mut refused_invokes, mut refused_deploys) = (0, 0);
        for call in run_all_checks_recorded().await {
            let on_mainnet = mainnet_form(&call);
            match (call[0].as_str(), call.get(1).map(String::as_str)) {
                ("contract", Some("invoke")) => {
                    assert!(mainnet_policy(&on_mainnet).is_err(), "an invoke would pass on Mainnet: {on_mainnet:?}");
                    refused_invokes += 1;
                }
                ("contract", Some("deploy")) => {
                    assert!(mainnet_policy(&on_mainnet).is_err(), "a deploy would pass on Mainnet: {on_mainnet:?}");
                    refused_deploys += 1;
                }
                ("contract", Some("info")) | ("keys", _) | ("--version", _) => {
                    assert_eq!(mainnet_policy(&on_mainnet), Ok(()), "{on_mainnet:?}");
                }
                other => panic!("a call shape the gate has no rule for: {other:?} in {call:?}"),
            }
        }
        assert!(refused_invokes > 50 && refused_deploys >= 4, "{refused_invokes} invokes, {refused_deploys} deploys");
    }

    /// And a Mainnet-form invoke that does satisfy the rules is accepted for
    /// every function the checks read (a read from a public key with --send=no).
    #[tokio::test]
    async fn a_read_the_checks_make_is_allowed_on_mainnet_once_it_is_written_as_a_simulation() {
        let g = public_key(7);
        for call in run_all_checks_recorded().await {
            if call.get(1).map(String::as_str) != Some("invoke") {
                continue;
            }
            let mut on_mainnet = mainnet_form(&call);
            let i = on_mainnet.iter().position(|a| a == "--source-account").unwrap();
            on_mainnet[i + 1] = g.clone();
            let split = on_mainnet.iter().position(|a| a == "--").unwrap();
            on_mainnet.insert(split, "--send=no".to_string());
            assert_eq!(mainnet_policy(&on_mainnet), Ok(()), "{on_mainnet:?}");
        }
    }

    #[test]
    fn the_refusal_becomes_an_rpc_error_that_names_the_rule() {
        let err = mainnet_policy(&v(&["contract", "deploy", "--rpc-url", RPC])).unwrap_err().to_string();
        assert!(err.starts_with("refused:") && err.contains("allow-list"), "{err}");
    }
}
