-- CreateTable
CREATE TABLE `pengawas_ujian` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ujian_id` INTEGER NOT NULL,
    `guru_id` INTEGER NOT NULL,
    `kelas_id` INTEGER NOT NULL,

    INDEX `pengawas_ujian_guru_id_idx`(`guru_id`),
    INDEX `pengawas_ujian_kelas_id_idx`(`kelas_id`),
    UNIQUE INDEX `pengawas_ujian_ujian_id_guru_id_kelas_id_key`(`ujian_id`, `guru_id`, `kelas_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pengawas_ujian` ADD CONSTRAINT `pengawas_ujian_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujian`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pengawas_ujian` ADD CONSTRAINT `pengawas_ujian_guru_id_fkey` FOREIGN KEY (`guru_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pengawas_ujian` ADD CONSTRAINT `pengawas_ujian_kelas_id_fkey` FOREIGN KEY (`kelas_id`) REFERENCES `kelas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
