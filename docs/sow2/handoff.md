# Handoff SOW 2: keadaan per 16 November 2026

Ringkasan singkat untuk melanjutkan pekerjaan. Setiap klaim ditandai
**TERBUKTI** (dijalankan atau dibaca langsung) atau **BELUM**. Rincian ada di
`docs/sow2/changelog.md` dan `docs/sow2/design-*.md`.

## 1. Keadaan git (TERBUKTI, dibaca 16 Nov 2026)

| Branch | SHA | Catatan |
|---|---|---|
| `main` | `b843f86` | Tidak berubah selama SOW 2. Dikunci ruleset `kunci-main`: tidak bisa dihapus, tidak bisa force-push, perubahan wajib lewat PR (0 approval). |
| `dev-sow2` | `c77baddb` | Berisi PR #56–#59. Belum di-merge ke `main`; itu butuh persetujuan Anda. |

## 2. PR yang sudah masuk ke `dev-sow2` (semuanya squash)

| PR | Commit | Satu baris |
|---|---|---|
| #56 | `3f8c7d2` | Hasil uji kelayakan (`docs/sow2/feasibility.md`): simulasi `--send=no` dengan alamat G tanpa secret key bisa jalan, dan WASM Mainnet bisa dibaca lalu di-deploy ke Testnet dengan hash yang sama. |
| #57 | `359ab50` | Probe antarmuka di awal run: kontrak tanpa antarmuka SEP-56 berhenti sebagai `unsupported_interface` (exit 2), tanpa `invoke`; ditambah field `raw_error`. |
| #58 | `2dc02d3` | `approve`/`allowance` dipanggil dengan nama parameter dari spec kontrak (Stellar CLI v28 tidak mendukung argumen posisional); fixture baru SEP-41 Names Vault. |
| #59 | `c77badd` | `reason {code, message}` di baris non-PASS, `mode`, `spec` dan `runs_on` di setiap baris, kolom baru di Markdown, `reason` di status file, teks docs `output.ts`. |

Tes pada `dev-sow2`: 104 tes Rust lulus (`cargo test -p sep56-vault-guard`),
96 tes web lulus. Regresi terakhir: 9 fixture Testnet (8 lama + SEP-41 Names)
identik dengan build sebelumnya; hanya empat field baru yang bertambah.

## 3. Yang BELUM terbukti

- **Tampilan `/docs/output` di browser belum dicek.** Lint, tes, dan build
  lulus, tetapi halaman yang dirender belum dilihat.
- **`behavior_mismatch` dan `interface_missing` baru terbukti lewat unit test.**
  Tidak ada fixture yang menghasilkan keduanya.
- **Server meneruskan `unsupported_interface` sebagai status error / HTTP 502.**
  `server/index.js` mengubah objek non-array menjadi `status: 'error'`
  dengan isi `problem` + `fix`. Web menampilkannya sebagai pesan run, jadi
  terbaca, tetapi ini hasil, bukan kegagalan server. Perlu dirapikan sebelum
  `dev-sow2` masuk ke `main`. `server/` dan `render.yaml` tidak disentuh
  sampai nilai dashboard Render dikirim.
- **Uji end-to-end dengan server lokal belum dilakukan** (POST `/api/check`,
  polling, antrean, `/health`). Perilaku server dan web hanya dibaca dari kode.
- **Web live di `main` belum diuji dengan keluaran CLI baru.** Field baru
  hanya tambahan, jadi seharusnya tidak merusak; ini belum dijalankan.

## 4. Saldo token Blind (Testnet, dibaca 16 Nov 2026)

| Akun | Saldo token Blind |
|---|---|
| `bob` | 0 |
| `erin` | 0 |
| `grace` | 110.214.379 |

Satu run Blind Vault memakai seluruh saldo `bob` (5.000.000) dan `erin`
(10.000.000), dan sekitar 50.000.000 dari `grace` (donation_attack butuh
sedikitnya 100.000.001 di awal run). Tanpa isi ulang, `access_control_probing`
berakhir INCONCLUSIVE dan exit code bergeser.

**Isi ulang masih manual**, dari `alice` (admin mint token Blind):

```bash
stellar contract invoke --id CCNIPWVKCN225GVSFC77LBI6Y4TZLQRR3LUTS7JLGBXED3Y2PMDI6SSG \
  --source-account alice --network testnet -- mint --to <ALAMAT_G_AKUN> --amount <JUMLAH>
```

Alamat akun dari `stellar keys address <nama>`. Untuk dua run Blind, yang
dipakai sebelumnya: `bob` +10.000.000, `erin` +20.000.000, `grace` +100.000.000.

## 5. Sisa D2

- **Dokumentasi parameter constructor** yang dibutuhkan pemeriksaan keamanan
  (`name`, `symbol`, `asset`, `decimals_offset`), dan `query_asset`.
- **Vault token kustom**, termasuk perbaikan saldo token kurang yang muncul
  sebagai `unclassified_error` dan bukan `insufficient_token_balance` (teks
  error yang tertangkap hanya satu baris `Error(Contract, #100)` tanpa event
  log; penyebab ini dugaan dari kode, BELUM dilacak).
- **Wording pass**: judul "Remediation needed" dan teks badge PASS. Sengaja
  dikerjakan terpisah dari perubahan skema; mengubahnya mengubah judul laporan
  untuk vault yang sudah didukung, jadi contoh di `docs/sample-reports/` harus
  dibuat ulang.

## 6. Catatan lain

- **`.claude/launch.json` menunjuk `web/serve.ps1` yang tidak ada**
  (TERBUKTI: `preview_start` gagal dengan "parameter -File does not exist").
  Pratinjau web lewat entri itu tidak bisa jalan; pakai `npm run dev` di `web/`.
  File itu belum diubah.
- Fixture dan hasil yang diharapkan ada di tabel skenario `CLAUDE.md`.
  Celengan dan StellarBin dipakai untuk uji `unsupported_interface`; run ke
  keduanya aman karena berhenti di probe baca-saja.
- Semua pekerjaan Testnet saja. Tidak ada tag atau rilis dari SOW 2.
