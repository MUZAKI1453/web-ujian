import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt } from 'node:crypto';

// Password siswa dibuat sistem dan dicetak di kartu peserta, jadi harus mudah dibaca dan diketik:
// tanpa 0/O dan 1/I/L, selalu memuat huruf agar tidak pernah sama dengan NIS.
const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateStudentPassword() {
    for (;;) {
        let value = '';
        for (let index = 0; index < 6; index++) value += alphabet[randomInt(alphabet.length)];
        if (/[A-Z]/.test(value)) return value;
    }
}

// Siswa sering mengetik huruf kecil atau menambah spasi; password buatan sistem selalu huruf besar.
export function normalizeStudentPassword(input: string) {
    return input.trim().toUpperCase();
}

export function passwordKey(secret: string) {
    return Buffer.from(hkdfSync('sha256', secret, '', 'cbt-sandi-siswa', 32));
}

export function sealPassword(plain: string, key: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

// null bila data rusak atau kunci server sudah berganti; password tetap bisa dipakai login, hanya tidak bisa ditampilkan.
export function openPassword(sealed: string | null | undefined, key: Buffer) {
    if (!sealed) return null;
    try {
        const raw = Buffer.from(sealed, 'base64url');
        if (raw.length < 29) return null;
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

// Pengawas boleh membantu akun siswa sejak satu jam sebelum sesi sampai sesi berakhir.
export function proctorAccessOpen(sessions: { waktuMulai: Date; waktuSelesai: Date }[], now: number) {
    return sessions.some(session => now >= +session.waktuMulai - 3600000 && now <= +session.waktuSelesai);
}
