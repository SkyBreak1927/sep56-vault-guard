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
minus the token's `decimals()`. A vault that does not expose `query_asset` gets
`NOT_APPLICABLE` on the four security checks. The constructor rules follow.

### Constructor requirements for the security checks

Each security check deploys its own temporary copy of the vault from the
target's Wasm, passing four **named** arguments to its constructor. So the
target's constructor has to declare all four, with these exact names. The order
does not matter.

| Argument | Type | Value the checks send | Where it comes from |
|---|---|---|---|
| `name` | `string` | A fixed text per check (for example `Rounding Test Vault`) | Built into the checker. Not read from the target. |
| `symbol` | `string` | A fixed text per check (for example `RNDCHK`) | Built into the checker. |
| `asset` | `address` | The target's underlying asset | `query_asset()` on the target. |
| `decimals_offset` | `u32` | The vault's `decimals()` minus the asset's `decimals()` | Derived (section 3 above). |

None of them can be changed from the command line.

**See your vault's constructor.** This is a read of the contract's spec. Replace
`<VAULT_ADDRESS>`:

```bash
stellar contract info interface --contract-id <VAULT_ADDRESS> --network testnet --output rust
```

Look for the `fn __constructor(` block. On the repository's Blind vault it reads
`name: String`, `symbol: String`, `asset: Address`, `decimals_offset: u32`.

**Try the same deploy by hand.** This is what each security check does. Get the
Wasm hash first, then deploy a copy with a custom token and a non-zero offset.
`dave` is one of the test identities; any funded identity works. Do not add
`--quiet` here (see below):

```bash
stellar contract info hash --contract-id <VAULT_ADDRESS> --network testnet

stellar contract deploy --wasm-hash <VAULT_WASM_HASH> --source-account dave \
  --network testnet -- --name "Constructor Docs Probe" --symbol CDPRB \
  --asset <TOKEN_ADDRESS> --decimals_offset 3
```

The deploy prints the new contract address. It creates a real (empty) contract
on Testnet. Run on the Blind vault's Wasm with the Blind token and offset 3, it
succeeded. Giving the arguments in another order also succeeded.

**When the constructor does not fit:**

| Constructor | What `stellar` prints | What the checker reports |
|---|---|---|
| Another argument name (for example `underlying` instead of `asset`) | `error: unexpected argument '--underlying' found` and a `Usage: __constructor …` line | `NOT_APPLICABLE` with `constructor_mismatch` on the four security checks. The CLI text was run; the checker result on a real vault has not been seen. |
| Fewer arguments than the four (for example no `decimals_offset`) | `unexpected argument '--decimals_offset' found` | The same. |
| An argument the checks do not send is required (for example `admin`) | With `--quiet`: nothing, exit code 1. Without it: `Missing required argument 'admin' of type address` | Expected from reading the code: `INCONCLUSIVE` with `unclassified_error` and the detail `No error text was available.` **Not seen on a real vault.** |

Two details about that table. The `Usage:` line `stellar` prints lists only the
arguments before the one it rejected, so it is not the full constructor; use the
spec read above for that. And the checker runs `stellar` with `--quiet`, so the
last row shows no text there.

A vault with another constructor is not covered by the four security checks
today. The seven conformance checks still run. The result is a limit of the
tool, not a finding about the vault.

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
  check needed was rejected, and the tool read the paying account's balance and
  found it below what the call needed. The detail names the test account that
  started the call, for example `test account 'alice'`, and gives both figures:
  `The account holds 0 of the underlying asset and needs 5000000.` Send that
  account more of the token and run again. It is not a finding about the vault.
- **Exit code `3`** means no check failed but at least one was `INCONCLUSIVE`, so
  the vault was not fully checked. Exit code `1` means at least one check failed,
  and a failure always wins. All four codes are in the README's
  [Exit codes](../README.md#exit-codes).
- The summary line grows only when needed, for example
  `Summary: 11 checks, 7 passed, 0 failed, 4 inconclusive`.
- If a check ends as `INCONCLUSIVE` with the reason code `unclassified_error`
  and the account its detail names holds enough of the token, the failure is
  not a short balance. Read the raw error in the detail.

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
- **A vault with a different constructor** cannot be covered by the four
  security checks, because the temporary copy cannot be deployed. Other argument
  names give `NOT_APPLICABLE`; a constructor that requires an argument the
  checks do not send is expected to give `INCONCLUSIVE` (not yet seen on a real
  vault). See "Constructor requirements for the security checks" in section 3.
- **A short balance is recognised by reading the account's balance.** After a
  rejected `deposit`, `mint` or token `transfer`, the tool reads the paying
  account's balance. If that read fails, the result stays `unclassified_error`.
  This was run with the repository's test token (stellar-tokens 0.7.2) only.
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
