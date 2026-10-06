# Integrating a vault that uses a custom token

Aegis Vault checks 7 core SEP-56 functions and four basic security risks of a
tokenized vault, on Stellar Testnet only. This guide covers one practical step
that the README only mentions: **funding the test accounts when the vault's
underlying asset is a custom token.**

## 1. When you need this

Every check moves the vault's underlying asset from one of seven local test
accounts. Which accounts need a balance depends on the asset:

- **The asset is native XLM.** Accounts funded by Friendbot already hold XLM, and
  nothing in this guide is needed. The reference vault in this repository uses
  native XLM and runs with only the funded accounts.
- **The asset is a custom token** (a Soroban token contract). Five of the seven
  accounts need a balance of that token first. Without it the checks that need
  the token end as `INCONCLUSIVE` with the reason code
  `insufficient_token_balance`, and the process exits with code `3`.

Everything below was measured on one vault and one token (see section 4). Read
the limits in section 8 before relying on the numbers for another vault.

## 2. Preparation

- **Stellar CLI v28.0.0 or newer** on your `PATH`. See the README's
  [Prerequisites](../README.md#prerequisites).
- **The seven test identities**, created once and funded with XLM for fees:
  `alice`, `bob`, `carol`, `dave`, `erin`, `frank`, `grace`. The README's
  [Testnet identities](../README.md#testnet-identities) section has the commands.
- XLM is only for transaction fees. The checker warns when an identity holds
  less than 5 XLM.

To print an identity's address, which you will need below:

```bash
stellar keys address alice
```

## 3. Find the vault's asset and its decimals

Any identity can run these read-only calls. Replace `<VAULT_ADDRESS>` with the
vault you want to check:

```bash
stellar contract invoke --id <VAULT_ADDRESS> --source-account alice --network testnet -- query_asset
stellar contract invoke --id <VAULT_ADDRESS> --source-account alice --network testnet -- decimals
```

`query_asset` prints the token's contract address (`<TOKEN_ADDRESS>` below).
Run `decimals` on the token as well:

```bash
stellar contract invoke --id <TOKEN_ADDRESS> --source-account alice --network testnet -- decimals
```

The checker derives the vault's `decimals_offset` as the vault's `decimals()`
minus the token's `decimals()`. A vault that does not expose `query_asset`, or
whose constructor does not take `(name, symbol, asset, decimals_offset)`, gets
`NOT_APPLICABLE` on the four security checks (see the README).

## 4. Minimum balances

All amounts are in the token's **smallest unit**, the raw numbers the checks pass
to the contract. The "tokens" column assumes a token with 7 decimals.

**These figures were measured on a single vault: the repository's reference
vault code with `decimals_offset = 3`, using the repository's test token
(`contracts/blind-asset`, 7 decimals).** On a vault that was empty when the run
started, the amounts below were enough for all 11 checks to reach a verdict.
Alice's amount is `5,000,000 + preview_mint(3,000,000)`, so it depends on the
vault's share price and will differ on another vault.

| Account | Used by | Minimum (smallest unit) | Tokens (7 decimals) |
|---|---|---|---|
| `alice` | the 7 conformance checks, on the target vault | `5,000,000 + preview_mint(3,000,000)` = **5,003,000** | 0.5003 |
| `grace` | `donation_attack` (attacker) | **100,000,001** | 10.0000001 |
| `bob` | `donation_attack` (victim) | **5,000,000** | 0.5 |
| `dave` | `rounding_direction` | **1,601** (1,000 + 500 + 100, plus 1 pulled by the final mint) | 0.0001601 |
| `erin` | `access_control_probing` (owner) | **10,000,000** | 1.0 |
| `carol` | `overflow_protection` | 0 | 0 |
| `frank` | `access_control_probing` (operator) | 0 | 0 |

How to read the table:

- **alice** deposits 5,000,000 and then mints 3,000,000 shares on the *target*
  vault, so her balance must cover both before she withdraws or redeems anything.
  On the measured vault the mint pulled 3,000 units. To find your own number, ask
  the vault: `preview_mint --shares 3000000` (see section 5).
- **carol** needed no balance on the measured vault: with a non-zero
  `decimals_offset` the extreme deposit used by `overflow_protection` is rejected
  by the vault's own arithmetic before any transfer is attempted.
- **frank** only receives tokens, so he needs XLM for fees and no token balance.
- **dave**: the last term depends on the share price. Applying the reference
  vault's formula at `decimals_offset = 0` gives a pull of about 151 units, which
  would put dave near 1,751. That figure was **calculated, not run**.

## 5. Sending the tokens

Look up each account's address first (`stellar keys address <name>`).

**If you control the token and it has an admin `mint` function** (the repository's
test token does; most tokens do not), the admin can create the balance directly:

```bash
stellar contract invoke --id <TOKEN_ADDRESS> --source-account <TOKEN_ADMIN> --network testnet -- \
  mint --to <ACCOUNT_ADDRESS> --amount 5003000
```

**For any other token, a holder sends it with `transfer`.** The holder is any
identity that already owns enough of the token:

```bash
stellar contract invoke --id <TOKEN_ADDRESS> --source-account <HOLDER> --network testnet -- \
  transfer --from <HOLDER> --to <ACCOUNT_ADDRESS> --amount 5003000
```

Repeat for `alice`, `grace`, `bob`, `dave` and `erin` with the amounts from
section 4.

Check a balance (a read-only call; any identity can be the source):

```bash
stellar contract invoke --id <TOKEN_ADDRESS> --source-account alice --network testnet -- \
  balance --account <ACCOUNT_ADDRESS>
```

To size alice's amount for your own vault:

```bash
stellar contract invoke --id <VAULT_ADDRESS> --source-account alice --network testnet -- \
  preview_mint --shares 3000000
```

Add that result to 5,000,000.

## 6. Run the checker and read the result

Windows, from `cmd` in the folder where you extracted the archive:

```bat
.\sep56-vault-guard.exe --vault <VAULT_ADDRESS> --output text
```

Linux:

```bash
./sep56-vault-guard --vault <VAULT_ADDRESS> --output text
```

Use `--output json` for a machine-readable array. A run takes roughly one minute.

What the statuses mean for funding:

- **`INCONCLUSIVE` with `insufficient_token_balance`** means a token transfer a
  check needed was rejected, which appears to be a short balance. The detail
  names the test account that started the call, for example
  `test account 'alice'`. Send that account more of the token and run again. It
  is not a finding about the vault.
- **Exit code `3`** means no check failed but at least one was `INCONCLUSIVE`, so
  the vault was not fully checked. Exit code `1` means at least one check failed,
  and a failure always wins. All four codes are in the README's
  [Exit codes](../README.md#exit-codes).
- The summary line grows only when needed, for example
  `Summary: 11 checks, 7 passed, 0 failed, 4 inconclusive`.
- If `donation_attack` ends as `INCONCLUSIVE` with the reason code
  `unclassified_error`, check **grace's** balance first. In that case the status
  is right but the reason label is not yet accurate (see section 8).

On the measured vault, with the amounts from section 4, the run gave 10 `PASS`
and 1 `FAIL`, exit code 1. The one failure was `donation_attack`, a genuine
finding for that vault, not a funding problem.

## 7. Running again

The balances are spent. On the measured vault one run used up about:

| Account | Spent in one run (smallest unit) |
|---|---|
| `grace` | about 49,976,180 (the attack's net loss as printed by the check) |
| `bob` | 5,000,000 |
| `erin` | 10,000,000 (500,000 of it moved to `frank`) |
| `dave` | 1,601 |
| `alice` | about 3,002,000, which stays as shares in the *target* vault |

The first four total roughly 64,977,781 units, about 6.5 tokens at 7 decimals,
and are not recovered: they stay in the temporary copies. Alice's part remains
as shares in the target vault; getting it back by redeeming those shares was not
tested. **Top up the accounts before the next run.** A second run on the same
vault without topping up ended with four `INCONCLUSIVE` results and exit code 3.
Testnet tokens have no monetary value, so spending them costs nothing real.

## 8. Limits

- **The seven conformance checks change the target vault's state.** They make
  real `deposit`, `mint`, `withdraw` and `redeem` calls on the vault you pass to
  `--vault`, using Testnet funds. Only the four security checks use a temporary
  copy of the vault; they deploy it, attack it, and only read the target.
- **Testnet only.** There is no option to point the checker at another network.
- **A vault with a different constructor** gets `NOT_APPLICABLE` on all four
  security checks, because the temporary copy cannot be deployed.
- **The reason code for a short `grace` balance is not yet accurate.**
  `donation_attack` calls the token's `transfer` directly, and that error is not
  recognised as a balance problem. The status is still `INCONCLUSIVE`, but the
  reason code can read `unclassified_error` instead of
  `insufficient_token_balance`. The raw error text is in the detail.
- **Measured on one vault.** The minimums in section 4 come from a single vault
  (`decimals_offset = 3`, the repository's test token). Alice's and dave's
  amounts change with the vault's share price.
- **Not tested:**
  - a vault with `decimals_offset = 0`;
  - assets issued on the classic Stellar network and exposed as a Stellar Asset
    Contract, including the trustline each test account would need;
  - tokens with a decimal count other than 7;
  - the Linux binary, which is built and glibc-checked in CI but has not been run
    by the maintainer;
  - sending the tokens with `transfer` from a holder (the measured run used the
    test token's admin `mint`).
