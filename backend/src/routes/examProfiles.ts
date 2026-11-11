export const examProfiles = ['standar', 'latihan-kuis', 'ulangan-harian', 'tengah-semester', 'akhir-semester', 'ujian-sekolah', 'tryout', 'latihan-osn'] as const;

export function validExamProfile(value: unknown): value is typeof examProfiles[number] {
    return typeof value === 'string' && examProfiles.some(profile => profile === value);
}

export function examProfileSettings(profil = 'standar', masukBukuNilai = false) {
    const latihan = profil === 'latihan-kuis';
    const token = latihan ? 'tanpa' : profil === 'ulangan-harian' ? 'opsional' : 'wajib';
    const tujuanRekap = profil === 'tryout' ? 'persiapan' : profil === 'latihan-osn' ? 'talenta'
        : latihan && !masukBukuNilai ? 'latihan' : 'buku-nilai';
    return { profil, token, tujuanRekap, rilisLangsung: latihan };
}

export function parseDraftExamRules(value: unknown) {
    if (!value || typeof value !== 'object') return null;
    const { token, rekap, hasilOtomatis, pembahasanOtomatis } = value as Record<string, unknown>;
    if (token !== 'wajib' && token !== 'opsional' && token !== 'tanpa') return null;
    if (rekap !== 'buku-nilai' && rekap !== 'latihan' && rekap !== 'persiapan' && rekap !== 'talenta') return null;
    if (typeof hasilOtomatis !== 'boolean' || typeof pembahasanOtomatis !== 'boolean') return null;
    // Klien lama tidak mengirim pilihan acak; anggap aktif.
    const { acakSoal = true, acakOpsi = true } = value as Record<string, unknown>;
    if (typeof acakSoal !== 'boolean' || typeof acakOpsi !== 'boolean') return null;
    return {
        acakSoal, acakOpsi,
        profil: token === 'wajib' ? 'standar' : token === 'opsional' ? 'ulangan-harian' : 'latihan-kuis',
        tujuanRekap: rekap,
        hasilRilis: hasilOtomatis,
        bahasanRilis: pembahasanOtomatis
    };
}
