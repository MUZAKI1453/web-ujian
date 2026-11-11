import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { object } from './examGrading';

// Gambar soal disimpan sebagai file, bukan base64 di dalam JSON soal, agar tidak ikut di setiap query
// dan bisa di-cache browser. Nama file adalah hash isinya: gambar yang sama hanya tersimpan sekali,
// salinan soal (duplikat, remedial) memakai file yang sama, dan alamatnya tidak bisa ditebak.
export const mediaDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
const questionDir = path.join(mediaDir, 'soal');
const extensions: Record<string, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
const dataImage = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;
const mediaPath = /^\/media\/soal\/[0-9a-f]{64}\.(?:png|jpg|webp|gif)$/;

export const MAX_IMAGE_DATA_URI = 700000;

export function isDataImage(value: string) {
    return value.length <= MAX_IMAGE_DATA_URI && dataImage.test(value);
}

export function isMediaPath(value: string) {
    return mediaPath.test(value);
}

export async function storeImage(value: string): Promise<string> {
    const match = dataImage.exec(value);
    if (!match) return value;
    const bytes = Buffer.from(match[2], 'base64');
    const name = createHash('sha256').update(bytes).digest('hex') + '.' + extensions[match[1]];
    const file = path.join(questionDir, name);
    try {
        await fs.access(file);
    } catch {
        await fs.mkdir(questionDir, { recursive: true });
        // Tulis ke file sementara lalu ganti nama, agar file setengah jadi tidak pernah tersaji.
        const temporary = file + '.' + process.pid + '.' + Date.now() + '.tmp';
        await fs.writeFile(temporary, bytes, { mode: 0o644 });
        await fs.rename(temporary, file);
    }
    return '/media/soal/' + name;
}

// Mengganti semua gambar data URI di isi soal (gambar soal dan gambar tiap opsi) dengan alamat file.
export async function storeQuestionImages<T>(isi: T): Promise<T> {
    const content = object(isi);
    const out: Record<string, unknown> = { ...content };
    if (typeof content.gambar === 'string') out.gambar = await storeImage(content.gambar);
    if (Array.isArray(content.items)) {
        out.items = await Promise.all(content.items.map(async item => {
            const entry = object(item);
            return typeof entry.gambar === 'string' ? { ...entry, gambar: await storeImage(entry.gambar) } : item;
        }));
    }
    return out as T;
}

export function hasDataImage(isi: unknown) {
    const content = object(isi);
    const inline = (value: unknown) => typeof value === 'string' && value.startsWith('data:');
    return inline(content.gambar) || (Array.isArray(content.items) && content.items.some(item => inline(object(item).gambar)));
}
