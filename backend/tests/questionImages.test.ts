import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbt-gambar-'));
process.env.UPLOAD_DIR = dir;

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('gambar data URI disimpan sebagai file bernama hash dan soal memuat alamatnya', async () => {
    const { hasDataImage, isDataImage, isMediaPath, storeQuestionImages } = await import('../src/routes/questionImages');
    assert.equal(isDataImage(png), true);
    assert.equal(isDataImage('data:image/svg+xml;base64,AAAA'), false);
    assert.equal(isMediaPath('/media/soal/../../etc/passwd'), false);
    const isi = { gambar: png, items: [{ teks: 'a', benar: true, gambar: png }, { teks: 'b', benar: false, gambar: '' }, { teks: 'c', benar: false }] };
    assert.equal(hasDataImage(isi), true);
    const stored = await storeQuestionImages(isi);
    assert.equal(isMediaPath(stored.gambar), true);
    assert.equal(stored.items[0].gambar, stored.gambar);
    assert.deepEqual(stored.items.slice(1), isi.items.slice(1));
    assert.equal(stored.items[0].benar, true);
    assert.equal(hasDataImage(stored), false);
    const file = path.join(dir, stored.gambar.replace('/media/', ''));
    assert.deepEqual(fs.readFileSync(file), Buffer.from(png.split(',')[1], 'base64'));
    assert.deepEqual(fs.readdirSync(path.join(dir, 'soal')).length, 1);
    // Menyimpan ulang tidak mengubah apa pun.
    assert.deepEqual(await storeQuestionImages(stored), stored);
    assert.deepEqual(await storeQuestionImages({ jawaban: ['x'], gambar: '' }), { jawaban: ['x'], gambar: '' });
    fs.rmSync(dir, { recursive: true });
});
