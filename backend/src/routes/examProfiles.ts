export const examProfiles = ['standar', 'latihan-kuis', 'ulangan-harian', 'tengah-semester', 'akhir-semester', 'ujian-sekolah', 'tryout', 'latihan-osn'] as const;

export function validExamProfile(value: unknown): value is typeof examProfiles[number] {
    return typeof value === 'string' && examProfiles.some(profile => profile === value);
}

export function examTokenMode(profil: string) {
    return profil === 'latihan-kuis' ? 'tanpa' : profil === 'ulangan-harian' ? 'opsional' : 'wajib';
}

export function parseDraftExamRules(value: unknown) {
    if (!value || typeof value !== 'object') return null;
    const { token, hasilOtomatis, pembahasanOtomatis } = value as Record<string, unknown>;
    if (token !== 'wajib' && token !== 'opsional' && token !== 'tanpa') return null;
    if (typeof hasilOtomatis !== 'boolean' || typeof pembahasanOtomatis !== 'boolean') return null;
    // Klien lama tidak mengirim pilihan acak; anggap aktif.
    const { acakSoal = true, acakOpsi = true } = value as Record<string, unknown>;
    if (typeof acakSoal !== 'boolean' || typeof acakOpsi !== 'boolean') return null;
    return {
        acakSoal, acakOpsi,
        profil: token === 'wajib' ? 'standar' : token === 'opsional' ? 'ulangan-harian' : 'latihan-kuis',
        hasilRilis: hasilOtomatis,
        bahasanRilis: pembahasanOtomatis
    };
}
