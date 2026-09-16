use serde_json::Value;

use crate::rpc::{deploy_contract, invoke_contract};

/// Outcome of a single conformance check.
pub struct CheckResult {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

/// Checks that `total_assets()` can be called on the vault and returns a
/// valid non-negative amount.
///
/// This does not yet compare against a specific expected value — it only
/// validates that the call succeeds and the returned data is sane.
pub async fn check_total_assets(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "total_assets".to_string();

    match read_total_assets(contract_id, source_account).await {
        Ok(amount) => CheckResult {
            name,
            passed: true,
            detail: format!("total_assets = {amount}"),
        },
        Err(detail) => CheckResult {
            name,
            passed: false,
            detail,
        },
    }
}

/// Deposits a fixed amount into the vault (receiver = from = operator =
/// `source_account`) and checks that:
/// 1. The shares minted (the call's return value) match the deposited
///    assets 1:1, matching the ratio observed on this vault so far.
/// 2. `total_assets()` after the deposit equals `total_assets()` before
///    the deposit plus the deposited amount.
pub async fn check_deposit(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "deposit".to_string();
    const DEPOSIT_AMOUNT: i128 = 5_000_000; // 0.5 XLM in stroops

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets before deposit: {detail}"),
            }
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

    let shares_minted = match invoke_contract(contract_id, "deposit", &args, source_account).await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("deposit returned a non-numeric or negative value: {value}"),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("deposit invoke failed: {e}"),
            }
        }
    };

    if shares_minted != DEPOSIT_AMOUNT {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "shares minted ({shares_minted}) does not match deposited assets \
                 ({DEPOSIT_AMOUNT}) at the expected 1:1 ratio"
            ),
        };
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets after deposit: {detail}"),
            }
        }
    };

    let expected_after = before + DEPOSIT_AMOUNT;
    if after != expected_after {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "total_assets after deposit ({after}) != before ({before}) + deposited \
                 ({DEPOSIT_AMOUNT}) = {expected_after}"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "deposited {DEPOSIT_AMOUNT} stroops, minted {shares_minted} shares (1:1 ratio), \
             total_assets {before} -> {after}"
        ),
    }
}

/// Mints a fixed amount of vault shares (receiver = from = operator =
/// `source_account`) and checks that:
/// 1. The assets pulled (the call's return value) match the minted shares
///    1:1, matching the ratio observed on this vault so far.
/// 2. `total_assets()` after the mint equals `total_assets()` before the
///    mint plus the assets pulled in.
pub async fn check_mint(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "mint".to_string();
    const MINT_SHARES: i128 = 3_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets before mint: {detail}"),
            }
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

    let assets_pulled = match invoke_contract(contract_id, "mint", &args, source_account).await {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("mint returned a non-numeric or negative value: {value}"),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("mint invoke failed: {e}"),
            }
        }
    };

    if assets_pulled != MINT_SHARES {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "assets pulled ({assets_pulled}) does not match minted shares \
                 ({MINT_SHARES}) at the expected 1:1 ratio"
            ),
        };
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets after mint: {detail}"),
            }
        }
    };

    let expected_after = before + assets_pulled;
    if after != expected_after {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "total_assets after mint ({after}) != before ({before}) + assets pulled \
                 ({assets_pulled}) = {expected_after}"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "minted {MINT_SHARES} shares, pulled {assets_pulled} assets (1:1 ratio), \
             total_assets {before} -> {after}"
        ),
    }
}

/// Withdraws a fixed amount of underlying assets from the vault
/// (receiver = owner = operator = `source_account`) and checks that:
/// 1. The shares burned (the call's return value) match the withdrawn
///    assets 1:1, matching the ratio observed on this vault so far.
/// 2. `total_assets()` after the withdrawal equals `total_assets()`
///    before the withdrawal minus the withdrawn amount.
pub async fn check_withdraw(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "withdraw".to_string();
    const WITHDRAW_AMOUNT: i128 = 2_000_000; // 0.2 XLM in stroops

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets before withdraw: {detail}"),
            }
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

    let shares_burned = match invoke_contract(contract_id, "withdraw", &args, source_account).await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("withdraw returned a non-numeric or negative value: {value}"),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("withdraw invoke failed: {e}"),
            }
        }
    };

    if shares_burned != WITHDRAW_AMOUNT {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "shares burned ({shares_burned}) does not match withdrawn assets \
                 ({WITHDRAW_AMOUNT}) at the expected 1:1 ratio"
            ),
        };
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets after withdraw: {detail}"),
            }
        }
    };

    let expected_after = before - WITHDRAW_AMOUNT;
    if after != expected_after {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "total_assets after withdraw ({after}) != before ({before}) - withdrawn \
                 ({WITHDRAW_AMOUNT}) = {expected_after}"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "withdrew {WITHDRAW_AMOUNT} stroops, burned {shares_burned} shares (1:1 ratio), \
             total_assets {before} -> {after}"
        ),
    }
}

/// Redeems a fixed amount of vault shares (receiver = owner = operator =
/// `source_account`) and checks that:
/// 1. The assets received (the call's return value) match the redeemed
///    shares 1:1, matching the ratio observed on this vault so far.
/// 2. `total_assets()` after the redemption equals `total_assets()`
///    before the redemption minus the assets received.
pub async fn check_redeem(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "redeem".to_string();
    const REDEEM_SHARES: i128 = 1_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets before redeem: {detail}"),
            }
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

    let assets_received = match invoke_contract(contract_id, "redeem", &args, source_account).await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("redeem returned a non-numeric or negative value: {value}"),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("redeem invoke failed: {e}"),
            }
        }
    };

    if assets_received != REDEEM_SHARES {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "assets received ({assets_received}) does not match redeemed shares \
                 ({REDEEM_SHARES}) at the expected 1:1 ratio"
            ),
        };
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets after redeem: {detail}"),
            }
        }
    };

    let expected_after = before - assets_received;
    if after != expected_after {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "total_assets after redeem ({after}) != before ({before}) - assets received \
                 ({assets_received}) = {expected_after}"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "redeemed {REDEEM_SHARES} shares, received {assets_received} assets (1:1 ratio), \
             total_assets {before} -> {after}"
        ),
    }
}

/// Calls `convert_to_shares(assets = 4_000_000)` (a read-only conversion,
/// no vault shares are actually minted) and checks that:
/// 1. The result matches the 1:1 ratio observed on this vault so far.
/// 2. `total_assets()` is unchanged before/after the call, since a pure
///    conversion must not have any side effects on vault state.
pub async fn check_convert_to_shares(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "convert_to_shares".to_string();
    const CONVERT_ASSETS: i128 = 4_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!(
                    "could not read total_assets before convert_to_shares: {detail}"
                ),
            }
        }
    };

    let shares = match convert_to_shares(contract_id, source_account, CONVERT_ASSETS).await {
        Ok(amount) => amount,
        Err(detail) => return CheckResult { name, passed: false, detail },
    };

    if shares != CONVERT_ASSETS {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "convert_to_shares({CONVERT_ASSETS}) returned {shares}, expected the \
                 1:1 ratio ({CONVERT_ASSETS})"
            ),
        };
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets after convert_to_shares: {detail}"),
            }
        }
    };

    if after != before {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "convert_to_shares is not read-only: total_assets changed from {before} \
                 to {after}"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "convert_to_shares({CONVERT_ASSETS}) = {shares} (1:1 ratio), \
             total_assets unchanged at {before}"
        ),
    }
}

/// Calls `convert_to_assets(shares = 4_000_000)` (a read-only conversion)
/// and checks that:
/// 1. The result matches the 1:1 ratio observed on this vault so far.
/// 2. The round-trip `convert_to_assets(convert_to_shares(4_000_000))`
///    returns `4_000_000` again, i.e. the two conversions are consistent
///    inverses of each other.
/// 3. `total_assets()` is unchanged before/after all of the above calls,
///    since pure conversions must not have any side effects on vault
///    state.
pub async fn check_convert_to_assets(contract_id: &str, source_account: &str) -> CheckResult {
    let name = "convert_to_assets".to_string();
    const CONVERT_SHARES: i128 = 4_000_000;

    let before = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!(
                    "could not read total_assets before convert_to_assets: {detail}"
                ),
            }
        }
    };

    let assets = match convert_to_assets(contract_id, source_account, CONVERT_SHARES).await {
        Ok(amount) => amount,
        Err(detail) => return CheckResult { name, passed: false, detail },
    };

    if assets != CONVERT_SHARES {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "convert_to_assets({CONVERT_SHARES}) returned {assets}, expected the \
                 1:1 ratio ({CONVERT_SHARES})"
            ),
        };
    }

    let roundtrip_shares = match convert_to_shares(contract_id, source_account, CONVERT_SHARES)
        .await
    {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("round-trip convert_to_shares call failed: {detail}"),
            }
        }
    };

    let roundtrip_assets =
        match convert_to_assets(contract_id, source_account, roundtrip_shares).await {
            Ok(amount) => amount,
            Err(detail) => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("round-trip convert_to_assets call failed: {detail}"),
                }
            }
        };

    if roundtrip_assets != CONVERT_SHARES {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "round-trip inconsistency: convert_to_assets(convert_to_shares({CONVERT_SHARES})) \
                 = convert_to_assets({roundtrip_shares}) = {roundtrip_assets}, expected \
                 {CONVERT_SHARES}"
            ),
        };
    }

    let after = match read_total_assets(contract_id, source_account).await {
        Ok(amount) => amount,
        Err(detail) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not read total_assets after convert_to_assets: {detail}"),
            }
        }
    };

    if after != before {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "convert_to_assets is not read-only: total_assets changed from {before} \
                 to {after}"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "convert_to_assets({CONVERT_SHARES}) = {assets} (1:1 ratio), round-trip \
             convert_to_assets(convert_to_shares({CONVERT_SHARES})) = {roundtrip_assets} \
             (consistent), total_assets unchanged at {before}"
        ),
    }
}

/// Calls `convert_to_shares(assets)` and parses the result as a
/// non-negative `i128`.
async fn convert_to_shares(
    contract_id: &str,
    source_account: &str,
    assets: i128,
) -> Result<i128, String> {
    let args = vec!["--assets".to_string(), assets.to_string()];
    match invoke_contract(contract_id, "convert_to_shares", &args, source_account).await {
        Ok(value) => parse_non_negative_i128(&value).ok_or_else(|| {
            format!("convert_to_shares returned a non-numeric or negative value: {value}")
        }),
        Err(e) => Err(format!("convert_to_shares invoke failed: {e}")),
    }
}

/// Calls `convert_to_assets(shares)` and parses the result as a
/// non-negative `i128`.
async fn convert_to_assets(
    contract_id: &str,
    source_account: &str,
    shares: i128,
) -> Result<i128, String> {
    let args = vec!["--shares".to_string(), shares.to_string()];
    match invoke_contract(contract_id, "convert_to_assets", &args, source_account).await {
        Ok(value) => parse_non_negative_i128(&value).ok_or_else(|| {
            format!("convert_to_assets returned a non-numeric or negative value: {value}")
        }),
        Err(e) => Err(format!("convert_to_assets invoke failed: {e}")),
    }
}

/// Simulates a donation/inflation attack against a **freshly deployed**
/// vault instance of the given `wasm_hash`, with `attacker_account` as the
/// attacker and `victim_account` as an unrelated victim depositor.
///
/// This check is self-contained: it deploys its own throwaway vault
/// instance (reusing the already-uploaded `wasm_hash`, so no re-upload is
/// needed) rather than touching any pre-existing vault, so it can be
/// re-run at any time and reused against any other vault built from the
/// same OpenZeppelin vault module.
///
/// Scenario:
/// 1. Deploy a fresh vault (`decimals_offset = 0`, given `underlying_asset`).
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
/// reasonably proportional number of shares (at least
/// `SHARE_TOLERANCE_PCT`% of the 1:1 ratio observed on a healthy vault).
/// Attacker profit/loss is recorded in the detail string for context only
/// — it does not affect PASS/FAIL, because the victim is harmed by a
/// donation attack regardless of whether the attacker personally profits.
pub async fn check_donation_attack(
    wasm_hash: &str,
    attacker_account: &str,
    victim_account: &str,
    underlying_asset: &str,
) -> CheckResult {
    let name = "donation_attack".to_string();
    const ATTACKER_DUST_DEPOSIT: i128 = 1;
    const DONATION_AMOUNT: i128 = 100_000_000;
    const VICTIM_DEPOSIT: i128 = 5_000_000;
    const SHARE_TOLERANCE_PCT: i128 = 90;

    let constructor_args = vec![
        "--name".to_string(),
        "Donation Attack Check Vault".to_string(),
        "--symbol".to_string(),
        "DACHK".to_string(),
        "--asset".to_string(),
        underlying_asset.to_string(),
        "--decimals_offset".to_string(),
        "0".to_string(),
    ];

    let vault_id = match deploy_contract(wasm_hash, attacker_account, &constructor_args).await {
        Ok(id) => id,
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!(
                    "could not deploy a fresh vault instance for the attack simulation: {e}"
                ),
            }
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
    let attacker_shares = match invoke_contract(
        &vault_id,
        "deposit",
        &attacker_deposit_args,
        attacker_account,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!(
                        "attacker dust deposit on {vault_id} returned an unexpected value: {value}"
                    ),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("attacker dust deposit failed on {vault_id}: {e}"),
            }
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
        invoke_contract(underlying_asset, "transfer", &donation_args, attacker_account).await
    {
        return CheckResult {
            name,
            passed: false,
            detail: format!("attacker donation transfer to {vault_id} failed: {e}"),
        };
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
        match invoke_contract(&vault_id, "deposit", &victim_deposit_args, victim_account).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult {
                        name,
                        passed: false,
                        detail: format!(
                            "victim deposit on {vault_id} returned an unexpected value: {value}"
                        ),
                    }
                }
            },
            Err(e) => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("victim deposit failed on {vault_id}: {e}"),
                }
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

    let expected_shares = VICTIM_DEPOSIT;
    let min_acceptable_shares = expected_shares * SHARE_TOLERANCE_PCT / 100;
    let victim_pct_of_expected = victim_shares.saturating_mul(100) / expected_shares;

    let verdict_detail = format!(
        "fresh vault {vault_id}: attacker deposited {ATTACKER_DUST_DEPOSIT} stroop(s) then donated \
         {DONATION_AMOUNT} stroops directly (bypassing deposit()); victim then deposited \
         {VICTIM_DEPOSIT} stroops and received {victim_shares} shares ({victim_pct_of_expected}% \
         of the {expected_shares} expected at a proportional 1:1 ratio); {attacker_pnl_detail}"
    );

    if victim_shares < min_acceptable_shares {
        CheckResult {
            name,
            passed: false,
            detail: format!("VULNERABLE to donation/inflation attack — {verdict_detail}"),
        }
    } else {
        CheckResult {
            name,
            passed: true,
            detail: format!("resilient to donation/inflation attack — {verdict_detail}"),
        }
    }
}

/// Simulates an extreme-input overflow scenario against a **freshly
/// deployed** vault instance: calling `deposit()` with `assets =
/// i128::MAX`.
///
/// # What this check actually validates
///
/// This check verifies that an extreme input fails **cleanly** — the call
/// returns an error and leaves no partial/corrupted vault state behind
/// (`total_assets()` stays `0`) — rather than silently succeeding with a
/// wrong result. It does **not** specifically prove that the vault's own
/// overflow-protection math (`stellar-tokens`' checked arithmetic and
/// `mul_div_with_rounding`'s i256 phantom-overflow handling) is what
/// rejects the call. For a native-XLM (or any classic-asset) underlying
/// asset, `i128::MAX` is rejected by the classic Stellar Asset Contract's
/// own `int64` amount ceiling *after* the vault's share-conversion math
/// has already run to completion — so this check exercises the SAC layer,
/// not necessarily the vault's overflow protection specifically. See the
/// detail string for which layer actually triggered the failure.
pub async fn check_overflow_protection(
    wasm_hash: &str,
    deployer_account: &str,
    underlying_asset: &str,
) -> CheckResult {
    let name = "overflow_protection".to_string();

    let constructor_args = vec![
        "--name".to_string(),
        "Overflow Test Vault".to_string(),
        "--symbol".to_string(),
        "OVFCHK".to_string(),
        "--asset".to_string(),
        underlying_asset.to_string(),
        "--decimals_offset".to_string(),
        "0".to_string(),
    ];

    let vault_id = match deploy_contract(wasm_hash, deployer_account, &constructor_args).await {
        Ok(id) => id,
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!(
                    "could not deploy a fresh vault instance for the overflow test: {e}"
                ),
            }
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
            return CheckResult {
                name,
                passed: false,
                detail: format!(
                    "deposit(assets=i128::MAX) {outcome}; additionally could not read \
                     total_assets afterwards to confirm clean state: {detail}"
                ),
            };
        }
    };

    match deposit_result {
        Ok(shares) => CheckResult {
            name,
            passed: false,
            detail: format!(
                "VULNERABLE: deposit(assets=i128::MAX) unexpectedly SUCCEEDED and minted \
                 {shares} shares on fresh vault {vault_id} (total_assets afterwards: \
                 {total_assets_after}) — an extreme input should be rejected cleanly, not \
                 accepted with a possibly-wrong result"
            ),
        },
        Err(e) if total_assets_after != 0 => CheckResult {
            name,
            passed: false,
            detail: format!(
                "VULNERABLE: deposit(assets=i128::MAX) failed as expected ({e}), but \
                 total_assets on {vault_id} is {total_assets_after} instead of 0 — the failed \
                 transaction left behind corrupted/partial state"
            ),
        },
        Err(e) => CheckResult {
            name,
            passed: true,
            detail: format!(
                "deposit(assets=i128::MAX) on fresh vault {vault_id} failed cleanly ({e}), and \
                 total_assets remained 0 — no silent-wrong-result observed. HONEST CAVEAT: for a \
                 native XLM underlying asset, this failure is triggered by the classic Stellar \
                 Asset Contract's own int64 amount ceiling (\"spent amount is too large for an \
                 i64\"), reached AFTER the vault's own share-conversion math already completed \
                 successfully (confirmed via the total_assets() call inside preview_deposit \
                 executing without error). So this validates clean-failure behavior, NOT \
                 specifically the vault's own overflow-protection math, which was never actually \
                 pushed to its overflow point in this scenario."
            ),
        },
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
pub async fn check_rounding_direction(
    wasm_hash: &str,
    deployer_account: &str,
    underlying_asset: &str,
) -> CheckResult {
    let name = "rounding_direction".to_string();
    const SEED_DEPOSIT: i128 = 1000;
    const DONATION: i128 = 500;
    const DEPOSIT_TEST_ASSETS: i128 = 100;
    const MINT_TEST_SHARES: i128 = 100;

    let constructor_args = vec![
        "--name".to_string(),
        "Rounding Test Vault".to_string(),
        "--symbol".to_string(),
        "RNDCHK".to_string(),
        "--asset".to_string(),
        underlying_asset.to_string(),
        "--decimals_offset".to_string(),
        "0".to_string(),
    ];

    let vault_id = match deploy_contract(wasm_hash, deployer_account, &constructor_args).await {
        Ok(id) => id,
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("could not deploy a fresh vault instance for the rounding test: {e}"),
            }
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
    if let Err(e) = invoke_contract(&vault_id, "deposit", &seed_args, deployer_account).await {
        return CheckResult {
            name,
            passed: false,
            detail: format!("seed deposit failed on {vault_id}: {e}"),
        };
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
        invoke_contract(underlying_asset, "transfer", &donation_args, deployer_account).await
    {
        return CheckResult {
            name,
            passed: false,
            detail: format!("donation transfer to {vault_id} failed: {e}"),
        };
    }

    // --- Test A: deposit() must floor, matching preview_deposit() ---
    let preview_deposit_shares = match invoke_contract(
        &vault_id,
        "preview_deposit",
        &["--assets".to_string(), DEPOSIT_TEST_ASSETS.to_string()],
        deployer_account,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!(
                        "preview_deposit on {vault_id} returned an unexpected value: {value}"
                    ),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("preview_deposit failed on {vault_id}: {e}"),
            }
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
        match invoke_contract(&vault_id, "deposit", &deposit_args, deployer_account).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult {
                        name,
                        passed: false,
                        detail: format!(
                            "deposit on {vault_id} returned an unexpected value: {value}"
                        ),
                    }
                }
            },
            Err(e) => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("deposit failed on {vault_id}: {e}"),
                }
            }
        };

    if actual_deposit_shares != preview_deposit_shares {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "Test A failed: actual deposit() shares ({actual_deposit_shares}) does not \
                 match preview_deposit() ({preview_deposit_shares}) on {vault_id}"
            ),
        };
    }

    // --- Test B: mint() must ceil, matching preview_mint() and strictly
    //     exceeding the always-floor convert_to_assets() ---
    let preview_mint_assets = match invoke_contract(
        &vault_id,
        "preview_mint",
        &["--shares".to_string(), MINT_TEST_SHARES.to_string()],
        deployer_account,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!(
                        "preview_mint on {vault_id} returned an unexpected value: {value}"
                    ),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("preview_mint failed on {vault_id}: {e}"),
            }
        }
    };

    let idealized_assets = match invoke_contract(
        &vault_id,
        "convert_to_assets",
        &["--shares".to_string(), MINT_TEST_SHARES.to_string()],
        deployer_account,
    )
    .await
    {
        Ok(value) => match parse_non_negative_i128(&value) {
            Some(amount) => amount,
            None => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!(
                        "convert_to_assets on {vault_id} returned an unexpected value: {value}"
                    ),
                }
            }
        },
        Err(e) => {
            return CheckResult {
                name,
                passed: false,
                detail: format!("convert_to_assets failed on {vault_id}: {e}"),
            }
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
        match invoke_contract(&vault_id, "mint", &mint_args, deployer_account).await {
            Ok(value) => match parse_non_negative_i128(&value) {
                Some(amount) => amount,
                None => {
                    return CheckResult {
                        name,
                        passed: false,
                        detail: format!("mint on {vault_id} returned an unexpected value: {value}"),
                    }
                }
            },
            Err(e) => {
                return CheckResult {
                    name,
                    passed: false,
                    detail: format!("mint failed on {vault_id}: {e}"),
                }
            }
        };

    if actual_mint_assets != preview_mint_assets {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "Test B failed: actual mint() assets pulled ({actual_mint_assets}) does not \
                 match preview_mint() ({preview_mint_assets}) on {vault_id}"
            ),
        };
    }

    if actual_mint_assets <= idealized_assets {
        return CheckResult {
            name,
            passed: false,
            detail: format!(
                "Test B failed: mint() assets pulled ({actual_mint_assets}) is not strictly \
                 greater than the idealized convert_to_assets() ({idealized_assets}) on \
                 {vault_id} at a fractional ratio — mint() should round UP (ceil), charging the \
                 user strictly more, distinct from the always-floor idealized rate"
            ),
        };
    }

    CheckResult {
        name,
        passed: true,
        detail: format!(
            "fresh vault {vault_id} at fractional ratio (seed {SEED_DEPOSIT} + donation \
             {DONATION}): Test A — deposit({DEPOSIT_TEST_ASSETS}) minted \
             {actual_deposit_shares} shares matching preview_deposit() (floor, favors vault); \
             Test B — mint({MINT_TEST_SHARES} shares) pulled {actual_mint_assets} assets \
             matching preview_mint() (ceil) and strictly greater than the idealized \
             convert_to_assets() ({idealized_assets}) — rounding direction confirmed to always \
             favor the vault over the user"
        ),
    }
}

/// Calls `total_assets()` and parses it as a non-negative `i128`, collapsing
/// both invoke and parse failures into a single human-readable error string.
async fn read_total_assets(contract_id: &str, source_account: &str) -> Result<i128, String> {
    match invoke_contract(contract_id, "total_assets", &[], source_account).await {
        Ok(value) => parse_non_negative_i128(&value)
            .ok_or_else(|| format!("total_assets returned a non-numeric or negative value: {value}")),
        Err(e) => Err(format!("invoke_contract failed: {e}")),
    }
}

/// The stellar CLI encodes i128 results as JSON strings (e.g. `"100000000"`)
/// to avoid precision loss, but also accept a plain JSON number as a
/// fallback in case that encoding ever changes for values that fit.
fn parse_non_negative_i128(value: &Value) -> Option<i128> {
    let amount = match value {
        Value::String(s) => s.parse::<i128>().ok()?,
        Value::Number(n) => i128::try_from(n.as_i64()?).ok()?,
        _ => return None,
    };

    (amount >= 0).then_some(amount)
}
