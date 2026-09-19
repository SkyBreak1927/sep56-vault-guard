# Panduan Aegis Vault — Cara Kerja & Temuan Keamanan

*Dokumen internal tim — bukan bagian dari deliverable resmi ke Stellar Instawards.*

## 1. Ringkasan Eksekutif

**Awam:** Aegis Vault adalah alat "auditor otomatis" untuk vault di jaringan Stellar. Vault adalah kontrak pintar tempat orang menyetor aset dan menerima "shares" sebagai bukti kepemilikan (mirip rekening deposito otomatis). Aegis Vault mengecek apakah vault tertentu dibuat dengan benar dan aman, sebelum dipakai orang banyak.

**Teknis:** CLI berbasis Rust yang menjalankan 11 pengecekan otomatis (7 conformance + 4 adversarial) terhadap kontrak vault yang mengimplementasikan standar SEP-56 di Soroban (smart contract platform Stellar), dilengkapi web dashboard untuk visualisasi hasil.

## 2. Latar Belakang: Apa itu SEP-56 & Kenapa Perlu Tool Ini

SEP-56 adalah proposal standar di ekosistem Stellar yang mendefinisikan bagaimana seharusnya sebuah "tokenized vault" bekerja — mirip ERC-4626 di Ethereum. Standar ini mendefinisikan interface (deposit, withdraw, mint, redeem, dll) dan perilaku yang diharapkan (misal: pembulatan angka harus selalu menguntungkan vault, bukan user).

Masalahnya: siapa pun bisa membuat vault sendiri mengklaim mengikuti SEP-56, tapi implementasinya bisa salah atau punya celah keamanan. Belum ada tool standar untuk memvalidasi ini di ekosistem Stellar — itulah yang diisi Aegis Vault, dan menjadi alasan proyek ini didanai program Stellar Instawards.

## 3. Cara Kerja Aegis Vault

Alur kerja tingkat tinggi:

1. User menjalankan CLI (`sep56-vault-guard`), menunjuk ke alamat kontrak vault target (atau default ke reference vault kami)
2. CLI memanggil `stellar contract invoke` sebagai subprocess untuk berkomunikasi dengan vault di jaringan (testnet)
3. Untuk **positive conformance checks**: CLI memanggil langsung fungsi-fungsi vault target dan membandingkan hasilnya dengan ekspektasi standar
4. Untuk **security/adversarial checks**: CLI men-deploy klon vault throwaway (berdasarkan wasm hash & parameter vault target — bukan menyentuh state vault asli), lalu mensimulasikan serangan terhadap klon tersebut. Ini penting: **pengecekan keamanan tidak pernah menyentuh vault produksi asli**, jadi aman dijalankan terhadap vault siapa pun
5. Hasil (PASS/FAIL + detail) dicetak ke terminal atau JSON, dan bisa ditampilkan di web dashboard

## 4. Detail 11 Pengecekan

### Positive Conformance (7 checks)

| Check | Penjelasan Awam | Mekanisme Teknis |
|---|---|---|
| `total_assets` | Vault melaporkan total aset yang benar | Memanggil `total_assets()`, verifikasi angka masuk akal |
| `deposit` | Setor aset menghasilkan shares yang benar | `deposit()` dibandingkan dengan `preview_deposit()` |
| `mint` | Minta shares tertentu menarik aset yang benar | `mint()` dibandingkan dengan `preview_mint()` |
| `withdraw` | Tarik aset membakar shares yang benar | `withdraw()` dibandingkan dengan `preview_withdraw()` |
| `redeem` | Tukar shares menghasilkan aset yang benar | `redeem()` dibandingkan dengan `preview_redeem()` |
| `convert_to_shares` | Konversi aset→shares konsisten | Round-trip check (offset-agnostic) |
| `convert_to_assets` | Konversi shares→aset konsisten | Round-trip check (offset-agnostic) |

### Security / Adversarial (4 checks)

| Check | Penjelasan Awam | Mekanisme Teknis |
|---|---|---|
| `donation_attack` | Coba "curangi" vault dengan donasi langsung di luar `deposit()` | Deploy klon, attacker deposit 1 stroop lalu donasi besar langsung ke vault, cek apakah victim berikutnya masih dapat shares proporsional |
| `overflow_protection` | Coba bikin angka meluap (overflow) dengan jumlah ekstrem | Deposit `i128::MAX`, cek kegagalan bersih (bukan hasil salah senyap) |
| `rounding_direction` | Pastikan pembulatan selalu menguntungkan vault, bukan user | Bandingkan hasil `deposit`/`mint` dengan nilai idealisasi, cek arah pembulatan |
| `access_control_probing` | Coba tarik dana tanpa izin | Uji withdraw tanpa approval, dan uji batas allowance operator |

## 5. Studi Kasus: Temuan Donation Attack

**Ceritanya:** Bayangkan sebuah vault baru dibuka, belum ada nasabah. Seorang "attacker" bisa jadi nasabah pertama dengan setoran sangat kecil (1 stroop), lalu diam-diam "menyumbang" dana besar langsung ke rekening vault tanpa lewat proses setor resmi. Ketika nasabah asli (victim) datang dan menyetor dana normal, sistem salah hitung — victim dapat 0 unit kepemilikan, padahal seharusnya dapat proporsional sesuai setorannya.

**Detail teknis (dari pengujian nyata):**
- Attacker deposit 1 stroop via `deposit()` → dapat 1 share pertama
- Attacker donasi 100.000.000 stroops langsung ke vault (bypass `deposit()`)
- Victim deposit 5.000.000 stroops → menerima **0 shares** (seharusnya ~5.000.000 di rasio 1:1)
- Dikonfirmasi di vault segar `CAYTWFAAJREXQ2TEOO4L7ZG6733PIJUOO6KLF2JZN6ZCIA62OX7GCOJP`, `decimals_offset=0`

Ini adalah kerentanan nyata pada reference vault kami sendiri — bukan simulasi teoretis. Mitigasi standar: `decimals_offset`/virtual shares, atau membakar setoran minimum awal sebagai "dead shares".

## 6. Validasi Generalisasi (Vault A & B)

Untuk membuktikan Aegis Vault bukan cuma bisa mendeteksi 1 kasus kebetulan, kami deploy 2 vault tambahan dengan kondisi berbeda:

**Vault A** — reference vault yang sama, tapi `decimals_offset` dinaikkan ke 6 (bukan 0). Dugaan awal: ini akan membuat `donation_attack` jadi PASS. **Hasil sebenarnya: tetap FAIL.** Temuan penting ini justru memperkuat poin di atas — menaikkan `decimals_offset` menaikkan biaya serangan secara proporsional ke *deposit awal* attacker, tapi donasi mentahnya tidak ikut ter-skala. Kalau donasinya cukup besar relatif ke deposit korban, serangan tetap berhasil. Artinya `decimals_offset` **bukan mitigasi otomatis** — harus dikombinasikan dengan proteksi lain.

**Vault B** — vault dengan bug sengaja: arah pembulatan di `convert_to_shares`/`convert_to_assets` dibalik (menguntungkan user, melanggar SEP-56). Hasil: `rounding_direction` FAIL tepat sasaran, dengan pesan presisi yang mengidentifikasi masalahnya. Ini membuktikan check tersebut adalah **true negative detector** yang valid — bukan cuma selalu PASS tanpa arti.

## 7. Cara Menjalankan Tool

```bash
# Clone & build
git clone https://github.com/SkyBreak1927/sep56-vault-guard.git
cd sep56-vault-guard
cargo build --release

# Jalankan terhadap reference vault (default)
./target/release/sep56-vault-guard

# Jalankan terhadap vault tertentu
./target/release/sep56-vault-guard --vault <CONTRACT_ADDRESS>

# Output JSON (untuk integrasi/parsing otomatis)
./target/release/sep56-vault-guard --output json
```

Hasil juga bisa dilihat langsung di web dashboard tanpa install apa pun: **https://skybreak1927.github.io/sep56-vault-guard/**

## 8. Status Proyek

| Fase | Status |
|---|---|
| Week 1 — Fondasi & Engine Inti | ✅ Selesai |
| Week 2 — Test Suite Lengkap (11 checks) | ✅ Selesai |
| Week 3 — Validasi ke Vault Pihak Ketiga (Cushion/Microvault) | ⏸️ Terblokir izin operator (di luar kendali tim) |
| Week 4 — Dokumentasi & Rilis (README, SECURITY.md, cleanup, tag v0.1.0, vault demo A/B) | ✅ Selesai |
| Demo recording & Completion Report | 🔄 Sedang berjalan |

## 9. Referensi & Link

- **Repo GitHub:** https://github.com/SkyBreak1927/sep56-vault-guard
- **Web Dashboard (live):** https://skybreak1927.github.io/sep56-vault-guard/
- **README.md** — overview & cara install/pakai
- **SECURITY.md** — detail lengkap semua temuan keamanan
- **VAULT_CHECKS.md** — hasil pengujian Vault A & B
