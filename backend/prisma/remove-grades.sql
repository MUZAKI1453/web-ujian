BEGIN;

LOCK TABLE kelas, guru_mapel_kelas IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'guru_mapel_kelas' AND column_name = 'tingkat'
    ) THEN
        INSERT INTO guru_mapel_kelas (guru_id, mapel_id, kelas_id)
        SELECT DISTINCT lama.guru_id, lama.mapel_id, kelas.id
        FROM guru_mapel_kelas AS lama
        JOIN kelas ON kelas.tingkat = lama.tingkat
        WHERE lama.kelas_id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM guru_mapel_kelas AS langsung
              WHERE langsung.guru_id = lama.guru_id
                AND langsung.mapel_id = lama.mapel_id
                AND langsung.kelas_id = kelas.id
          );

        DELETE FROM guru_mapel_kelas WHERE kelas_id IS NULL;
        ALTER TABLE guru_mapel_kelas ALTER COLUMN kelas_id SET NOT NULL, DROP COLUMN tingkat;
        ALTER TABLE kelas DROP COLUMN tingkat;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS navbar_settings (
    id integer PRIMARY KEY,
    text varchar(60) NOT NULL,
    logo text
);

COMMIT;
