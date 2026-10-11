# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Aegis Vault: a Rust CLI (`sep56-vault-guard`) that runs 11 checks (7 conformance + 4 security) against a SEP-56 tokenized vault contract on Stellar **testnet**, plus a Node backend that runs the CLI for a Next.js web UI. Some internal docs (`docs/`, `.claude/skills/aegis-vault-design/`) are in Indonesian.

## Commands

Rust (repo root, Cargo workspace):

```bash
cargo build --release -p sep56-vault-guard   # always pass -p; plain `cargo build` also builds the 5 contracts in contracts/
cargo test -p sep56-vault-guard              # only unit tests are in cli/src/preflight.rs
./target/release/sep56-vault-guard --vault <CONTRACT_ID> --output text|json [--status-file <path>]
```

Running the CLI needs Stellar CLI ≥ v28 on PATH (spawned directly, not via a shell) and seven funded testnet identities: `alice bob carol dave erin frank grace` (`stellar keys generate <name> --network testnet --fund`). A run takes ~1 min of real testnet round trips. Exit codes: `0` all pass, `1` ran with ≥1 failure, `2` preflight failed (no check ran; JSON output is then a single `{error, code, problem, fix}` object instead of an array).

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
- `preflight.rs` — stellar version, identities, target-is-a-contract, balances → exit 2 on failure.
- `status.rs` — optional `--status-file` JSON snapshot rewritten as each check starts/finishes (`run_tracked`); purely reporting, never affects results.
- `[profile.release] overflow-checks = true` is set at workspace level deliberately.

The check ids, groups and order are a shared contract across `cli/src/status.rs`, `web/src/config/checks.ts`, and `VAULT_CHECKS.md`; keep them in sync.

**Contracts (`contracts/`)** — Soroban `cdylib` crates (edition 2021, soroban-sdk + OpenZeppelin `stellar-tokens`) used as test fixtures: `reference-vault` (default `--vault` target; known donation-attack failure, see SECURITY.md), `rounding-bug-vault` (intentionally buggy), `hardened-vault` (dead-shares mitigation), `blind-vault` + `blind-asset` (blind generalization test). Not needed to build the checker.

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

Any deviation from this table after a checker change is a regression (or an intended change that must also be recorded in `VAULT_CHECKS.md` and, for findings, `SECURITY.md`). These addresses are also the showcase vaults in `web/src/config/checks.ts`.

Preflight (exit 2) scenarios to cover when touching `preflight.rs`: `stellar` missing or older than v28, a missing identity, and a `--vault` that is not a contract on testnet (`code: "vault_not_a_contract"` under `--output json`).

Backend/web flow: run the server locally (see Commands) with the CLI binary on PATH, `POST /api/check` with `{"vault": "<address>"}`, then poll `GET /api/check/:jobId` and confirm `checks` progresses from `pending` → `running` → `pass`/`fail` and ends `complete` with `result`. Also exercise the queue (a second request while one runs returns `queued`/`position`) and `GET /health`.

Unit tests: `web/src/lib/test/` covers `useCheckRun` (polling, queue position, supersede/unmount, legacy `result` fallback), `findings` (donation-attack detail parsing), and `report` (JSON/Markdown export). Rust unit tests only cover `parse_major` in `preflight.rs`; check logic is not unit-tested and depends on testnet.

## CI

- `web/` is deployed by Vercel's Git integration (Root Directory `web`, not the repo root: the root holds `Cargo.toml`, `cli/`, `server/`). Production only: the Render backend's CORS allows the production origin, so preview deployments can't reach it.
- `.github/workflows/release.yml` — on `v*` tag: builds Windows (static CRT) then Linux (Ubuntu 22.04, fails if binary needs glibc > 2.35) and creates a **draft** release with `.sha256` files.

## Reference docs

`VAULT_CHECKS.md` (what each check asserts), `SECURITY.md` (known findings/limitations), `docs/GUIDELINE.md` (internal overview).
