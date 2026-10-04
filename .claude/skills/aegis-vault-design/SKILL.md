---
name: aegis-vault-design
description: "Design system Aegis Vault (Stitch). Dipakai setiap kali membangun atau mengubah UI di web/."
---

# Aegis Vault: design system

Berlaku untuk semua pekerjaan UI di `web/`, aplikasi Next.js (App Router)
dengan Tailwind CSS v4 yang di-deploy ke Vercel.

Halaman ini memakai design Stitch yang sudah jadi dan sudah disetujui. Tugas
skill ini adalah menjaga agar tambahan baru terasa satu bahasa dengan yang
sudah ada, bukan menilai ulang keputusan desainnya.

Sumber token: `design-reference/DESIGN.md` (di root repo, satu-satunya sumber
kebenaran) yang dipetakan ke blok `@theme` di `web/src/app/globals.css`.
Copy halaman mengikuti `design-reference/CORRECTED_CONTENT.md`. Referensi
visualnya mockup Stitch di `design-reference/`.

## Peta kode

- `web/src/app/` — `layout.tsx` (font Geist dan JetBrains Mono lewat
  `next/font`, metadata), `page.tsx`, dan `globals.css` (token, utility, dan
  keyframe).
- `web/src/sections/` — satu folder per section halaman, berisi section itu
  dan bagian yang hanya dipakai di sana: `header/`, `hero/`,
  `why-it-matters/`, `vault-checker/` (`RunForm` → hasil →
  `VerificationReport`), `integrate/`, `closing/`, `footer/`, dan `auth/` (halaman `/sign-in`, `/sign-up`, `/reset-password`, `/auth/callback`; Supabase Auth sisi klien lewat `lib/supabase.ts` dan `lib/useAuth.ts`).
- `web/src/components/` — komponen bersama (`Section`, `StatusBadge`,
  `Select`, `CopyButton`, `Icons`, dll). Class list bersama ada di
  `styles.ts`.
- `web/src/artwork/` — engine Canvas 2D tanpa framework untuk artwork hero dan
  kartu risiko, diwarnai dari token DESIGN.md.
- `web/src/lib/useCheckRun.ts` — state run: `POST /api/check` ke backend
  `server/` lalu polling `GET /api/check/:jobId` (`src/lib/checkerApi.ts`).
- `web/src/config/checks.ts` — definisi 11 check, grup, dan showcase vault;
  `web/src/config/site.ts` — tujuan link dari env `NEXT_PUBLIC_*`.

## Cara bekerja di repo ini

- **Hanya menambah.** Elemen dan copy yang sudah ada (hero dengan dot matrix,
  bloom, scan pulse, dan artwork vault; eyebrow; headline; kartu risiko;
  form run; laporan; footer) adalah bagian dari design yang berlaku. Jangan
  menghapus, memindahkan, atau menulis ulangnya. Perubahan atau penghapusan
  hanya dilakukan kalau user memintanya secara eksplisit. Kalau sebuah fitur
  baru butuh ruang, tambahkan elemen baru di sekitarnya.
- **Data check tidak berubah.** Id, grup, dan urutan 11 check di
  `config/checks.ts`, serta bentuk `CheckRun`/`CheckState` di
  `useCheckRun.ts`, tetap apa adanya. Perubahan tampilan dilakukan di
  komponen, bukan di model datanya.
- **Tanpa dependency baru.** Cukup Next.js, React, dan Tailwind yang sudah
  terpasang. Font hanya Geist dan JetBrains Mono lewat `next/font`. Tidak ada
  CDN.
- **Bukan static export lagi.** Sesi Supabase disimpan di cookie
  (`@supabase/ssr`, `src/proxy.ts`), jadi kode server boleh dipakai bila perlu;
  halaman UI biasa tetap utamakan prerender statis. Tanpa optimasi
  `next/image`. Path aset harus aman di bawah `basePath` (`NEXT_BASE_PATH`).
- **Nilai baru lewat token.** Palet, skala teks, radius, dan breakpoint
  bawaan Tailwind sengaja dikosongkan, jadi hanya token di `@theme` yang ada.
  Pakai class dari token itu (`bg-surface`, `text-muted`, `rounded-lg`,
  `gap-space-md`). Kalau butuh varian, turunkan dari token (opacity
  `bg-accent/10`, atau `color-mix(in srgb, var(--color-accent) 18%,
  transparent)`) daripada menulis hex atau arbitrary value baru. Token baru
  ditambahkan di `@theme` dan harus bisa dirujuk ke DESIGN.md.
- **Pakai ulang class bersama.** Tombol, panel, field, label, dan blok kode
  diambil dari `components/styles.ts`; kepala section dari `Section`.
- **Kalau ragu, berhenti dan tanya dulu.** Lebih baik bertanya sekali daripada
  mengubah sesuatu yang sebenarnya disengaja.

## Token

Semua token ada di `@theme` pada `globals.css`; nama class Tailwind mengikuti
nama variabelnya (`--color-surface` → `bg-surface`, `--text-body-md` →
`text-body-md`).

### Permukaan dan garis

Kanvas `canvas`, lalu tiga tingkat permukaan yang makin terang: `surface`
(panel, kartu), `raised` (hover, elemen bertingkat), `interactive`. Garis 1px
memakai `line`, dan `line-strong` untuk penegasan saat hover. `line-overlay`
untuk overlay, `line-row` untuk pemisah baris tabel.

### Aksen

Amber adalah satu-satunya aksen:

| Token | Dipakai untuk |
|---|---|
| `accent` | tombol utama, eyebrow, border fokus, indikator aktif |
| `accent-hover` | hover tombol utama (lebih terang, bukan lebih gelap), scan pulse |
| `on-accent` | teks di atas tombol amber (5.37:1) |

### Status

`pass` hijau, `fail` merah, `warn` amber, `pending` amber pucat. Untuk
`pass` dan `fail`, varian `*-base` dipakai untuk latar dan border (dengan
opacity, misalnya `bg-pass-base/10 border-pass-base/20`), dan warna
desaturasi untuk teks. Lihat `StatusBadge`.

### Teks

`fg` untuk judul dan nilai, `muted` untuk penjelasan dan label, `subtle`
untuk keterangan yang sengaja diredam.

### Tipografi

`font-sans` (Geist) untuk semua prosa, judul, label, dan tombol.
`font-mono` (JetBrains Mono) untuk representasi mesin: alamat kontrak,
keluaran check, timer, dan badge status.

Skala: `headline-xl` (32px, `headline-xl-mobile` 24px), `headline-lg`,
`headline-md`, `body-lg`/`body-md`/`body-sm`, `label-md`/`label-sm`,
`code-md`/`code-sm`/`code-trace`. `display` hanya untuk baris utama hero,
satu-satunya tempat skala melewati 32px. Bobot 700 juga hanya untuk baris
itu. Judul memakai tracking negatif (sudah ada di token), dan angka yang
berubah memakai `tabular-nums`.

### Jarak, radius, layout

Jarak memakai `space-xs` sampai `space-xl` (kelipatan 4px). Pembungkus
halaman memakai utility `shell` (maks 1440px; margin 16px di mobile, 32px mulai
tablet). Grid memakai `gap-grid` (12/16/24px). Antar section memakai
`section-gap` + `section-rule` (lewat komponen `Section`).

Radius: `rounded` 4px untuk tombol, input, dan badge; `rounded-sm` 2px untuk
elemen mikro; `rounded-lg` 8px untuk kartu dan panel; `rounded-full` hanya
untuk titik status.

Breakpoint: `md` 768px (tablet), `lg` 1024px (desktop), `xl` 1440px (wide).
Tidak ada `sm`/`2xl`.

Bayangan: hanya `shadow-overlay` untuk overlay level 2 (dialog, popover).
Tidak ada drop shadow lain.

## Komponen

**Tombol.** `primaryButton`, `secondaryButton`, dan `accentOutlineButton` di
`styles.ts`: tinggi 36px (`h-9`), radius 4px, `text-label-md`. Primary
berlatar `accent` dengan teks `on-accent`; secondary berlatar `surface`
dengan border `line`; accent outline untuk aksi utama sebuah section. Hover
memakai varian `can-hover:`, yang otomatis mati untuk tombol `disabled` dan
link `[data-unconfigured]`.

**Panel/kartu.** `panel`: latar `surface`, border `line`, `rounded-lg`.

**Badge status.** `StatusBadge`: tinggi 22px, mono `code-sm`, huruf kapital,
radius 4px, warna sesuai status. Badge `running` punya titik 6px yang
berdenyut (`motion-safe:animate-pulse`).

**Form.** `field` untuk input dan select: 36px, latar `canvas`, border
`line`, fokus berupa border `accent` plus ring 1px. Label memakai
`fieldLabel` (kapital `label-sm`, `muted`). Alamat kontrak memakai mono.

**Blok kode.** `codeBlock` untuk keluaran mesin (detail check, trace log).

**Kepala section.** `Section` merangkai `SectionEyebrow` (kapital
`label-sm` warna `accent` dengan garis amber 24px di depannya),
`SectionHeadline` (`headline-xl`, `headline-xl-mobile` di mobile), dan lede
`body-md` `muted`.

**Link eksternal.** Tujuan link diambil dari `config/site.ts` dan tidak
pernah dikarang. Link yang belum dikonfigurasi dirender lewat `SmartLink`
dengan `data-unconfigured` (inert, opasitas 0.6).

## Animasi

Semua gerakan halus, singkat, dan mati di bawah `prefers-reduced-motion`
(lewat `motion-safe:`/`motion-reduce:` atau media query di utility).

**Atmosfer hero.** `hero-light` menentukan pusat cahaya; `hero-bloom` (glow
amber), `hero-dots` (dot matrix 32px), `hero-pulse` (cincin amber yang
menyapu dot setiap 7 detik), `hero-grain`, dan `hero-vignette`.

**Artwork canvas.** Engine di `src/artwork/` berhenti saat offscreen atau tab
tersembunyi, menyesuaikan kepadatan partikel, dan menghormati reduced motion.
Warnanya diambil dari token DESIGN.md, bukan hex baru.

**Kartu risiko.** Caption menyala saat langkah cerita canvas-nya diputar
(`risk-caption` dengan `[data-play]`, ditahan `[data-paused]` sampai section
terlihat).

**Hover.** Transisi 150ms `ease-out` untuk tombol dan field.

**Denyut.** `live-blink` untuk titik status live; `animate-pulse` untuk badge
`running`.

## Aksesibilitas

- Kontras minimal WCAG AA: 4.5:1 untuk teks normal, 3:1 untuk ikon dan border.
  Hitung rasionya saat memasangkan warna baru.
- `:focus-visible` global berupa outline 2px `accent`; jangan dihapus.
- Target sentuh minimal 44px di mobile dan perangkat sentuh.
- Ikon dekoratif memakai `aria-hidden="true"`, dan status yang diperbarui
  langsung memakai `aria-live="polite"`.
- Tidak ada scroll horizontal di 375, 768, 1024, dan 1440px.

## Sebelum menyerahkan perubahan

1. Pastikan nilai baru berasal dari token `@theme`.
2. Dari `web/`, jalankan `npm run lint` dan `npm run build` (build
   harus lolos).
3. Jalankan `npm run dev` (http://localhost:3000) dan bandingkan dengan
   referensi Stitch agar bagian lama tetap sama persis.
4. Cek scroll horizontal, kontras, dan target sentuh di 375 dan 1440px, serta
   dengan reduced motion aktif.
5. Ambil screenshot desktop dan mobile untuk direview user sebelum commit.
