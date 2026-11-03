export type Value = number | number[] | (boolean | null)[] | string;
export interface Question {
    id: number; tipeSoal: string; pertanyaan: string; gambar?: string;
    items: { teks: string; gambar?: string; benar?: boolean }[];
}
export interface LocalAttempt {
    attemptId: number; deadline: number; offset: number; versi: number; saved: number;
    jawaban: Record<string, Value>; soal: Question[]; ragu: number[]; index: number; send: boolean;
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
