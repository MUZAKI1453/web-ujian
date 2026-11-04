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

## Memperbarui database yang sudah dipakai

Hentikan backend lama, cadangkan database, lalu jalankan dari root repository sebelum menjalankan backend versi baru.

```powershell
npm exec -w backend -- prisma db execute --schema prisma/schema.prisma --file prisma/remove-grades.sql
npm run db:generate
```

Skrip menyalin penugasan per tingkat ke setiap kelas yang saat ini termasuk dalam tingkat tersebut, menghapus kolom tingkat, dan membuat tabel pengaturan navbar. Pada database baru, gunakan `npm run db:push` seperti langkah instalasi lokal.

Halaman yang tersedia: login, dashboard admin, kelas, siswa, guru, dan mata pelajaran. Menu monitoring, ganti password, dan portal guru/siswa belum memiliki implementasi halaman dalam repository ini.
