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
   **BELUM**
