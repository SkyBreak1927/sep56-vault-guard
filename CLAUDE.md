# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Aegis Vault: a Rust CLI (`sep56-vault-guard`) that runs 11 checks (7 conformance + 4 security) against a SEP-56 tokenized vault contract on Stellar **testnet**, plus a Node backend that runs the CLI for a Next.js web UI. Some internal docs (`.claude/skills/aegis-vault-design/`) are in Indonesian.

## Commands

Rust (repo root, Cargo workspace):

```bash
cargo build --release -p sep56-vault-guard   # always pass -p; plain `cargo build` also builds the 5 contracts in contracts/
cargo test -p sep56-vault-guard              # unit tests only (no testnet)
./target/release/sep56-vault-guard --vault <CONTRACT_ID> --output text|json [--status-file <path>]
```

Running the CLI needs Stellar CLI ≥ v28 on PATH (spawned directly, not via a shell) and seven funded testnet identities: `alice bob carol dave erin frank grace` (`stellar keys generate <name> --network testnet --fund`). A run takes ~1 min of real testnet round trips. Exit codes (`exit_code` in `cli/src/main.rs`):
- `0`: no check failed and none was inconclusive. NOT_APPLICABLE counts neither way.
- `1`: at least one FAIL. A FAIL always wins.
- `2`: preflight failed and no check ran. The JSON output is then a single `{error: "preflight_failed", code, problem, fix}` object instead of an array. This includes `code: "unsupported_interface"`: the target does not declare the SEP-56 functions the conformance checks call. That object adds `missing_functions` and `mismatched_functions`, and nothing is invoked on the target.
- `3`: no FAIL, but at least one INCONCLUSIVE.

Web (`cd web`):

```bash
npm run dev        # http://localhost:3000
npm run build      # production build (.next)
npm run lint       # oxlint
npm test           # vitest (jsdom), tests in src/**/test/*.test.ts
npx vitest run src/lib/test/report.test.ts   # single test file
npm run coverage
```

Server (`cd server`): `npm start`. For local dev with the web UI: `PORT=4000 ALLOWED_ORIGINS=http://localhost:3000 npm start` and set `NEXT_PUBLIC_API_BASE=http://localhost:4000` in `web/.env.local`. Needs the CLI binary on PATH or `CLI_BINARY_PATH`.

## Architecture

**CLI (`cli/src/`)**
- `main.rs` — clap args, runs preflight, then two concurrent groups via `tokio::join!`: the 7 conformance checks run **sequentially** on the target vault as `alice`; the 4 security checks run **concurrently** with each other and with the conformance sequence. Each concurrent check has its own named identity(ies) because concurrent `stellar` transactions from the same account race on sequence numbers. Adding a check means assigning it a dedicated account (and adding it to `docker-entrypoint.sh` and the README list).
- `checks/mod.rs` — all 11 checks. Conformance checks call `deposit`/`mint`/`withdraw`/`redeem` on the real target vault and **mutate its state**. Security checks resolve the target's wasm hash/asset/`decimals_offset` (`resolve_target_vault`), deploy a throwaway clone, and attack the clone; they require the vault constructor `(name, symbol, asset, decimals_offset)` and a `query_asset` fn.
- `rpc.rs` — every chain interaction shells out to `stellar contract invoke/deploy`. Network is hardcoded to testnet; there is intentionally no mainnet flag.
- `preflight.rs` — stellar version, identities, target-is-a-contract, the interface probe, balances → exit 2 on failure.
- `interface.rs` — the interface probe. It reads the target's spec with `stellar contract info interface --output json`, a ledger read with no invoke. It then compares the 16 SEP-56 functions the conformance checks call by name, argument names and types, and return type. Missing or different → preflight `unsupported_interface`. An unreadable spec → a warning, and the run goes ahead as before. `query_asset`, `decimals` and the constructor, which only the security checks need, are not probed. Those checks still give NOT_APPLICABLE without them. Fixture specs live in `cli/testdata/interface/`.
  - The same spec read also gives the parameter names of `approve` and `allowance` (`token_arg_names`). `access_control_probing` passes its values under those names, by position, because Stellar CLI v28 takes named arguments only.
  - Rule (b-anchored): the types must be `address, address, i128, u32` and `address, address -> i128`, and the second argument must be named `spender`.
  - Any other shape, or an unreadable spec, makes that check NOT_APPLICABLE with `token_interface_mismatch`.
- `labels.rs` — the report labels.
  - `mode` (`testnet`), `spec` (`SEP-0056 v0.1.2 (Draft)`) and `runs_on` (`target` / `temporary_copy`) go on every JSON row. `mode` and `spec` also go on the preflight object.
  - `reason {code, message}` goes on every non-PASS row:
    - FAIL rows get `behavior_mismatch` (conformance), `security_finding` (security) or `interface_missing` (from `Stop::CommandFail`), with no `reason_code`.
    - INCONCLUSIVE and NOT_APPLICABLE rows get `reason.code` = `reason_code`.
  - `message` is one fixed sentence per code.
  - The Markdown tables carry `Mode`, `Spec` and `Runs on` columns, and the status file carries `reason`.
  - Additive only: statuses, `reason_code`, `detail` and exit codes are unchanged, and there is no schema version.
- `status.rs` — optional `--status-file` JSON snapshot rewritten as each check starts/finishes (`run_tracked`); purely reporting, never affects results.
- `[profile.release] overflow-checks = true` is set at workspace level deliberately.

The check ids, groups and order are a shared contract across `cli/src/status.rs`, `web/src/config/checks.ts`, and `VAULT_CHECKS.md`; keep them in sync.

**Contracts (`contracts/`)** — Soroban `cdylib` crates (edition 2021, soroban-sdk + OpenZeppelin `stellar-tokens`) used as test fixtures: `reference-vault` (default `--vault` target; known donation-attack failure, see SECURITY.md), `rounding-bug-vault` (intentionally buggy), `hardened-vault` (dead-shares mitigation), `blind-vault` + `blind-asset` (blind generalization test; `blind-asset`'s mint admin is `alice`), `positive-control-vault`, `reverting-max-vault`, `sep41-names-vault` (positive control with SEP-41 `approve`/`allowance` parameter names). Not needed to build the checker.

**Server (`server/index.js`)** — Express. `POST /api/check {vault}` enqueues a job (single runner, bounded queue, per-IP limits, rate limiter) and returns `jobId`/queue position; `GET /api/check/:jobId` returns progress read from the CLI's `--status-file`, then the CLI's `--output json` as `result`. Jobs live in memory. Deployed via `Dockerfile` (builds CLI, installs Stellar CLI 28.0.0, `docker-entrypoint.sh` generates/funds the 7 identities on start) and `render.yaml`.

**Web (`web/`)** — Next.js 16 App Router + Tailwind v4, deployed on Vercel (Next.js preset, Root Directory `web/`; optional sub-path via `NEXT_BASE_PATH`). Not a static export: Supabase Auth keeps the session in cookies via `@supabase/ssr` — `src/lib/supabase.ts` (browser client), `src/lib/supabase-server.ts` (server components/route handlers; trust `getClaims()`/`getUser()`, not `getSession()`), `src/proxy.ts` (Next 16's renamed middleware; refreshes the session). Pages are still prerendered static; no `next/image` optimization. `src/services/api.ts` is the backend client; `src/lib/useCheckRun.ts` drives start + polling; `src/config/site.ts` reads `NEXT_PUBLIC_*` link env vars (inlined at build time — see `web/.env.example`). `web/AGENTS.md` warns this Next.js version differs from training data: read `web/node_modules/next/dist/docs/` before using Next APIs.

**UI work in `web/`** must follow the `aegis-vault-design` skill (`.claude/skills/aegis-vault-design/SKILL.md`). Key rules: tokens come from `design-reference/DESIGN.md` mapped into `@theme` in `web/src/app/globals.css` (Tailwind's default palette/scale is cleared — use token classes, no new hex/arbitrary values); copy follows `design-reference/CORRECTED_CONTENT.md`; additive only — don't remove/rewrite existing design elements unless asked; no new dependencies or CDNs; don't change check data model (`config/checks.ts`, `CheckRun`/`CheckState`); reuse `components/styles.ts` and `Section`; run `npm run lint` and `npm run build` before handing off.

## Test scenarios

There are no automated end-to-end tests. Checker changes are verified by running the CLI against the fixture vaults already deployed on testnet and comparing with the expected results recorded in `VAULT_CHECKS.md` ("Demo/Validation Vaults"). Conformance checks mutate the target, so only use these fixtures (or your own deployments), never someone else's vault.

| Scenario | `--vault` | Expected | What it proves |
|---|---|---|---|
| Reference vault (default, no `--vault`) | `CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF` | 10 PASS, 1 FAIL (`donation_attack`), exit 1 | Baseline; known inflation-attack finding |
| Demo Vault | `CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ` | 10 PASS, 1 FAIL (`donation_attack`) | Same as baseline, no config drift |
| Vault A (`decimals_offset = 6`) | `CAWUBSRHD4DUDWAJENO7XHI3QVEXKIU3ZZ4HRM3RFZ4PNBSCCYXH4VTA` | 10 PASS, 1 FAIL (`donation_attack`) | Offset generalization; no false results |
| Vault B (rounding bug) | `CAZBXMYP5TQWEHCFMUD6ZEON7DUWAC2BCKNCKKVBIRX7GZN7M6I2P6HV` | 9 PASS, 2 FAIL (`donation_attack`, `rounding_direction`) | `rounding_direction` catches the injected bug |
| Hardened Vault | `CCVC5VLAH2RNCPWLR76P3IP6PCLOGG4AIOXXIQ5RNNG3DCKJ3ULBJUVG` | 10 PASS, 1 FAIL (`donation_attack`) | Mitigation doesn't break conformance (non-1:1 ratio) |
| Blind Vault (custom asset, offset 3) | `CCW5GTIFMGRPURESMVVFDFRQHX5ZBW3BTDKVPFNV2KFWY6Q7MVZLHGV7` | 10 PASS, 1 FAIL (`donation_attack`) | Non-native asset, unusual offset |
| Positive Control Vault (`DEAD_SHARES = 100_000_000`, offset 0) | `CAHMH3VSMNCYDCRTCZBJOKJE65HT2LJBZQFQULMRH6E2OGGGPMSNG376` | 11 PASS, exit 0 | Positive control: `donation_attack` passes for one donation size |
| SEP-41 Names Vault (positive control with SEP-41 `approve`/`allowance` names) | `CDTVHZ2EGTROAUVERX2YVN6GF7PTRWBMHHLKSWCQYQEYXIUTPXILUEIM` | 11 PASS, exit 0 (v0.5.0: `access_control_probing` INCONCLUSIVE, exit 3) | `access_control_probing` uses the names the target declares |

Any deviation from this table after a checker change is a regression (or an intended change that must also be recorded in `VAULT_CHECKS.md` and, for findings, `SECURITY.md`). These addresses are also the showcase vaults in `web/src/config/checks.ts`.

Preflight (exit 2) scenarios to cover when touching `preflight.rs` or `interface.rs`:
- `stellar` missing or older than v28.
- A missing identity.
- A `--vault` that is not a contract on testnet (`code: "vault_not_a_contract"` under `--output json`).
- A contract without the SEP-56 interface (`code: "unsupported_interface"`). Two non-SEP-56 contracts from other teams are used for this, and running against them is safe because the run stops at the read-only probe:
  - Celengan: `CCM6TNVNYYFUYXDON5HAGWMBL6IWMWIOZJFUNEWDUAJAGSJE326RWD2O`, all 16 functions missing.
  - StellarBin: `CCDVBRMT3BI65JV2C7AQJOSIGT76MNNTXSVYDKGXKPBSOKVWQRGKU7VI`, 13 missing; `deposit` and `withdraw` declared differently.

  Sample outputs are in `docs/sow2/samples/`.

Backend/web flow: run the server locally (see Commands) with the CLI binary on PATH, `POST /api/check` with `{"vault": "<address>"}`, then poll `GET /api/check/:jobId` and confirm `checks` progresses from `pending` → `running` → `pass`/`fail` and ends `complete` with `result`. Also exercise the queue (a second request while one runs returns `queued`/`position`) and `GET /health`.

Unit tests: `web/src/lib/test/` covers `useCheckRun` (polling, queue position, supersede/unmount, legacy `result` fallback), `findings` (donation-attack detail parsing), and `report` (JSON/Markdown export). Rust unit tests (`cargo test -p sep56-vault-guard`) cover:
- preflight messages;
- the interface probe, on saved specs;
- error classification and status mapping;
- JSON, Markdown and status-file shapes.

The checks' on-chain logic itself depends on testnet and has no unit tests.

## CI

- `web/` is deployed by Vercel's Git integration (Root Directory `web`, not the repo root: the root holds `Cargo.toml`, `cli/`, `server/`). Production only: the Render backend's CORS allows the production origin, so preview deployments can't reach it.
- `.github/workflows/release.yml` — on `v*` tag: builds Windows (static CRT) then Linux (Ubuntu 22.04, fails if binary needs glibc > 2.35) and creates a **draft** release with `.sha256` files.

## Reference docs

`VAULT_CHECKS.md` (what each check asserts), `SECURITY.md` (known findings/limitations), `docs/INTEGRATE.md` (funding the test accounts for a custom-token vault).
