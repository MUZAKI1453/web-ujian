# Web Ujian

Aplikasi React/Vite dengan backend Express dan PostgreSQL (Prisma).

## Menjalankan lokal

1. Pasang Node.js dan jalankan PostgreSQL.
2. Jalankan `npm install` dari root repository.
3. Salin `backend/.env.example` ke `backend/.env` jika belum ada, lalu sesuaikan `DATABASE_URL` dan `JWT_SECRET`.
4. Jalankan `npm run db:generate`.
5. Untuk database development yang baru/kosong, jalankan `npm run db:push`, lalu `npm run db:seed`.
6. Jalankan `npm run dev`.

Frontend: http://127.0.0.1:5173
Backend: http://localhost:5000

Untuk membuka aplikasi dari perangkat lain, sambungkan perangkat ke jaringan yang sama lalu buka alamat pada baris **Network** di terminal. Jika Windows Firewall memblokir koneksi, izinkan port frontend yang tercetak di terminal (biasanya 5173) dan port backend 5000 pada jaringan privat.

Akun admin hasil seed: username `admin`, password `admin123` (untuk development lokal).

`npm run build` memeriksa TypeScript dan membuat build frontend/backend.

Halaman yang tersedia: login, dashboard admin, kelas, siswa, guru, mata pelajaran, monitoring ujian, dan pengaturan. Menu Pengaturan berisi identitas aplikasi (khusus admin) serta Keamanan untuk mengganti password akun masing-masing.

Portal guru dan siswa mengikuti tampilan referensi CBT Sekolah: banner biru, kartu ringkasan, kartu mata pelajaran, riwayat ujian, dan kartu jadwal siswa. Guru dapat membuat draf, mengedit atau mengimpor soal, menerbitkan ujian, mengelola sesi, serta membuka koreksi dan rekap nilai. Editor mendukung PG, pilihan majemuk, benar/salah, isian, dan essay.

Penugasan guru memakai pilihan beberapa kelas per mata pelajaran. Saat membuat ujian, guru dapat mencentang satu atau beberapa kelas dalam penugasannya; soal, jadwal, dan sesi reguler digunakan bersama oleh semua kelas tujuan. Daftar peserta dan monitoring mencakup seluruh kelas yang dipilih. Jalankan `npm run db:push` setelah memperbarui kode untuk menambahkan relasi kelas tujuan; ujian lama tetap memakai kelas awalnya.

Jenis ujian dikelola admin melalui **Data Master → Jenis Ujian** (tambah, edit, hapus). Guru memilih jenis ujian melalui dropdown saat membuat atau mengedit draf, menggantikan judul bebas. Jalankan `npm run db:generate` dan `npm run db:push` setelah memperbarui kode untuk menambahkan tabel `jenis_ujian` dan relasinya. Admin perlu mengisi daftar jenis ujian sebelum guru membuat draf. Ujian lama tetap dapat dibuka dengan judul sebelumnya; saat mengedit draf lama, guru wajib memilih jenis ujian. Nama jenis disalin ke judul saat draf disimpan agar perubahan nama master tidak mengubah ujian yang sudah terbit. Jenis yang sudah dipakai tidak dapat dihapus.

Pengujian kelas tujuan: `npm test -w backend`. Untuk menyertakan pemeriksaan database lokal, atur `RUN_DATABASE_TESTS=1` sebelum menjalankannya dari folder backend; data pengujian dibuat dalam transaksi yang dibatalkan setelah selesai.

Siswa dapat memverifikasi token, mengerjakan soal dengan timer, menandai ragu, dan memeriksa ringkasan sebelum mengumpulkan. Navigasi nomor soal tampil di samping pada desktop dan melalui tombol Daftar soal pada HP. Jawaban disimpan di perangkat dan disinkronkan ke server; hasil serta pembahasan tersedia setelah dirilis guru.

Pengamanan ujian diaktifkan lewat tombol **Masuk & Lanjutkan Ujian**. Browser yang mendukungnya meminta fullscreen; keluar fullscreen, tab tersembunyi, kehilangan fokus jendela lebih dari 750 ms, dan perubahan lebar yang menunjukkan split screen memunculkan peringatan. Kejadian yang bersamaan dihitung sekali sampai siswa melanjutkan. Pada kejadian ketiga, pengerjaan dikumpulkan dan dikunci di server. Laporan yang terkirim ulang tidak menambah hitungan; catatan disimpan per ID pengerjaan dan dapat dilihat guru melalui **Sesi & Peserta → peserta → Keamanan**. Saat offline, laporan diantrekan di perangkat dan dikirim setelah koneksi kembali. Browser yang tidak mendukung fullscreen menampilkan pemberitahuan dan tetap memantau visibilitas/fokus. Dukungan fullscreen, bunyi, dan Wake Lock mengikuti kemampuan browser; ini tidak mengunci sistem operasi atau perangkat kedua.

Verifikasi token tidak mengirim isi soal. Isi soal pertama kali diberikan saat server memulai pengerjaan dan menetapkan deadline. Pengujian keamanan API memakai data uji tersendiri yang dibersihkan setelah selesai (`RUN_DATABASE_TESTS=1 npm test` dari folder backend).

Portal siswa mengelompokkan ujian berdasarkan status pengerjaan, dengan ujian yang sedang dikerjakan di bagian atas. Tombol Mulai Ujian meminta fullscreen sebelum menghubungi server untuk memulai timer; jika fullscreen tidak didukung, pemantauan fokus dan tab tetap dipakai. Izin fullscreen yang ditolak tidak memulai pengerjaan baru.

Saat mengerjakan, siswa melihat waktu konfirmasi penyimpanan server dan jumlah jawaban yang masih menunggu sinkronisasi, termasuk pengosongan jawaban. Timer tetap berjalan saat offline. Jawaban isian atau essay yang hanya berisi spasi dihitung kosong. Setelah pengumpulan, bukti menampilkan nomor bukti, waktu diterima server, ringkasan jawaban, dan status pengumpulan; bukti juga dapat dibuka lagi dari beranda tanpa menunggu rilis nilai. Kiriman offline setelah deadline ditandai menunggu tinjauan guru.

Pembahasan yang dirilis menampilkan jawaban siswa beserta kunci atau pedoman. Poin dan catatan essay ditampilkan setelah hasil dirilis dan kiriman offline selesai ditinjau. Guru dapat menambahkan catatan opsional saat menyimpan nilai essay. Catatan disimpan bersama koreksi yang sudah ada sehingga tidak memerlukan perubahan skema database.
