---
name: aegis-vault-design
description: "Design system Aegis Vault (Stitch). Dipakai setiap kali membangun atau mengubah UI di web/."
---

# Aegis Vault: design system

Berlaku untuk semua pekerjaan UI di `web/` (`index.html`, `style.css`, `app.js`).

Halaman ini memakai design Stitch yang sudah jadi dan sudah disetujui. Tugas
skill ini adalah menjaga agar tambahan baru terasa satu bahasa dengan yang
sudah ada, bukan menilai ulang keputusan desainnya.

Sumber token: `design-reference/DESIGN.md` dan blok `:root` di
`web/style.css`. Referensi visualnya `design-reference/` (mockup Stitch) dan
`screen.png` dari export Stitch.

## Cara bekerja di repo ini

- **Hanya menambah.** Elemen dan copy yang sudah ada (hero, dot-grid dan glow,
  icon badge, chip angka, eyebrow, headline, stat strip, kartu, footer) adalah
  bagian dari design yang berlaku. Jangan menghapus, memindahkan, atau menulis
  ulangnya. Perubahan atau penghapusan hanya dilakukan kalau user memintanya
  secara eksplisit. Kalau sebuah fitur baru butuh ruang, tambahkan elemen baru
  di sekitarnya.
- **Alur API di `app.js` tidak berubah.** `POST /api/check`, polling
  `GET /api/check/:jobId`, penanganan respons, serta id, grup, dan urutan 11
  check tetap apa adanya. Perubahan tampilan hanya di fungsi render, dan kode
  baru ditambahkan sebagai blok terpisah.
- **Tanpa library dan tanpa CDN baru.** HTML, CSS, dan JavaScript biasa saja.
  Font Geist dan JetBrains Mono dari Google Fonts yang sudah terpasang adalah
  satu-satunya aset eksternal.
- **Nilai baru lewat token.** Warna, ukuran, dan jarak diambil dari variabel
  `:root`. Kalau butuh varian, turunkan dari token yang ada (misalnya
  `color-mix(in srgb, var(--primary-strong) 50%, transparent)`) daripada
  menulis hex baru.
- **Kalau ragu, berhenti dan tanya dulu.** Lebih baik bertanya sekali daripada
  mengubah sesuatu yang sebenarnya disengaja.

## Token

### Permukaan dan garis

Kanvas `--bg`, lalu empat tingkat permukaan yang makin terang:
`--surface` (panel, kartu), `--surface-2`, `--surface-3` (hover, elemen
bertingkat), `--surface-4` (hover paling terang, dipakai kartu hasil check).
Garis 1px memakai `--border`, dan `--border-strong` untuk penegasan saat
hover atau fokus.

### Aksen

Amber adalah satu-satunya aksen utama:

| Token | Dipakai untuk |
|---|---|
| `--primary` | angka dan ikon beraksen di atas permukaan gelap |
| `--primary-strong` | tombol utama, border fokus, indikator aktif |
| `--primary-strong-hover` | hover tombol utama (lebih terang, bukan lebih gelap) |
| `--on-primary-strong` | teks di atas tombol amber |
| `--primary-subtle-bg` | glow ambient di hero |
| `--secondary` | aksen mint, dipakai hemat |

### Status

Empat status, masing-masing punya tiga token: warna teks, latar, dan border.
`--pass` hijau, `--fail` merah, `--warn` amber, `--pending` amber pucat.
Pasangannya `--pass-bg` dan `--pass-border`, dan seterusnya.

### Teks

`--text-primary` untuk judul dan nilai, `--text-secondary` untuk penjelasan
dan label, `--text-tertiary` untuk keterangan yang sengaja diredam.

### Tipografi

`--font-sans` (Geist) untuk semua prosa, judul, label, dan tombol.
`--font-mono` (JetBrains Mono) untuk representasi mesin: alamat kontrak,
detail keluaran CLI, timer, penomoran, jumlah per grup, dan link footer.

Skala yang dipakai: 11, 12, 13, 14, 16, 18, 24, dan 32px. Judul memakai
tracking negatif, dan angka yang berubah memakai `tabular-nums`.

### Jarak, radius, layout

Jarak memakai `--space-xs` sampai `--space-xl`, gutter grid `--gutter`
(`--gutter-mobile` di layar kecil), dan jarak tepi `--margin`
(`--margin-mobile`). Radius: `--radius` 4px untuk tombol, input, dan badge;
`--radius-md` untuk icon badge; `--radius-lg` untuk kartu dan panel;
`--radius-full` hanya untuk titik status 6px.

Container memakai `--max-width` 1440px, topbar setinggi `--topbar-height`,
dan jarak antar kelompok di navbar memakai `--cluster-gap`.

Breakpoint: `max-width: 1023px` untuk tablet dan `max-width: 767px` untuk
mobile. Untuk target sentuh dipakai `(max-width: 767px), (pointer: coarse)`.

## Komponen

**Tombol.** Tinggi 36px, radius 4px, Geist 13px semibold. Primary memakai
latar `--primary-strong` dengan teks `--on-primary-strong`; secondary memakai
`--surface` dengan `--border`. Tombol di hero 40px, dan semua tombol naik ke
44px di mobile atau perangkat sentuh. Tombol nonaktif memakai `disabled`,
`aria-disabled`, opasitas lebih rendah, dan kursor `not-allowed`.

**Icon badge.** Kotak 32px dengan radius `--radius-md`, latar gradient
`--badge-bg`, border `--badge-border`, bayangan dalam tipis, dan ikon 18px
berwarna `--primary-strong` dengan `drop-shadow` `--badge-glow`. Dipakai di
stat strip hero dan di kartu risiko.

**Chip angka.** Kotak 32px berlatar `--surface-3`, angka mono 14px berwarna
`--primary`. Dipakai di kepala kartu risiko bersama icon badge.

**Kartu.** Latar `--surface`, border `--border`, radius `--radius-lg`,
padding `--space-lg`. Kartu hasil check memakai `--surface-3` dan menandai
statusnya lewat warna border.

**Badge status.** Tinggi 22px, mono 11px, huruf kapital, radius 4px, dengan
trio warna sesuai statusnya. Badge `running` punya titik 6px yang berdenyut.

**Form.** Input dan select 36px (44px di mobile dan layar sentuh), latar
`--bg`, border `--border`, fokus berupa border `--primary-strong` plus ring
1px. Input alamat memakai mono. Tombol preset memakai mono 11px, dan yang
aktif ditandai border amber.

**Eyebrow dan kepala section.** Eyebrow memakai huruf kapital 11px
`--text-tertiary` di atas judul, diikuti `h2` 24px dan lede 14px
`--text-secondary`.

## Animasi

Semua gerakan halus, singkat, dan mati di bawah `prefers-reduced-motion`.

**Hero saat halaman dimuat.** Isi hero naik 14px sambil memudar masuk
(`hero-fade-up`, 450ms), bertahap dengan jeda 80, 180, 280, dan 360ms.

**Reveal saat scroll.** `app.js` memasang kelas `reveal` pada kepala section,
kartu risiko, panel Try it, dan footer, lalu menambahkan `is-visible` lewat
`IntersectionObserver` saat elemen masuk viewport. Efeknya naik 10px selama
450ms dengan easing `cubic-bezier(0.22, 1, 0.36, 1)`, sekali per elemen.
Kartu risiko muncul bertahap dengan jeda 60ms.

Ini murni penyempurnaan: kelasnya hanya dipasang kalau `IntersectionObserver`
tersedia dan reduced motion tidak aktif, sehingga konten tetap terlihat penuh
tanpa JavaScript. Elemen yang dirender ulang setiap polling (kartu hasil
check dan laporan) sengaja tidak ikut, supaya tidak beranimasi berulang.

**Hover.** Transisi 200ms `ease-out` untuk tombol, preset, link navigasi, dan
link footer. Kartu menjadi sedikit lebih terang saat di-hover.

**Hover kartu risiko.** Border berubah menjadi amber 50% (diturunkan dari
`--primary-strong` lewat `color-mix`, dengan token penuh sebagai cadangan) dan
icon badge membesar ke `scale(1.1)` selama 200ms, sesuai referensi Stitch.
Pembesaran ikon dimatikan di bawah reduced motion.

**Denyut.** Keyframe `pulse` dipakai titik status pada ringkasan run yang
sedang berjalan dan pada badge `running`.

## Aksesibilitas

- Kontras minimal WCAG AA: 4.5:1 untuk teks normal, 3:1 untuk ikon dan border.
  Hitung rasionya saat memasangkan warna baru.
- `:focus-visible` yang jelas di semua elemen interaktif.
- Target sentuh minimal 44px di mobile dan perangkat sentuh.
- Ikon dekoratif memakai `aria-hidden="true"`, dan status yang diperbarui
  langsung memakai `aria-live="polite"`.
- Tidak ada scroll horizontal di 375, 768, 1024, dan 1440px.

## Sebelum menyerahkan perubahan

1. Pastikan nilai baru berasal dari token `:root`.
2. Jalankan preview lokal (`web/serve.ps1`) dan bandingkan dengan referensi
   Stitch agar bagian lama tetap sama persis.
3. Cek scroll horizontal, kontras, dan target sentuh di 375 dan 1440px.
4. Uji tanpa JavaScript dan dengan reduced motion aktif.
5. Ambil screenshot desktop dan mobile untuk direview user sebelum commit.
