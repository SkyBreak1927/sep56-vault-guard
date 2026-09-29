---
name: aegis-vault-design
description: "Aturan desain web Aegis Vault. Dipakai setiap kali membangun atau mengubah UI di web/."
---

# Aegis Vault: aturan desain web

Berlaku untuk semua perubahan di `web/` (`index.html`, `style.css`, `app.js`).
Sumber token satu-satunya adalah `design-reference/DESIGN.md`. Baca file itu
sebelum mengubah UI. Jangan menambah token baru: kalau sebuah nilai tidak ada
di DESIGN.md, pakai token terdekat yang sudah ada, atau tanyakan ke user.

## 1. Token

Semua nilai diambil dari DESIGN.md dan dipakai lewat custom property di
`:root` pada `web/style.css`. Jangan menulis hex, ukuran font, atau jarak
secara langsung di aturan komponen.

- **Warna** (DESIGN.md `## Colors`)
  - Kanvas `#0C0D0E`, panel Level 1 `#141618`, Level 2 `#1C1E22` untuk
    elemen bertingkat dan hover.
  - Satu aksen: amber `#D97706`, hanya untuk aksi utama, metrik fokus, dan
    indikator aktif.
  - Teks primer, sekunder, tersier, serta border default (0.08) dan
    highlight (0.16) mengikuti `### Text & Border Tokens`.
- **Status** (DESIGN.md `### Chips & Test Badges`): pass hijau, fail merah,
  warn amber, pending/running amber pucat. Setiap status punya pasangan
  warna teks, latar 10%, dan border 20%.
- **Tipografi** (DESIGN.md `## Typography`)
  - Geist untuk semua teks manusia: judul, isi, label, tombol.
  - JetBrains Mono hanya untuk representasi mesin: alamat kontrak `C...`,
    hash, detail keluaran CLI, angka yang diperbarui langsung.
  - Skala 11px sampai 32px (24px untuk headline di mobile), memakai tracking
    negatif pada judul, dan `tabular-nums` untuk angka yang berubah.
- **Spacing dan layout** (DESIGN.md `## Layout & Spacing`): kelipatan 4px,
  token `space-xs` sampai `space-xl`, gutter 24/16/12px, margin 32px
  (16px di mobile), max-width 1440px, breakpoint mobile `< 768px`.
- **Radius** (DESIGN.md `## Shapes`): 4px untuk tombol, input, dan badge;
  8px untuk kartu dan panel; bentuk bulat penuh hanya untuk titik status 6px.
- **Kedalaman** (DESIGN.md `## Elevation & Depth`): tingkatan warna dan border
  1px, bukan bayangan lembut.

## 2. Pola komponen

**Tombol** (DESIGN.md `### Buttons`)
- Primary: latar amber, teks `#2F1500` (bukan putih; putih di atas amber
  hanya 3.19:1). Hover mencerahkan latar, bukan menggelapkan.
- Secondary: latar panel, border default; hover naik ke Level 2 dan border
  highlight.
- Destructive: sesuai DESIGN.md, merah pucat dengan border merah.
- Setiap tombol punya state hover, `:focus-visible` (ring amber 2px dengan
  offset), dan disabled (`disabled` plus `aria-disabled`, kursor
  `not-allowed`, tanpa aksi apa pun).
- Tinggi 36px di desktop; 44px di mobile dan perangkat sentuh.
- Label tombol menyebut aksinya secara persis ("Run check suite"), dan
  label yang sama dipakai di seluruh alur.

**Kartu hasil check**
- Satu kartu per check: nama (Geist, tebal), badge status di kanan atas,
  deskripsi singkat, lalu detail dari backend (JetBrains Mono) jika ada.
- Detail FAIL memakai warna fail. Border kartu mengikuti status hanya untuk
  running, fail, dan warn; pass dan pending memakai border default.
- Kartu tidak boleh punya tinggi seragam yang dipaksakan
  (`align-items: start`), supaya detail panjang tidak meregangkan kartu lain.
- Dikelompokkan di bawah header Conformance dan Security, masing-masing
  dengan ringkasan jumlah per status yang dihitung dari data.

**Form alamat vault** (DESIGN.md `### Form Controls & Inputs`)
- Input alamat memakai JetBrains Mono, latar kanvas, border default, dan
  focus berupa border plus ring amber.
- Validasi di klien: diawali `C`, 56 karakter. Pesan error muncul di bawah
  input, menyebut apa yang salah dan formatnya, tanpa meminta maaf.
- Label memakai `<label for>`. Placeholder berupa instruksi, bukan alamat
  contoh palsu.
- Pilihan jaringan: hanya Testnet yang aktif. Opsi lain ditandai disabled
  dan tidak boleh diaktifkan.
- Tombol showcase vault mengisi input; tombol yang aktif ditandai dengan
  border amber.

**Status per check**
- Lima status: `pending`, `running`, `pass`, `fail`, `warn` (CLI saat ini
  hanya mengirim empat yang pertama; `warn` tetap harus didukung).
- Badge: tinggi 22px, JetBrains Mono 11px, radius 4px.
- `running` boleh punya titik 6px yang berdenyut, dan harus berhenti di
  bawah `prefers-reduced-motion`.
- `pending` berwarna abu-abu redup dengan opasitas penuh supaya tetap
  terbaca.
- Status tidak boleh hanya dibedakan lewat warna: label teks selalu tampil.

## 3. Larangan

Pola berikut muncul di audit sebagai tanda desain generik. Jangan dipakai:

- Latar dot-grid, cahaya amber (radial glow atau blur) di belakang konten.
- Badge ikon bercahaya (drop-shadow atau glow pada ikon). Token badge di
  `web/style.css` yang tidak ada di DESIGN.md (`--badge-bg`: gradient
  `#1a1006` ke `#2a1a0a`, `--badge-border`, dan `--badge-glow`) dilarang
  dipakai lagi. Token itu dihapus dari `style.css` bersamaan dengan
  penghapusan badge ikon bercahaya.
- Chip angka dekoratif (01, 02, 03...) pada konten yang bukan urutan.
  Satu-satunya pengecualian: penomoran 01 sampai 11 di tabel laporan hasil,
  atas permintaan eksplisit user.
- Eyebrow huruf kapital di atas setiap judul section.
- Grid kartu identik tanpa hierarki (semua ukuran, border, dan bobot sama).
- Tanda panah `↗` dan pemisah titik tengah `·` yang berulang.
- Em dash (—) di teks yang tampil ke pengguna.
- Nilai hex atau ukuran font di luar token DESIGN.md.

## 4. Konten

- Setiap klaim teknis harus bisa ditunjuk ke `README.md`, `VAULT_CHECKS.md`,
  atau kode. Kalau tidak ada di sana, jangan ditulis.
- Cakupan yang boleh dinyatakan: 7 conformance check dan 4 security check.
  Jangan mengklaim check, jaringan, atau fitur lain.
- Jangan memakai kata "audit", "kesesuaian penuh" (atau padanannya seperti
  "fully compliant"), dan "cryptographic proof".
  Pengecualian: disclaimer di footer "Not a substitute for a formal audit."
  boleh dipertahankan, karena itu disclaimer, bukan klaim.
- Jangan menampilkan elemen yang menyiratkan pemantauan terus-menerus,
  misalnya titik hijau berdenyut "Live". Pengecekan hanya berjalan saat
  diminta.
- Jangan mengulang angka yang sama di banyak tempat. Sebutkan sekali di
  tempat yang paling relevan.
- Semua angka hasil (durasi, jumlah pass/fail, persentase) dihitung dari run
  yang benar-benar selesai, tidak pernah dari data contoh.
- Fakta eksekusi yang benar saat ini: 7 conformance check berjalan
  berurutan pada vault target, 4 security check berjalan bersamaan di
  samping urutan itu, semuanya di Soroban testnet lewat Stellar CLI. Jangan
  menulis bahwa kesebelas check berjalan paralel, dan jangan menyebut
  "sandbox terisolasi".

## 5. Aksesibilitas

- Kontras minimal WCAG AA: 4.5:1 untuk teks normal, 3:1 untuk teks besar dan
  elemen non-teks (ikon, border input, badge). Hitung rasionya, jangan
  menebak.
- Semua elemen interaktif punya `:focus-visible` yang jelas.
- Target sentuh minimal 44px di mobile dan perangkat sentuh
  (`(max-width: 767px), (pointer: coarse)`).
- Hormati `prefers-reduced-motion`: semua animasi dan transisi yang tidak
  dipicu pengguna harus mati.
- Ikon dekoratif memakai `aria-hidden="true"`. Ringkasan status yang
  diperbarui langsung memakai `aria-live="polite"`.
- Tidak ada scroll horizontal di 375px, 768px, 1024px, dan 1440px.

## 6. Batasan teknis

- Jangan mengubah pemanggilan API di `web/app.js`:
  `POST /api/check` (body `{ vault }`) dan `GET /api/check/:jobId`
  (polling), termasuk `API_BASE`, interval polling, dan penanganan
  responsnya. Perubahan tampilan hanya di fungsi render.
- Jangan mengubah id, grup, atau urutan 11 check di `CHECK_DEFS`. Semuanya
  harus tetap sama dengan `CHECK_ORDER` di `cli/src/status.rs`.
- Tidak ada framework, build step, atau CDN script baru (termasuk
  Tailwind). Hanya HTML, CSS, dan JavaScript biasa.

## Sebelum menyerahkan perubahan

1. Bandingkan setiap warna, ukuran, dan jarak baru dengan DESIGN.md.
2. Cek larangan di bagian 3 dan aturan konten di bagian 4.
3. Hitung kontras untuk warna teks dan latar yang baru.
4. Ukur target sentuh dan scroll horizontal di 375/768/1024/1440px.
5. Ambil screenshot desktop dan mobile untuk direview user sebelum commit.
