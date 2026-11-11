// Aplikasi Android (mobile/, Capacitor) menyuntikkan window.Capacitor ke halaman ini.
// Di browser biasa nativeApp() mengembalikan undefined dan semua jalur native tidak aktif.
type CbtNative = {
    enableExamMode(options: { pin: boolean }): Promise<unknown>;
    disableExamMode(): Promise<unknown>;
    saveFile(options: { name: string; mime: string; data: string }): Promise<unknown>;
};

export function nativeApp(): CbtNative | undefined {
    return (window as { Capacitor?: { Plugins?: { CbtNative?: CbtNative } } }).Capacitor?.Plugins?.CbtNative;
}

// Di aplikasi Android layar penuh diurus mode ujian native, bukan Fullscreen API milik halaman.
export function fullscreenAvailable() {
    return !nativeApp() && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

// Unduhan berkas dari API. WebView Android tidak bisa mengunduh blob lewat tautan, jadi isinya diserahkan ke aplikasi.
export async function saveBlob(blob: Blob, name: string) {
    const native = nativeApp();
    if (native) {
        const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
        await native.saveFile({ name, mime: blob.type || 'application/octet-stream', data });
        return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
