# Perbandingan keamanan ujian siswa

Tanggal pemeriksaan: 5 November 2026.

## Pembaruan implementasi

Setelah riset awal di bawah, pengamanan telah diterapkan: fullscreen melalui aksi
siswa, deteksi perpindahan tab/jendela dan keluar fullscreen, deteksi perubahan
lebar layar, peringatan dengan konfirmasi, dan pencatatan per pengerjaan di server.
Guru dapat menetapkan batas 1–10 sebelum pengerjaan dimulai. Bawaan 3, termasuk
untuk pengaturan lama. Batas 0 mencatat pelanggaran tanpa memicu pengumpulan otomatis.
Laporan idempotent dan disimpan di antrean lokal saat offline. Guru dapat melihat
hitungan dan rincian di **Sesi & Peserta**. Endpoint persiapan baru memberikan izin
masuk. Soal dikirim saat server memulai pengerjaan.

Tombol Back menutup dialog teratas atau kembali dari halaman detail. Saat ujian
aktif, tombol ini menutup daftar soal atau menampilkan petunjuk pengumpulan tanpa
meninggalkan halaman. Jika aplikasi sudah tersimpan di cache, siswa dapat memuat
ulang tab yang sama saat offline dan membuka pengerjaan dari IndexedDB. Timer tetap
mengacu pada batas waktu dari server. Tabel berikut mencatat keadaan saat riset awal.

Sumber lama: `C:\Users\ijaaal\Downloads\CBT_Sekolah-main.zip`, terutama
`CBT_Sekolah/routes/siswa_routes.py` dan `CBT_Sekolah/templates/siswa/ujian.html`.
Sumber baru: `backend/src/routes/studentExamRoutes.ts`, `backend/src/middleware/auth.ts`,
`backend/src/controllers/authController.ts`, `backend/src/routes/guruRoutes.ts`,
dan `frontend/src/pages/siswa/`.

## Ruang lingkup dan batas pemeriksaan

Perbandingan dilakukan melalui pembacaan kode. Database lokal dapat diakses dan
berisi 0 akun siswa serta 0 ujian terbit saat diperiksa. Browser lokal mengalami
timeout; login siswa, fullscreen, dan pengiriman jawaban belum diuji langsung.
Tidak ada perubahan pada kebijakan keamanan atau data ujian dalam pemeriksaan ini.

## Perbandingan

| Pengamanan | Proyek lama | Proyek sekarang |
| --- | --- | --- |
| Fullscreen | Diminta saat mulai dan lanjut setelah peringatan; kegagalan tidak menghentikan ujian | Belum diterapkan |
| Pindah tab/aplikasi | `visibilitychange`, `blur` dengan toleransi 500 ms, serta `fullscreenchange` | `visibilitychange` menampilkan peringatan yang dapat ditutup |
| Batas pelanggaran | Tiga kejadian memicu pengiriman form dari browser | Belum ada penghitung atau pencatatan pelanggaran siswa |
| Persistensi pelanggaran | Variabel JavaScript kembali nol saat reload; penanda ban ditulis tetapi dihapus saat inisialisasi | Belum diterapkan |
| Split screen | Overlay berdasarkan rasio ukuran jendela; tinggi mendapat pengecualian ketika mengetik | Belum diterapkan |
| Tombol dan klik kanan | Mencoba memblokir beberapa shortcut dan context menu | Belum diterapkan |
| Layar tetap menyala | Meminta Wake Lock jika tersedia | Belum diterapkan |
| Urutan soal | PG dan essay diacak konsisten berdasarkan siswa dan ujian; opsi tetap urut | Berdasarkan ID soal, tanpa pengacakan per siswa |
| Kontrol akses ujian | Rute siswa memeriksa role dan jadwal; tidak ada pemeriksaan kelas/token pada rute yang diperiksa | Server memeriksa role, kelas/penugasan susulan, jadwal, akses masuk, serta token |
| Percobaan token | Tidak ada pada rute siswa yang diperiksa | Lima token salah menyebabkan jeda satu menit |
| Sesi login siswa | Tidak ditemukan pembatasan sesi pada rute siswa yang diperiksa | Login baru mengganti sesi; permintaan dengan sesi lama ditolak |
| Batas waktu | Berdasarkan waktu selesai jadwal, toleransi submit dua menit; durasi individual tidak digunakan di rute siswa | Deadline individual disimpan di server dan dibatasi waktu selesai sesi |
| Jawaban | LocalStorage dan submit form | IndexedDB, sinkronisasi berkala, validasi format/versi di server, transaksi database |
| Kiriman terlambat | POST diterima dalam toleransi jadwal | Antrean versi baru dalam lima menit ditahan untuk tinjauan guru, bukan langsung menjadi nilai |
| Kunci jawaban | Koreksi PG di server | Respons pengerjaan memuat teks/gambar opsi tanpa kunci; penilaian di server |

## Temuan yang perlu didahulukan

1. **Isi soal tersedia sebelum timer dimulai.** Endpoint `siapkan` mengirim
   `publicQuestions(exam)`, tetapi pengerjaan dan deadline baru dibuat pada `mulai`.
   UI belum menampilkan soal saat persiapan, tetapi respons tersebut sudah dapat
   dibaca oleh klien yang sah. Masa berlaku izin tiga menit tidak mengatasi hal ini
   karena persiapan dapat diulang selama akses sesi masih dibuka. Mulai deadline
   ketika isi soal pertama kali diberikan, atau ubah persiapan agar hanya mengirim
   metadata yang tidak membocorkan isi soal.

2. **Anti-pindah aplikasi belum setara dengan referensi.** Tambahkan alur mulai,
   permintaan fullscreen sesuai dukungan browser, peringatan yang jelas, dan log
   kejadian yang dikaitkan dengan ID pengerjaan di server. Penghitungan server
   mempertahankan kejadian yang diterima saat reload, tetapi tidak menjamin browser
   yang dimodifikasi akan mengirim semua kejadian. Hindari menganggap deteksi ini
   sebagai bukti pasti kecurangan.

3. **Preview admin berbeda dari siswa sebenarnya.** Admin melewati token dan
   memakai waktu selesai sesi sebagai deadline. Pengujian token, kelas, durasi,
   dan sesi login harus memakai akun siswa sungguhan dalam lingkungan uji.

4. **Pengacakan per siswa belum ada.** Jika ditambahkan, simpan urutan per
   pengerjaan agar reload dan sinkronisasi tidak mengubah pemetaan jawaban.

5. **Antrean offline tetap memerlukan tinjauan.** Server tidak memiliki bukti
   pasti kapan perubahan jawaban dibuat ketika perangkat offline. Pertahankan
   pemisahan kiriman terlambat dan jawaban yang diterima sebelum deadline.

## Batas pengamanan browser

Fullscreen memerlukan interaksi pengguna dan bergantung pada dukungan serta
kebijakan browser. Fullscreen tidak mengunci seluruh sistem operasi. Perubahan
visibilitas bisa terjadi ketika tab ditinggalkan, jendela diminimalkan, atau layar
dimatikan. Ukuran jendela dan kehilangan fokus merupakan sinyal, bukan bukti
pasti split screen atau kecurangan. Detektor sisi klien tidak mengamati perangkat
kedua dan bukan pengganti pengawasan ujian.

Rujukan primer:

- [MDN: requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
- [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [WHATWG: Fullscreen Standard](https://fullscreen.spec.whatwg.org/)

## Pengujian lanjutan

Gunakan akun siswa uji dan ujian uji untuk memeriksa: akses kelas lain, lima token
salah, persiapan sebelum timer, reload, login kedua, perpindahan tab, fullscreen
ditolak/tidak didukung, keyboard HP, jaringan putus, deadline server, antrean
terlambat, serta perubahan jawaban setelah pengumpulan. Belum dijalankan dalam
pemeriksaan ini.
# Skor risiko per ujian

Di **Sesi & Peserta → Pengaturan risiko ujian**, guru dapat mengatur bobot kejadian sebelum peserta mulai. Bobot `0` menonaktifkan pencatatan kejadian tersebut. Bobot bawaan adalah `2` untuk pindah tab, kehilangan fokus, keluar dari layar penuh, dan dugaan layar terbagi. Salin, tempel, klik kanan, dan cetak memiliki bobot bawaan `1`. Skor adalah jumlah bobot kejadian yang tercatat untuk pengerjaan aktif. Guru dapat membuka detailnya di kolom **Keamanan**.

Kejadian salin, tempel, klik kanan, dan cetak dicatat untuk tinjauan. Pengulangan jenis yang sama dibatasi sekali per 10 detik. Tiga gangguan fokus atau layar yang aktif tetap memicu aturan pengumpulan otomatis yang sudah berlaku. Bobot hanya memengaruhi skor tinjauan. Pembatasan antarmuka seperti fullscreen dan pemblokiran pintasan tetap berlaku sesuai dukungan browser.

Browser biasa hanya mengamati sinyal yang tersedia bagi halaman. Browser tidak bisa melihat ponsel kedua, kamera eksternal, percakapan di ruangan, atau semua cara mengambil gambar layar. Perubahan fokus dan ukuran jendela juga dapat terjadi karena alasan yang sah. Gunakan catatan sebagai bahan tinjauan bersama konteks ujian.

## Ujian berisiko tinggi pada perangkat Android sekolah

Untuk perangkat milik sekolah yang dikelola, gunakan kebijakan Android Enterprise **lock task mode** melalui EMM atau pengendali kebijakan perangkat. Siapkan aplikasi browser kiosk yang diizinkan dan arahkan ke URL HTTPS portal ujian. Batasi navigasi ke origin portal dan origin layanan yang dibutuhkan, lalu uji login, fullscreen atau perilaku layar yang setara, pemuatan gambar, putus-sambung koneksi, pengumpulan, dan prosedur keluar untuk pengawas. Terapkan lebih dulu di perangkat uji sekolah. Mode ini dipasang pada perangkat melalui EMM. Portal web tidak mengaktifkannya dari browser biasa. [Panduan Android Enterprise](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode)

Jika memakai Safe Exam Browser, penerapan yang mewajibkan klien tersebut memerlukan validasi konfigurasi di server. Validasi itu belum tersedia di aplikasi ini. [Dokumentasi integrasi SEB](https://www.safeexambrowser.org/developer/seb-integration.html)

Deteksi login ganda, perubahan perangkat atau jaringan, jeda heartbeat, waktu jawab sangat singkat, indikasi manipulasi, dan analisis kemiripan jawaban belum masuk skor. Validasi deadline di server tetap berlaku. Perubahan alamat IP dan jeda koneksi dapat berasal dari perpindahan jaringan yang normal dan perlu konteks sebelum ditinjau.

## Membatalkan pelanggaran

Di **Sesi & Peserta → kolom Keamanan**, guru dapat membatalkan satu kejadian yang ternyata bukan kecurangan, misalnya telepon masuk atau notifikasi di HP. Alasan tertulis wajib diisi (5 sampai 300 karakter). Kejadian tidak dihapus: ia tetap tampil dengan tanda dibatalkan beserta alasannya, tidak lagi dihitung dalam batas pelanggaran maupun skor risiko, dan pembatalannya masuk **Log Audit** sebagai `batalkan-pelanggaran`.

Hitungan di perangkat siswa mengikuti server pada sinkronisasi berikutnya (paling lama sekitar 35 detik). Pembatalan tidak membuka kembali pengerjaan yang sudah dikumpulkan otomatis; untuk itu gunakan reset pengerjaan. Pembatalan tidak dapat diurungkan.

## Pengawas ujian

Guru pemilik ujian atau admin menunjuk pengawas di **Sesi & Peserta → Pengawas ujian**: pilih akun guru dan kelas yang diawasinya. Staf non-guru cukup dibuatkan akun guru tanpa mata pelajaran. Guru yang ditugaskan membuka menu **Pengawasan**.

Pengawas dapat:
- melihat peserta kelas yang ditugaskan: status pengerjaan, jumlah soal terisi, tersambung atau terputus, dan pelanggaran;
- melihat token sesi serta membuka dan menutup akses masuk (berlaku untuk seluruh sesi, bukan per kelas);
- membatalkan pelanggaran dengan alasan tertulis, tercatat di Log Audit dengan peran `pengawas`;
- menulis catatan kejadian yang terbaca guru pemilik ujian.

Pengawas tidak dapat melihat soal, kunci, isi jawaban, dan nilai, serta tidak dapat mengganti token, mereset pengerjaan, atau mengakhiri sesi. Server tidak mengirim data itu ke panel pengawas; pembatasannya bukan sekadar disembunyikan di tampilan.

Penanda tersambung/terputus berasal dari kontak terakhir perangkat siswa (paling lama sekitar 35 detik sekali) dan hanya disimpan di memori server, jadi kosong sesaat setelah server dimulai ulang.
