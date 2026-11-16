# SOW 2, Week 1: simulation without a secret key (feasibility)

Date: 2026-11-16. Network: **Testnet only**. Stellar CLI 28.0.0.
No transaction was sent to Mainnet. No secret key was printed, read or stored.

**TERBUKTI** = run in this session and the result observed.
**BELUM** = inferred or not run; needs its own check.

## Question

Can `stellar contract invoke --send=no` simulate vault calls when
`--source-account` is a **public address (G...)** instead of an identity
name that has a key? Does it send anything?

## Setup

- Vault: reference vault `CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF`
  (OpenZeppelin `stellar-tokens` 0.7.2, `decimals_offset = 0`).
- **Holder**: Testnet identity `alice`, public address
  `GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554`.
- **Empty**: `GDWBF4SWN4QMEEO5D3T4EODAXABUDOIP4SKUCZLREWG4EJYBNIBEZ4L2`, made
  from 32 random bytes encoded as a strkey. No secret key was made for it.
  Horizon returns `404` for this account (the account does not exist, so it
  has no XLM and no shares).

### Real deposit (the only transaction sent)

```bash
stellar contract invoke --id CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF \
  --source-account alice --network testnet -- deposit --assets 1000000 \
  --receiver GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554 \
  --from GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554 \
  --operator GCPIX7OU7CQERHI67K6LITRGNA5BVFYYUWABSG4RG3CGSLTJMIJG2554
```

Result: success, tx `11cf128bacd20a12b3dce750f334d6cd26a4318bf7c6f9a456e0a764d7e8e47a`,
ledger 5756342. Shares for alice went from 412,501,000 to 413,501,000. **TERBUKTI**

## Simulated calls

Every call used this form, with `<G>` as the address under test, both as
`--source-account` and as every address argument:

```bash
stellar contract invoke --id CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF \
  --source-account <G> --network testnet --send=no -- <function> <args>
```

| # | Call | Source account | Result | Notes | Status |
|---|---|---|---|---|---|
| 1 | `withdraw --assets 100000 --receiver <G> --owner <G> --operator <G>` | Holder (alice G...) | Success, exit 0, returns `"100000"` | Simulated Transfer + Withdraw events (100,000 assets, 100,000 shares). No tx sent. | TERBUKTI |
| 2 | `redeem --shares 100000 --receiver <G> --owner <G> --operator <G>` | Holder | Success, exit 0, returns `"100000"` | Simulated Transfer + Withdraw events. No tx sent. | TERBUKTI |
| 3 | `deposit --assets 100000 --receiver <G> --from <G> --operator <G>` | Holder | Success, exit 0, returns `"100000"` | Simulated Transfer + Deposit events. No tx sent. | TERBUKTI |
| 4 | `mint --shares 100000 --receiver <G> --from <G> --operator <G>` | Holder | Success, exit 0, returns `"100000"` | Simulated Transfer + Deposit events. No tx sent. | TERBUKTI |
| 5 | `total_assets` | Holder | Success, exit 0, returns `"563501000"` | Equals 562,501,000 before the real deposit + 1,000,000. | TERBUKTI |
| 6 | `withdraw` (same args) | Empty (random G...) | Fail, exit 1 | `transaction simulation failed: HostError: Error(Contract, #407)` = `VaultExceededMaxWithdraw` in `stellar-tokens` 0.7.2 | TERBUKTI |
| 7 | `redeem` (same args) | Empty | Fail, exit 1 | `HostError: Error(Contract, #408)` = `VaultExceededMaxRedeem` | TERBUKTI |
| 8 | `deposit` (same args) | Empty | Fail, exit 1 | `HostError: Error(Contract, #6)`. The vault defines no code 6. It probably comes from the native asset contract (`AccountMissingError`, because the account does not exist). | Error: TERBUKTI; source of #6: BELUM |
| 9 | `mint` (same args) | Empty | Fail, exit 1 | `HostError: Error(Contract, #6)`, same as #8 | Error: TERBUKTI; source of #6: BELUM |
| 10 | `total_assets` | Empty | Success, exit 0, returns `"563501000"` | A read works even when the source account does not exist on the network. | TERBUKTI |

## Was anything sent?

| Check | Before simulations | After simulations | Status |
|---|---|---|---|
| alice sequence number (Horizon) | 20161083293565712 | 20161083293565712 | TERBUKTI |
| alice latest tx (Horizon) | `11cf128b…e47a` (the real deposit), ledger 5756342 | same | TERBUKTI |
| Empty account on Horizon | `404` | `404` (account and its transactions) | TERBUKTI |
| Vault `total_assets` | 563,501,000 | 563,501,000 | TERBUKTI |

No simulated call produced a transaction hash. The CLI printed no
"Signing transaction" or "Sending transaction" line for any of them.

## Findings

1. `--send=no` with a public G address as `--source-account` works for both
   write and read functions. No secret key is needed. **TERBUKTI**
2. The source account does not even have to exist for a read
   (`total_assets`). **TERBUKTI**
3. Write simulations fail with the contract's own error when the address holds
   no shares (#407, #408) or the account does not exist (#6). So a simulation
   reports the real state of that address, not a generic success. **TERBUKTI**
4. Simulation probably runs authorization in recording mode, so a successful
   simulation does not prove the signature would be accepted. It only shows
   which authorizations the call needs. This has not been checked. **BELUM**
5. Simulating `deposit`/`mint` from an address that has no balance in the
   underlying asset but does exist on the network has not been tried.
   **BELUM** (see Part A below: on the reference vault that case cannot
   exist, so the closest case was tested instead.)

## Part A: funded account with no shares

### Underlying asset is native XLM

`query_asset` on the reference vault returns
`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`, which is the
same id that `stellar contract id asset --asset native --network testnet`
prints. **TERBUKTI**

So the underlying asset is native XLM. Every account that exists on the
network holds XLM, because it needs a minimum balance to exist at all. On
this vault, "account exists but has none of the underlying asset" cannot
happen. The closest case is an account that has XLM but less than the amount
deposited (row A3).

### Account

Testnet identity `grace`, public address
`GDCT3GFQGRJJKNY44D5G7EJFDK6TQQCD7ZTBK3636MLKSA7UTEB6BCRI`. The account
exists on Testnet with 9,740.6888017 XLM and holds `0` vault shares (read
with `balance`). The key was not used: every call below passes the public
address. **TERBUKTI**

Command form (same as above, `<G>` = grace's public address):

```bash
stellar contract invoke --id CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF \
  --source-account <G> --network testnet --send=no -- <function> <args>
```

| # | Call | Source account | Result | Notes | Status |
|---|---|---|---|---|---|
| A1 | `deposit --assets 100000 --receiver <G> --from <G> --operator <G>` | grace (funded, 0 shares) | Success, exit 0, returns `"100000"` | Simulated Transfer (100,000 XLM stroops) + Deposit events. No tx sent. | TERBUKTI |
| A2 | `mint --shares 100000 --receiver <G> --from <G> --operator <G>` | grace | Success, exit 0, returns `"100000"` | Simulated Transfer + Deposit events. No tx sent. | TERBUKTI |
| A3 | `deposit --assets 1000000000000000 --receiver <G> --from <G> --operator <G>` (more than the account holds) | grace | Fail, exit 1 | `transaction simulation failed: HostError: Error(Contract, #10)`. `cli/src/rpc.rs` already records this exact error as the native over-balance case (`B_NATIVE_OVER_BALANCE`). | Error: TERBUKTI; meaning of #10 taken from the existing repo fixture, not re-derived: BELUM |

| Check (Horizon) | Before | After | Status |
|---|---|---|---|
| grace sequence number | 21128039345684713 | 21128039345684713 | TERBUKTI |
| grace latest tx | `46ea9d5d…6dc2`, ledger 5278210 | same | TERBUKTI |
| grace XLM | 9740.6888017 | 9740.6888017 | TERBUKTI |
| grace vault shares | 0 | 0 | TERBUKTI |

Findings:

- A funded account with no shares can simulate `deposit` and `mint` from its
  public address alone. **TERBUKTI**
- When the amount is more than the account's XLM, the simulation fails with
  the asset contract's error, so a simulation does check the real balance.
  **TERBUKTI**
- A vault whose underlying asset is a custom token (for example Blind Vault)
  would allow a real "has none of the asset" case. Not tested. **BELUM**

## Part B: Mainnet WASM on Testnet

Mainnet was used **read-only**: two reads (`contract info hash`,
`contract fetch`) against `https://mainnet.sorobanrpc.com`. No transaction
was signed or sent to Mainnet.

Contract: Soroswap Router on Mainnet,
`CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH`. The address comes
from third-party documentation. This test only shows that a contract with
WASM exists at that address. It does not show that the address really
belongs to Soroswap. **BELUM** for the ownership claim.

| # | Step | Command (no secrets) | Result | Status |
|---|---|---|---|---|
| B1 | Contract exists on Mainnet and has WASM | `stellar contract info hash --contract-id CAG5LRYQ…JDDH --rpc-url https://mainnet.sorobanrpc.com --network-passphrase "Public Global Stellar Network ; September 2015"` | Exit 0, wasm hash `4c3db3ebd2d6a2ab23de1f622eaabb39501539b4611b68622ec4e47f76c4ba07` | TERBUKTI |
| B2 | Fetch WASM to a local file | `stellar contract fetch --id CAG5LRYQ…JDDH --rpc-url https://mainnet.sorobanrpc.com --network-passphrase "…" --out-file <temp dir outside repo>/soroswap-router.wasm` | Exit 0, 34,253 bytes, sha256 `4c3db3eb…ba07`, equal to the on-chain hash | TERBUKTI |
| B3 | Interface | `stellar contract info interface --wasm <file> --output rust` | Has `initialize`, `add_liquidity`, `remove_liquidity`, `swap_*`, `router_*`, `get_*` functions and no `__constructor`, so it can be deployed with no arguments | TERBUKTI |
| B4 | Upload (install) to Testnet | `stellar contract upload --wasm <file> --source-account alice --network testnet` | Exit 0, CLI printed `Skipping install because wasm already installed` and the hash `4c3db3eb…ba07`. The same WASM was already on Testnet (uploaded earlier by someone else), so **this step sent no transaction**. | TERBUKTI |
| B5 | Deploy one instance without initializing it | `stellar contract deploy --wasm-hash 4c3db3eb…ba07 --source-account alice --network testnet` | Success. Contract `CCCW7AWSXTC3OHC5Q2PGW64GGNY6OQLUXQKI3UFCAJ37466TVRYF6B7F`, tx `58d225fb336c50ddb9111c1dbce6d047e926dd3fd422962459d386ee184c38f3`, ledger 5756414. `initialize` was not called. | TERBUKTI |
| B6 | Instance exists, same hash as Mainnet | `stellar contract info hash --contract-id CCCW7AWS…6B7F --network testnet` | `4c3db3eb…ba07`, identical to Mainnet | TERBUKTI |
| B7 | Byte comparison | `stellar contract fetch --id CCCW7AWS…6B7F --network testnet --out-file <temp>` then `cmp` against the Mainnet file | Files identical | TERBUKTI |

No function of the Testnet instance was invoked. Only `contract info hash`
and `contract fetch` were run against it, which read ledger entries and do
not call the contract.

The `.wasm` files are kept in a temporary folder outside the repo and are not
committed.

Findings:

- Mainnet contract code can be copied to Testnet with the same wasm hash,
  without touching Mainnet state. **TERBUKTI**
- The copy is uninitialized, so it has no factory and no pairs. Calling it
  would not reproduce Mainnet behaviour until it is initialized and given
  its own pairs. Not tried. **BELUM**
