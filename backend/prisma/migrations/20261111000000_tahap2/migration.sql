-- Tahap 2: enum role, unique jawaban_siswa, foreign key pelaku/percobaan_token,
-- kolom pengacakan soal, dan tabel audit_log.
-- Cadangkan database sebelum menjalankan migrasi ini.

-- Pembersihan data agar constraint baru bisa dipasang.
-- 1) Jawaban ganda per (ujian, siswa): simpan yang terbaru, sama dengan yang selama ini dipakai aplikasi.
DELETE lama FROM `jawaban_siswa` lama
JOIN `jawaban_siswa` baru
  ON baru.`ujian_id` = lama.`ujian_id` AND baru.`siswa_id` = lama.`siswa_id`
 AND (baru.`waktu_submit` > lama.`waktu_submit` OR (baru.`waktu_submit` = lama.`waktu_submit` AND baru.`id` > lama.`id`));

-- 2) Catatan kegiatan yang pelakunya sudah dihapus: pelaku dikosongkan (dilakukan setelah kolom dibuat nullable di bawah).
-- 3) Percobaan token yatim.
DELETE FROM `percobaan_token`
WHERE `siswa_id` NOT IN (SELECT `id` FROM `users`) OR `ujian_id` NOT IN (SELECT `id` FROM `ujian`);

-- DropForeignKey
ALTER TABLE `jawaban_siswa` DROP FOREIGN KEY `jawaban_siswa_ujian_id_fkey`;

-- DropIndex
DROP INDEX `jawaban_siswa_ujian_id_siswa_id_idx` ON `jawaban_siswa`;

-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('admin', 'guru', 'siswa') NOT NULL;

-- AlterTable
ALTER TABLE `ujian` ADD COLUMN `acak_opsi` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `acak_soal` BOOLEAN NOT NULL DEFAULT true;
-- Ujian yang sudah terbit tidak bisa diubah pengaturannya, jadi tetap memakai urutan asli.
UPDATE `ujian` SET `acak_soal` = false, `acak_opsi` = false WHERE `draf` = false;

-- AlterTable
ALTER TABLE `pengerjaan_ujian` ADD COLUMN `urutan` JSON NULL;

-- AlterTable
ALTER TABLE `kegiatan_ujian` MODIFY `pelaku_id` INTEGER NULL;
UPDATE `kegiatan_ujian` SET `pelaku_id` = NULL WHERE `pelaku_id` NOT IN (SELECT `id` FROM `users`);

-- CreateTable
CREATE TABLE `audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `waktu` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pelaku_id` INTEGER NULL,
    `pelaku` VARCHAR(50) NULL,
    `peran` VARCHAR(20) NULL,
    `aksi` VARCHAR(120) NOT NULL,
    `target` VARCHAR(191) NULL,
    `status` INTEGER NOT NULL DEFAULT 200,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,

    INDEX `audit_log_waktu_idx`(`waktu`),
    INDEX `audit_log_pelaku_id_id_idx`(`pelaku_id`, `id`),
    INDEX `audit_log_aksi_id_idx`(`aksi`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `jawaban_siswa_ujian_id_siswa_id_key` ON `jawaban_siswa`(`ujian_id`, `siswa_id`);

-- CreateIndex
CREATE INDEX `kegiatan_ujian_pelaku_id_idx` ON `kegiatan_ujian`(`pelaku_id`);

-- CreateIndex
CREATE INDEX `percobaan_token_ujian_id_idx` ON `percobaan_token`(`ujian_id`);

-- AddForeignKey
ALTER TABLE `jawaban_siswa` ADD CONSTRAINT `jawaban_siswa_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kegiatan_ujian` ADD CONSTRAINT `kegiatan_ujian_pelaku_id_fkey` FOREIGN KEY (`pelaku_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `percobaan_token` ADD CONSTRAINT `percobaan_token_siswa_id_fkey` FOREIGN KEY (`siswa_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `percobaan_token` ADD CONSTRAINT `percobaan_token_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

