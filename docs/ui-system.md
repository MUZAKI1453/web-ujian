# Sistem tampilan Web Ujian

Admin, guru, dan siswa memakai fondasi visual yang sama. Susunan halaman mengikuti tugas tiap peran.

## Sumber utama

- `frontend/src/index.css`: token warna, radius, bayangan, dan kelas komponen `ui-*`.
- `frontend/src/components/ui/styles.ts`: kelas input dan tombol yang dipakai bersama.
- `PortalHeader` dan `PortalStat`: banner dan kartu ringkasan untuk semua portal.
- `PortalDialog` atau `ModalOverlay`: dialog dengan penguncian scroll, fokus keyboard, dan pengembalian fokus.

## Aturan komponen

- Gunakan `ui-button ui-button-primary` untuk tindakan utama, `ui-button-secondary` untuk tindakan pendamping, dan `ui-button-soft` untuk tindakan ringan. Aksi edit memakai biru; merah khusus penghapusan atau kesalahan, kuning untuk perhatian, hijau untuk keberhasilan atau pengumpulan ujian.
- Tombol dan input minimal 44 px. Tambahkan `ui-icon-button` untuk tombol yang hanya berisi ikon, serta `aria-label` atau judul yang jelas.
- Gunakan `ui-input` untuk input teks dan textarea. Checkbox dan radio tidak memakai kelas ini. Teks input 16 px di mobile dan 14 px mulai lebar 640 px.
- Pilihan tunggal memakai `components/ui/Select`, dengan anak `<option>`, `value`/`defaultValue`, dan `onValueChange` yang menerima string. Komponen ini menyediakan daftar kustom, pencarian otomatis saat pilihan lebih dari tujuh, navigasi keyboard, status nonaktif, dan integrasi `name`/`required`/FormData. Jangan menambahkan ikon panah lain di luarnya. Daftar dirender melalui portal agar tidak terpotong kartu atau dialog.
- Gunakan `ui-label` untuk label formulir dan hubungkan label dengan input atau letakkan input di dalam label.
- Panel memakai `ui-card` dengan radius 16 px, batas netral, dan bayangan ringan. Padding standar 20 px; dialog memakai `ui-dialog-panel`.
- Judul halaman memakai `ui-page-title`. Banner memakai `PortalHeader` dengan warna dan tipografi bersama.
- Gunakan `ui-table` untuk tabel biasa, dibungkus area `overflow-x-auto` bila kolomnya banyak. `cbt-table` dipertahankan untuk tabel portal guru yang berubah menjadi kartu di mobile.
- Pesan kesalahan memakai `ui-notice ui-notice-error` dan `role="alert"`. Pesan sukses memakai `ui-notice-success`, perhatian memakai `ui-notice-warning`.
- Hindari warna kategori tambahan, bayangan besar, dan gerakan kartu saat hover. Preferensi reduced motion dihormati.

## Responsivitas

Lebar konten maksimum 1200 px. Konten menumpuk pada mobile, berkembang pada 640 px, dan navigasi desktop mulai 1024 px. Menu mobile dapat digulir pada layar pendek. Halaman pengerjaan ujian tetap memakai layar khusus dengan navigasi soal yang menyesuaikan ukuran layar.

Pemeriksaan manual sebelum rilis: layar 360–390 px dan desktop; keyboard pada input/essay; tabel panjang; dialog panjang dan bertumpuk; navigasi Tab/Shift+Tab/Escape; serta fokus dan fullscreen selama ujian.
