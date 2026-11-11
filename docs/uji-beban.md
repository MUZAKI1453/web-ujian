# Uji Beban

Skrip uji beban meniru halaman pengerjaan siswa: login → daftar ujian → siapkan → mulai → menjawab sambil autosave dan heartbeat → kumpulkan serentak di akhir. Tidak butuh alat tambahan selain Node.js 20+.

## Langkah

1. **Cadangkan database**, lalu pastikan tidak ada ujian sungguhan yang sedang berlangsung. Uji beban membebani server yang sama.
2. Di server (folder kode, dengan `.env` instalasi yang diuji), siapkan data uji. Password akun uji bebas, minimal 8 karakter:

   ```bash
   UJI_BEBAN_PASSWORD='ganti-ini-123' npm run uji-beban:siapkan -- --siswa 500 --soal 40 --menit 60
   ```

   Ini membuat kelas dan mapel bernama `UJI-BEBAN`, akun siswa `ub00001`…, dan satu ujian terbit tanpa token dengan pengacakan aktif.
3. Dari **komputer lain** di jaringan yang sama dengan siswa (bukan dari server), jalankan:

   ```bash
   UJI_BEBAN_PASSWORD='ganti-ini-123' npm run uji-beban:jalankan -- --url https://cbt.contoh.sch.id --siswa 500 --menit 10
   ```

   Pilihan: `--naik <detik>` lama menaikkan jumlah siswa (bawaan 10 siswa/detik; batas login server 1500/menit per IP), `--jeda <detik>` rata-rata jarak antarjawaban (bawaan 20).
4. Selama berjalan, pantau di server: CPU dan memori (`top`), log aplikasi (`journalctl -u cbt@smp -f`), dan koneksi database (`SHOW PROCESSLIST`).
5. Hapus data uji:

   ```bash
   npm run uji-beban:hapus
   ```

## Membaca hasil

Skrip mencetak jumlah permintaan, kegagalan, dan waktu respons (p50/p95/p99/maks) per langkah, lalu `HASIL: LULUS` bila semua siswa berhasil mengumpulkan, kegagalan di bawah 1%, dan p95 autosave di bawah 2 detik.

- Kegagalan `500` pada **mulai** atau **kumpulkan**: lihat log aplikasi; biasanya konflik kunci database atau pool koneksi habis (`connection_limit` di `DATABASE_URL`).
- Kegagalan `429` pada **login**: `--naik` terlalu cepat untuk batas login per IP.
- `timeout`/`jaringan`: server atau jaringan tidak sanggup; turunkan jumlah siswa sampai lulus untuk mengetahui kapasitas aman, lalu bagi peserta per sesi.

## Hasil percobaan lokal (11 November 2026)

Dijalankan di laptop pengembang (MySQL 9.7 lokal, server dan penguji di mesin yang sama), **bukan** di server sekolah. Angka ini hanya membuktikan alurnya benar di bawah beban, bukan kapasitas server.

| Skenario | Permintaan | Gagal | p95 autosave | p95 kumpulkan |
|---|---|---|---|---|
| 150 siswa, naik 5 detik, 1 menit | 2.020 | 0 | 17 ms | 23 ms |
| 500 siswa, naik 50 detik, 1 menit | 7.162 | 0 | 12 ms | 289 ms |

Percobaan pertama menemukan dua deadlock database yang sudah diperbaiki di `backend/src/routes/studentExamRoutes.ts`:

- **Kumpul bersamaan** (9 dari 69 kiriman dijawab 500): transaksi pengumpulan memegang kunci baca baris ujian lalu menaikkannya menjadi kunci tulis. Kini kunci tulis diambil sejak awal.
- **Mulai bersamaan** (12 dari 150 siswa gagal mulai): kunci celah indeks `pengerjaan_ujian` pada isolasi bawaan. Kini transaksi siswa memakai READ COMMITTED.
- Transaksi siswa juga diulang otomatis hingga tiga kali bila database melaporkan deadlock.
