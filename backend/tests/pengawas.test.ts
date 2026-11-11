import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProctorAssignments, parseProctorNote, proctorPanel, type ProctorExam } from '../src/routes/proctoring';

test('proctor assignments accept only classes of the exam and one entry per teacher', () => {
    const classes = [1, 2];
    assert.deepEqual(parseProctorAssignments([], classes), []);
    assert.deepEqual(parseProctorAssignments([{ guruId: 7, kelasIds: [1, 2] }, { guruId: 8, kelasIds: [2] }], classes),
        [{ guruId: 7, kelasIds: [1, 2] }, { guruId: 8, kelasIds: [2] }]);
    for (const input of [null, {}, [{ guruId: 7, kelasIds: [] }], [{ guruId: 7, kelasIds: [3] }], [{ guruId: 7, kelasIds: [1, 1] }],
        [{ guruId: 0, kelasIds: [1] }], [{ guruId: '7', kelasIds: [1] }], [{ guruId: 7, kelasIds: [1] }, { guruId: 7, kelasIds: [2] }],
        [{ guruId: 7 }], Array(101).fill({ guruId: 7, kelasIds: [1] })]) {
        assert.equal(parseProctorAssignments(input, classes), null);
    }
});

test('proctor notes need 5 to 500 characters', () => {
    assert.equal(parseProctorNote('  Listrik padam 5 menit  '), 'Listrik padam 5 menit');
    for (const input of [undefined, 5, 'ya', '    ', 'x'.repeat(501)]) assert.equal(parseProctorNote(input), null);
});

test('proctor panel shows only supervised classes and never scores, answers or keys', () => {
    const time = new Date('2026-11-12T01:00:00.000Z');
    const exam: ProctorExam = {
        id: 5, judul: 'UAS', profil: 'standar', durasiMenit: 90, mapel: { nama: 'Bahasa Arab' },
        token: 'ABC234', masukBuka: true, waktuMulai: time, waktuSelesai: new Date(+time + 7200000), jumlahSoal: 15,
        siswa: [
            { id: 11, nama: 'Ani', username: '1001', kelasId: 1 },
            { id: 12, nama: 'Budi', username: '1002', kelasId: 1 },
            { id: 21, nama: 'Cici', username: '2001', kelasId: 2 },
            { id: 31, nama: 'Tanpa Kelas', username: '3001', kelasId: null }
        ],
        susulan: [{ id: 9, token: null, masukBuka: false, waktuMulai: time, waktuSelesai: time, peserta: [{ siswaId: 12 }] }],
        pengerjaan: [
            { id: 100, siswaId: 11, sesiSusulanId: null, mulai: time, batasWaktu: time, waktuKirim: null, jawabanTersimpan: { 1: 0, 2: [1], 3: 'rahasia' } },
            { id: 200, siswaId: 21, sesiSusulanId: null, mulai: time, batasWaktu: time, waktuKirim: time, jawabanTersimpan: { 1: 2 } }
        ],
        jawaban: [{ siswaId: 21 }],
        pelanggaran: [
            { id: 1, pelakuId: 11, alasan: 'tab-hidden', data: { attemptId: 100, eventId: 'a' }, waktu: time },
            { id: 2, pelakuId: 11, alasan: 'window-blur', data: { attemptId: 100, eventId: 'b', dibatalkan: { oleh: 7, alasan: 'telepon masuk', waktu: time.toISOString() } }, waktu: time },
            { id: 3, pelakuId: 11, alasan: 'copy', data: { attemptId: 100, eventId: 'c' }, waktu: time },
            { id: 4, pelakuId: 11, alasan: 'tab-hidden', data: { attemptId: 99, eventId: 'lama' }, waktu: time },
            { id: 5, pelakuId: 21, alasan: 'tab-hidden', data: { attemptId: 200, eventId: 'd' }, waktu: time }
        ],
        catatan: [{ id: 50, data: { teks: 'Listrik padam 5 menit' }, waktu: time, pelaku: { nama: null, username: 'guru7' } }]
    };
    const panel = proctorPanel(exam, [{ id: 1, namaKelas: '7A' }], 3, id => id === 100 ? 1234 : undefined, +time);

    assert.deepEqual(panel.peserta.map(student => student.id), [11, 12]);
    assert.deepEqual(panel.siswaIds, [11, 12]);
    const ani = panel.peserta[0];
    assert.deepEqual([ani.kelas, ani.sesi, ani.attemptId, ani.terisi, ani.terkirim, ani.kontakTerakhir], ['7A', 'reguler', 100, 3, false, 1234]);
    // Hanya gangguan yang belum dibatalkan dan milik pengerjaan aktif yang dihitung.
    assert.equal(ani.jumlahPelanggaran, 1);
    assert.deepEqual(ani.pelanggaran.map(item => [item.id, item.dibatalkan?.alasan ?? null]), [[1, null], [2, 'telepon masuk'], [3, null]]);
    const budi = panel.peserta[1];
    assert.deepEqual([budi.sesi, budi.attemptId, budi.terisi, budi.terkirim], ['9', null, 0, false]);
    assert.deepEqual(panel.sesi.map(session => [session.key, session.jenis, session.token, session.masukBuka]),
        [['reguler', 'Reguler', 'ABC234', true], ['9', 'Susulan 1', null, false]]);
    assert.deepEqual(panel.catatan, [{ id: 50, teks: 'Listrik padam 5 menit', waktu: time, oleh: 'guru7' }]);

    const text = JSON.stringify(panel);
    for (const forbidden of ['rahasia', 'jawabanTersimpan', 'totalNilai', 'nilai', 'kunci', 'benar', 'Cici']) {
        assert.equal(text.includes(forbidden), false, forbidden + ' tidak boleh ada di panel pengawas');
    }
});
