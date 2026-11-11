-- CreateTable
CREATE TABLE `kelas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_kelas` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `kelas_nama_kelas_key`(`nama_kelas`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `sesi_login` VARCHAR(191) NULL,
    `role` VARCHAR(20) NOT NULL,
    `nama` VARCHAR(100) NULL,
    `kelas_id` INTEGER NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_kelas_id_idx`(`kelas_id`),
    INDEX `users_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mapel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(100) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guru_mapel_kelas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guru_id` INTEGER NOT NULL,
    `mapel_id` INTEGER NOT NULL,
    `kelas_id` INTEGER NOT NULL,

    INDEX `guru_mapel_kelas_guru_id_idx`(`guru_id`),
    UNIQUE INDEX `guru_mapel_kelas_mapel_id_kelas_id_key`(`mapel_id`, `kelas_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jenis_ujian` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(150) NOT NULL,
    `profil` VARCHAR(24) NOT NULL DEFAULT 'standar',

    UNIQUE INDEX `jenis_ujian_nama_key`(`nama`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ujian` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `judul` VARCHAR(150) NOT NULL,
    `jenis_ujian_id` INTEGER NULL,
    `mapel_id` INTEGER NOT NULL,
    `kelas_id` INTEGER NOT NULL,
    `waktu_mulai` DATETIME(3) NOT NULL,
    `waktu_selesai` DATETIME(3) NOT NULL,
    `durasi_menit` INTEGER NOT NULL DEFAULT 60,
    `guru_id` INTEGER NULL,
    `draf` BOOLEAN NOT NULL DEFAULT false,
    `profil` VARCHAR(24) NOT NULL DEFAULT 'standar',
    `tujuan_rekap` VARCHAR(24) NOT NULL DEFAULT 'buku-nilai',
    `diarsipkan_pada` DATETIME(3) NULL,
    `kkm` DECIMAL(5, 2) NULL,
    `ujian_asal_id` INTEGER NULL,
    `token` VARCHAR(6) NULL,
    `masuk_buka` BOOLEAN NOT NULL DEFAULT true,
    `poin_khusus` JSON NULL,
    `hasil_rilis` BOOLEAN NOT NULL DEFAULT false,
    `bahasan_rilis` BOOLEAN NOT NULL DEFAULT false,
    `revisi_nilai` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ujian_ujian_asal_id_key`(`ujian_asal_id`),
    INDEX `ujian_kelas_id_draf_idx`(`kelas_id`, `draf`),
    INDEX `ujian_mapel_id_idx`(`mapel_id`),
    INDEX `ujian_guru_id_idx`(`guru_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ujian_id` INTEGER NOT NULL,
    `tipeSoal` VARCHAR(20) NOT NULL,
    `pertanyaan` TEXT NOT NULL,
    `isi` JSON NULL,
    `pilihan_opsi` JSON NULL,
    `kunci_jawaban` VARCHAR(10) NULL,
    `bobot` DECIMAL(7, 4) NOT NULL DEFAULT 1.0,
    `dibatalkan` BOOLEAN NOT NULL DEFAULT false,
    `semua_benar` BOOLEAN NOT NULL DEFAULT false,

    INDEX `soal_ujian_id_idx`(`ujian_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jawaban_siswa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `siswa_id` INTEGER NOT NULL,
    `ujian_id` INTEGER NOT NULL,
    `detail_jawaban` JSON NULL,
    `koreksi_essay` JSON NULL,
    `rincian_nilai` JSON NULL,
    `nilai_pg` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `nilai_essay` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `total_nilai` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `waktu_submit` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `jawaban_siswa_ujian_id_siswa_id_idx`(`ujian_id`, `siswa_id`),
    INDEX `jawaban_siswa_siswa_id_idx`(`siswa_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesi_susulan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ujian_id` INTEGER NOT NULL,
    `waktu_mulai` DATETIME(3) NOT NULL,
    `waktu_selesai` DATETIME(3) NOT NULL,
    `token` VARCHAR(6) NULL,
    `masuk_buka` BOOLEAN NOT NULL DEFAULT true,

    INDEX `sesi_susulan_ujian_id_idx`(`ujian_id`),
    UNIQUE INDEX `sesi_susulan_id_ujian_id_key`(`id`, `ujian_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `peserta_susulan` (
    `sesi_id` INTEGER NOT NULL,
    `siswa_id` INTEGER NOT NULL,

    PRIMARY KEY (`sesi_id`, `siswa_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pengerjaan_ujian` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ujian_id` INTEGER NOT NULL,
    `siswa_id` INTEGER NOT NULL,
    `sesi_susulan_id` INTEGER NULL,
    `mulai` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `batas_waktu` DATETIME(3) NOT NULL,
    `waktu_kirim` DATETIME(3) NULL,
    `versi_jawaban` INTEGER NOT NULL DEFAULT 0,
    `jawaban_tersimpan` JSON NULL,
    `kiriman_offline` JSON NULL,
    `diterima_offline` DATETIME(3) NULL,

    INDEX `pengerjaan_ujian_sesi_susulan_id_idx`(`sesi_susulan_id`),
    UNIQUE INDEX `pengerjaan_ujian_ujian_id_siswa_id_key`(`ujian_id`, `siswa_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kegiatan_ujian` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ujian_id` INTEGER NOT NULL,
    `pelaku_id` INTEGER NOT NULL,
    `jenis` VARCHAR(191) NOT NULL,
    `alasan` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'selesai',
    `data` JSON NULL,
    `waktu` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `kegiatan_ujian_ujian_id_id_idx`(`ujian_id`, `id`),
    INDEX `kegiatan_ujian_status_id_idx`(`status`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifikasi_ujian` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ujian_id` INTEGER NOT NULL,
    `siswa_id` INTEGER NOT NULL,
    `jenis` VARCHAR(191) NOT NULL,
    `waktu` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dibaca` BOOLEAN NOT NULL DEFAULT false,

    INDEX `notifikasi_ujian_siswa_id_dibaca_idx`(`siswa_id`, `dibaca`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `percobaan_token` (
    `siswa_id` INTEGER NOT NULL,
    `ujian_id` INTEGER NOT NULL,
    `salah` INTEGER NOT NULL DEFAULT 0,
    `tunggu_sampai` DATETIME(3) NULL,

    PRIMARY KEY (`siswa_id`, `ujian_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `navbar_settings` (
    `id` INTEGER NOT NULL,
    `text` VARCHAR(60) NOT NULL,
    `logo` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_KelasTujuanUjian` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_KelasTujuanUjian_AB_unique`(`A`, `B`),
    INDEX `_KelasTujuanUjian_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_PesertaRemedial` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_PesertaRemedial_AB_unique`(`A`, `B`),
    INDEX `_PesertaRemedial_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_kelas_id_fkey` FOREIGN KEY (`kelas_id`) REFERENCES `kelas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guru_mapel_kelas` ADD CONSTRAINT `guru_mapel_kelas_guru_id_fkey` FOREIGN KEY (`guru_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guru_mapel_kelas` ADD CONSTRAINT `guru_mapel_kelas_mapel_id_fkey` FOREIGN KEY (`mapel_id`) REFERENCES `mapel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guru_mapel_kelas` ADD CONSTRAINT `guru_mapel_kelas_kelas_id_fkey` FOREIGN KEY (`kelas_id`) REFERENCES `kelas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ujian` ADD CONSTRAINT `ujian_jenis_ujian_id_fkey` FOREIGN KEY (`jenis_ujian_id`) REFERENCES `jenis_ujian`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ujian` ADD CONSTRAINT `ujian_ujian_asal_id_fkey` FOREIGN KEY (`ujian_asal_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ujian` ADD CONSTRAINT `ujian_guru_id_fkey` FOREIGN KEY (`guru_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ujian` ADD CONSTRAINT `ujian_mapel_id_fkey` FOREIGN KEY (`mapel_id`) REFERENCES `mapel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ujian` ADD CONSTRAINT `ujian_kelas_id_fkey` FOREIGN KEY (`kelas_id`) REFERENCES `kelas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soal` ADD CONSTRAINT `soal_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jawaban_siswa` ADD CONSTRAINT `jawaban_siswa_siswa_id_fkey` FOREIGN KEY (`siswa_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jawaban_siswa` ADD CONSTRAINT `jawaban_siswa_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sesi_susulan` ADD CONSTRAINT `sesi_susulan_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `peserta_susulan` ADD CONSTRAINT `peserta_susulan_sesi_id_fkey` FOREIGN KEY (`sesi_id`) REFERENCES `sesi_susulan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `peserta_susulan` ADD CONSTRAINT `peserta_susulan_siswa_id_fkey` FOREIGN KEY (`siswa_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pengerjaan_ujian` ADD CONSTRAINT `pengerjaan_ujian_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pengerjaan_ujian` ADD CONSTRAINT `pengerjaan_ujian_siswa_id_fkey` FOREIGN KEY (`siswa_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pengerjaan_ujian` ADD CONSTRAINT `pengerjaan_ujian_sesi_susulan_id_ujian_id_fkey` FOREIGN KEY (`sesi_susulan_id`, `ujian_id`) REFERENCES `sesi_susulan`(`id`, `ujian_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kegiatan_ujian` ADD CONSTRAINT `kegiatan_ujian_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifikasi_ujian` ADD CONSTRAINT `notifikasi_ujian_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifikasi_ujian` ADD CONSTRAINT `notifikasi_ujian_siswa_id_fkey` FOREIGN KEY (`siswa_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_KelasTujuanUjian` ADD CONSTRAINT `_KelasTujuanUjian_A_fkey` FOREIGN KEY (`A`) REFERENCES `kelas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_KelasTujuanUjian` ADD CONSTRAINT `_KelasTujuanUjian_B_fkey` FOREIGN KEY (`B`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_PesertaRemedial` ADD CONSTRAINT `_PesertaRemedial_A_fkey` FOREIGN KEY (`A`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_PesertaRemedial` ADD CONSTRAINT `_PesertaRemedial_B_fkey` FOREIGN KEY (`B`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

