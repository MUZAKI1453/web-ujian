# Web Ujian

Aplikasi React/Vite dengan backend Express dan MariaDB / MySQL (Prisma).

## Menjalankan lokal

1. Pasang Node.js dan jalankan MariaDB (atau MySQL).
2. Jalankan `npm install` dari root repository.
3. Salin `backend/.env.example` ke `backend/.env` jika belum ada, lalu sesuaikan `DATABASE_URL` dan `JWT_SECRET` (buat dengan `openssl rand -hex 32`). Untuk pengembangan lokal, hapus `NODE_ENV=production` dan kosongkan `TRUST_PROXY`. Contoh berkas untuk server ada di folder `deploy/`: satu salinan kode dijalankan sekali per sekolah (`cbt@smp`, `cbt@sma`) dengan database, secret, dan port masing-masing.
4. Jalankan `npm run db:generate`.
5. Siapkan skema database dengan Prisma Migrate (folder `backend/prisma/migrations`):
   - Database baru/kosong: `npm run db:migrate`, lalu `npm run db:seed`.
   - Database lama yang dulu dibuat dengan `db:push`: cadangkan dulu, jalankan **sekali** `npm run db:baseline` (menandai migrasi `0_awal` sudah terpasang), lalu `npm run db:migrate`.
   - Setiap memperbarui kode: `npm run db:generate` dan `npm run db:migrate`. `db:push` hanya untuk eksperimen di database development.
6. Jalankan `npm run dev`.

Frontend (Development): http://127.0.0.1:5173
Backend / Produksi Terpadu: http://localhost:5000

Untuk menjalankan mode produksi terpadu (Frontend + Backend disajikan bersama dalam 1 port di `5000`):
1. Jalankan `npm run build`
2. Jalankan `npm start`
3. Buka `http://localhost:5000` (atau IP LAN server pada port `5000`).

Untuk membuka aplikasi dari perangkat lain, sambungkan perangkat ke jaringan yang sama lalu buka alamat pada baris **Network** di terminal. Jika Windows Firewall memblokir koneksi, izinkan port frontend yang tercetak di terminal (biasanya 5173) dan port backend 5000 pada jaringan privat.

Password awal siswa adalah NIS, password awal guru adalah NIP, dan akun admin hasil seed memakai username `admin` dengan password `admin123`. Saat login dengan password bawaan, pengguna wajib mengganti password sebelum dapat membuka fitur lain; server menolak permintaan lain sampai password diganti. Gunakan HTTPS untuk frontend dan API saat diakses dari perangkat siswa.

`npm run build` memeriksa TypeScript dan membuat build frontend/backend.

Halaman yang tersedia: login, dashboard admin, kelas, siswa, guru, mata pelajaran, monitoring ujian, dan pengaturan. Menu Pengaturan berisi identitas aplikasi (khusus admin) serta Keamanan untuk mengganti password akun masing-masing.

Portal guru dan siswa mengikuti tampilan referensi CBT Sekolah: banner biru, kartu ringkasan, kartu mata pelajaran, riwayat ujian, dan kartu jadwal siswa. Guru dapat membuat draf, mengedit atau mengimpor soal, menerbitkan ujian, mengelola sesi, serta membuka koreksi dan rekap nilai. Editor mendukung PG, pilihan majemuk, benar/salah, isian, dan essay.

Penugasan guru memakai pilihan beberapa kelas per mata pelajaran. Saat membuat ujian, guru dapat mencentang satu atau beberapa kelas dalam penugasannya; soal, jadwal, dan sesi reguler digunakan bersama oleh semua kelas tujuan. Daftar peserta dan monitoring mencakup seluruh kelas yang dipilih. Jalankan `npm run db:migrate` setelah memperbarui kode untuk menambahkan relasi kelas tujuan; ujian lama tetap memakai kelas awalnya.

Jenis ujian dikelola admin melalui **Data Master → Jenis Ujian** (tambah, edit, hapus). Guru memilih jenis ujian melalui dropdown saat membuat atau mengedit draf, menggantikan judul bebas. Jalankan `npm run db:generate` dan `npm run db:migrate` setelah memperbarui kode untuk menambahkan tabel `jenis_ujian` dan relasinya. Admin perlu mengisi daftar jenis ujian sebelum guru membuat draf. Ujian lama tetap dapat dibuka dengan judul sebelumnya; saat mengedit draf lama, guru wajib memilih jenis ujian. Nama jenis disalin ke judul saat draf disimpan agar perubahan nama master tidak mengubah ujian yang sudah terbit. Jenis yang sudah dipakai tidak dapat dihapus.

Pengujian kelas tujuan: `npm test -w backend`. Untuk menyertakan pemeriksaan database lokal, atur `RUN_DATABASE_TESTS=1` sebelum menjalankannya dari folder backend; data pengujian dibuat dalam transaksi yang dibatalkan setelah selesai.

Siswa dapat memverifikasi token, mengerjakan soal dengan timer, menandai ragu, dan memeriksa ringkasan sebelum mengumpulkan. Navigasi nomor soal tampil di samping pada desktop dan melalui tombol Daftar soal pada HP. Jawaban disimpan di perangkat dan disinkronkan ke server; hasil serta pembahasan tersedia setelah dirilis guru.

Pengamanan ujian diaktifkan lewat tombol **Masuk & Lanjutkan Ujian**. Browser yang mendukungnya meminta fullscreen. Keluar fullscreen, tab tersembunyi, kehilangan fokus jendela lebih dari 750 ms, dan perubahan lebar yang menunjukkan split screen memunculkan peringatan. Kejadian yang bersamaan dihitung sekali sampai siswa melanjutkan. Guru dapat mengubah batas pengumpulan otomatis di **Sesi & Peserta → Pengaturan risiko ujian** sebelum pengerjaan dimulai. Bawaan 3. Pilih 1–10 untuk mengumpulkan pada pelanggaran ke-n, atau 0 untuk mencatat tanpa mengumpulkan otomatis karena pelanggaran. Laporan yang dikirim ulang tidak menambah hitungan. Catatan disimpan per ID pengerjaan dan dapat dilihat melalui **Sesi & Peserta → peserta → Keamanan**. Saat offline, laporan diantrekan di perangkat dan dikirim setelah koneksi kembali. Browser yang tidak mendukung fullscreen tetap memantau visibilitas dan fokus. Dukungan fullscreen, bunyi, dan Wake Lock mengikuti kemampuan browser.

Di Chrome Android, buka alamat ujian melalui HTTPS saat online dan pilih **Instal aplikasi** atau **Tambahkan ke layar utama**. Di Safari iPhone, pilih **Bagikan → Tambahkan ke Layar Utama**, aktifkan **Buka sebagai App Web** jika tersedia, lalu pilih **Tambah**. Buka CBT dari ikon di layar utama. Setelah aplikasi tersimpan di cache, siswa yang sedang mengerjakan dapat memuat ulang tab yang sama saat koneksi putus dan melanjutkan dari jawaban di perangkat. Gambar soal yang sudah dimuat dari server sekolah dapat tampil kembali. Login, memulai ujian baru, dan konfirmasi pengumpulan membutuhkan koneksi. Tombol Back menutup dialog atau kembali dari detail. Saat ujian aktif, aplikasi menutup daftar soal bila terbuka dan mengarahkan siswa untuk memakai tombol **Kumpulkan Ujian**.

Verifikasi token tidak mengirim isi soal. Isi soal pertama kali diberikan saat server memulai pengerjaan dan menetapkan deadline. Pengujian keamanan API memakai data uji tersendiri yang dibersihkan setelah selesai (`RUN_DATABASE_TESTS=1 npm test` dari folder backend).

Portal siswa mengelompokkan ujian berdasarkan status pengerjaan, dengan ujian yang sedang dikerjakan di bagian atas. Tombol Mulai Ujian meminta fullscreen sebelum menghubungi server untuk memulai timer; jika fullscreen tidak didukung, pemantauan fokus dan tab tetap dipakai. Izin fullscreen yang ditolak tidak memulai pengerjaan baru.

Saat mengerjakan, siswa melihat waktu konfirmasi penyimpanan server dan jumlah jawaban yang masih menunggu sinkronisasi, termasuk pengosongan jawaban. Timer tetap berjalan saat offline. Jawaban isian atau essay yang hanya berisi spasi dihitung kosong. Setelah pengumpulan, bukti menampilkan nomor bukti, waktu diterima server, ringkasan jawaban, dan status pengumpulan; bukti juga dapat dibuka lagi dari beranda tanpa menunggu rilis nilai. Kiriman offline setelah deadline ditandai menunggu tinjauan guru.

Pembahasan yang dirilis menampilkan jawaban siswa beserta kunci atau pedoman. Poin dan catatan essay ditampilkan setelah hasil dirilis dan kiriman offline selesai ditinjau. Guru dapat menambahkan catatan opsional saat menyimpan nilai essay. Catatan disimpan bersama koreksi yang sudah ada sehingga tidak memerlukan perubahan skema database.

Menu admin **Log Audit** menampilkan jejak login (berhasil dan gagal), keluar, ganti password, serta setiap perubahan data oleh admin dan guru, lengkap dengan waktu, status, IP, dan perangkat. Catatan disimpan 180 hari. Agar IP yang tercatat adalah IP pengguna, `TRUST_PROXY` harus sesuai jumlah reverse proxy dan proxy harus meneruskan alamat klien asli.

Gambar soal disimpan sebagai file di folder `UPLOAD_DIR` (bawaan `backend/uploads`) dan disajikan di `/media/soal/<hash>.<ext>`; database hanya menyimpan alamatnya. Setelah memperbarui kode, jalankan sekali `npm run build` lalu `npm run db:gambar` untuk memindahkan gambar base64 pada soal lama (aman dijalankan berulang). Folder ini harus ikut dicadangkan bersama database; `deploy/backup-db.sh` sudah menyertakannya. File gambar tidak dihapus otomatis saat soal dihapus.

Uji beban: lihat `docs/uji-beban.md` (`npm run uji-beban:siapkan`, `uji-beban:jalankan`, `uji-beban:hapus`).
