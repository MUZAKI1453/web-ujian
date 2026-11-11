export type Value = number | number[] | (boolean | null)[] | string;
export type SecurityEvent = { id: string; reason: 'tab-hidden' | 'window-blur' | 'fullscreen-exit' | 'split-screen' | 'copy' | 'paste' | 'context-menu' | 'print' };
export type SecurityWeights = Record<SecurityEvent['reason'], number>;
export interface Question {
    id: number; tipeSoal: string; pertanyaan: string; gambar?: string;
    items: { teks: string; gambar?: string; benar?: boolean }[];
}
export interface LocalAttempt {
    attemptId: number; deadline: number; offset: number; versi: number; saved: number;
    jawaban: Record<string, Value>; soal: Question[]; ragu: number[]; index: number; send: boolean;
    lastSavedAt?: number; savedAnswers?: Record<string, Value>;
    security?: { count: number; pending: SecurityEvent[]; warning?: string };
    securityWeights?: SecurityWeights;
}

let database: Promise<IDBDatabase> | undefined;
function open() {
    return database ??= new Promise((resolve, reject) => {
        const request = indexedDB.open('cbt-siswa', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('pengerjaan');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { database = undefined; reject(request.error); };
    });
}

export async function loadAttempt(key: string): Promise<LocalAttempt | undefined> {
    const db = await open();
    return new Promise((resolve, reject) => {
        const request = db.transaction('pengerjaan').objectStore('pengerjaan').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function storeAttempt(key: string, value: LocalAttempt | null) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('pengerjaan', 'readwrite');
        const store = tx.objectStore('pengerjaan');
        if (value) store.put(value, key);
        else store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error);
    });
}

// Saat keluar, hapus salinan soal dan jawaban yang sudah tersimpan di server agar tidak tertinggal di perangkat bersama.
// Pengerjaan yang masih punya jawaban belum terkirim dipertahankan supaya tidak hilang.
export async function clearSyncedAttempts() {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('pengerjaan', 'readwrite');
        const request = tx.objectStore('pengerjaan').openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const attempt = cursor.value as LocalAttempt;
            if (attempt.versi <= attempt.saved && !attempt.security?.pending.length) cursor.delete();
            cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(tx.error);
    });
}
