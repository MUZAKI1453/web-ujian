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

## Hasil uji di VPS (11 November 2026)

Dijalankan dari laptop pengembang lewat internet ke `cbt.smaipbaitussalam.sch.id` (VPS 2 vCPU, ±1,9 GB RAM, MariaDB 12.3, `connection_limit=10`). Latensi jaringan penguji ke server ±270 ms per permintaan, jadi angka di bawah sudah termasuk itu; permintaan yang sama dari dalam server selesai dalam ±10 ms. Semua siswa mengumpulkan pada detik yang sama di akhir uji.

| Skenario | Permintaan | Gagal | p50 / p95 autosave | p50 / p95 kumpulkan | Hasil |
|---|---|---|---|---|---|
| 50 siswa, 1 menit | 407 | 0 | 283 / 736 ms | 1,1 / 1,8 dtk | Lulus |
| 200 siswa, 3 menit | 2.810 | 0 | 279 / 862 ms | 7,6 / 8,5 dtk | Lulus |
| 500 siswa, 5 menit | 11.615 | 1.610 (13,9%) | 308 / 1.722 ms | 14,2 / 15,0 dtk | **Tidak lulus** |

Temuan:

- **Tahap mengerjakan sanggup 500 siswa.** Autosave gagal 36 dari 7.598 (0,5%), memori Node tetap di bawah 125 MB, layanan tidak restart.
- **Login serentak membebani CPU.** Pada 10 login/detik kedua core penuh (bcrypt); p95 login 4,2 detik pada 500 siswa. Masuk bertahap per ruang mengurangi ini.
- **Kumpul serentak adalah batasnya.** Pengumpulan diproses satu per satu per ujian (±40 ms tiap kiriman, ±25 kiriman/detik). 200 kiriman serentak selesai dalam ±8,6 detik; pada 500 kiriman antrean melewati batas tunggu koneksi database 8 detik (`P2028`, 1.235 kali) dan hanya 345 dari 500 jawaban tersimpan selama jendela uji. Di aplikasi sungguhan perangkat siswa terus mencoba ulang tiap 2,5 detik dan server mengumpulkan sendiri jawaban tersimpan 5 menit setelah waktu habis, jadi jawaban tidak hilang, tetapi siswa melihat "belum tersimpan" cukup lama.
- Tidak ada jawaban ganda dan tidak ada deadlock.

Kesimpulan sementara: aman sampai ±200 peserta yang mengumpulkan pada saat bersamaan dalam satu ujian. Untuk 500 peserta serentak, bagi per sesi atau perbaiki dulu jalur pengumpulan (kunci baris ujian saat kumpul).

### Perbaikan jalur kumpul (terpasang di VPS)

Dua perubahan di `backend/src/routes/studentExamRoutes.ts`:

1. Transaksi pengumpulan tidak lagi mengubah baris ujian: kunci baris ujian kembali berupa kunci baca, dan penambahan `revisi_nilai` dilakukan setelah transaksi selesai, digabung per detik. Pengumpulan pada detik yang sama berjalan paralel.
2. Bukti kumpul disusun dari data yang sudah dimuat transaksi. Sebelumnya query bukti ikut antre di belakang semua kiriman lain, sehingga setiap respons tertahan sampai antrean habis.

Uji ulang di VPS (500 siswa, naik 50 detik, 5 menit, kumpul serentak):

| | Awal | Perbaikan 1 | Perbaikan 1 + 2 |
|---|---|---|---|
| Permintaan gagal | 1.610 dari 11.615 (13,9%) | 0 dari 10.266 | 1 dari 10.419 (satu `502`) |
| Siswa berhasil mengumpulkan | 209 dari 500 | 500 dari 500 | 500 dari 500 |
| Jawaban tersimpan di database | 345 | 500 | 500 |
| p50 / p95 kumpulkan | 14,2 / 15,0 dtk | 10,8 / 11,1 dtk | 4,4 / 7,5 dtk |
| p50 / p95 autosave | 308 / 1.722 ms | 279 / 2.404 ms | 281 / 4.130 ms |
| p95 login | 4,2 dtk | 4,3 dtk | 0,7 dtk |

- **Kumpul serentak 500 siswa kini berhasil seluruhnya**, selesai dalam ±7,8 detik (±64 kiriman/detik), tanpa galat di log aplikasi, tanpa jawaban ganda, `revisi_nilai` bertambah tepat 500.
- **Skrip tetap mencetak "TIDAK LULUS"** karena p95 autosave melewati ambang 2 detik. Median autosave stabil di ±280 ms (hampir seluruhnya latensi jaringan penguji), tetapi ekornya naik-turun antar-uji (1,7–4,1 detik): pada 500 siswa beban rata-rata server 4–6 pada 2 core, jadi sebagian permintaan menunggu giliran CPU. Ini batas kapasitas server, bukan galat aplikasi.
- Skenario uji lebih berat daripada ujian biasa: tiap siswa menjawab tiap ±20 detik dan semuanya mengumpulkan pada detik yang sama.

Kesimpulan: pada VPS ini 500 peserta serentak tidak kehilangan jawaban dan dapat mengumpulkan, tetapi sebagian penyimpanan terasa lambat (beberapa detik). Untuk respons yang nyaman, batasi ±200–300 peserta serentak per instans atau tambah core CPU.
