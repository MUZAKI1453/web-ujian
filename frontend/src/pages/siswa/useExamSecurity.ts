import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { LocalAttempt, SecurityEvent } from './attemptStore';

export const violationLabels: Record<SecurityEvent['reason'], string> = {
    'tab-hidden': 'Meninggalkan tab atau menyembunyikan halaman ujian',
    'window-blur': 'Berpindah aplikasi atau jendela',
    'fullscreen-exit': 'Keluar dari mode layar penuh',
    'split-screen': 'Ukuran layar menunjukkan mode jendela atau split screen'
};

export default function useExamSecurity(current: MutableRefObject<LocalAttempt>, update: (attempt: LocalAttempt) => void, finished: boolean, prepared = false) {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [activating, setActivating] = useState(false);
    const armed = useRef(false);
    const incident = useRef(false);
    const audio = useRef<AudioContext>();
    const wakeLock = useRef<WakeLockSentinel | null>(null);
    const cleanupTimer = useRef<ReturnType<typeof setTimeout>>();
    const callback = useRef(update);
    callback.current = update;
    const finishedRef = useRef(finished);
    finishedRef.current = finished;
    const fullscreenSupported = !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

    function record(reason: SecurityEvent['reason']) {
        const latest = current.current;
        if (!armed.current || incident.current || finishedRef.current || latest.send || Date.now() + latest.offset >= latest.deadline) return;
        incident.current = true;
        armed.current = false;
        setReady(false);
        const security = latest.security ?? { count: 0, pending: [] };
        const count = Math.min(3, security.count + 1);
        const event: SecurityEvent = { id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), reason };
        callback.current({ ...latest, send: count >= 3 || latest.send, versi: count >= 3 ? latest.versi + 1 : latest.versi,
            security: { count, pending: [...security.pending, event].slice(-3), warning: violationLabels[reason] } });
        window.dispatchEvent(new Event('cbt-security-report'));
        try {
            const context = audio.current;
            if (context && context.state === 'running') {
                const oscillator = context.createOscillator();
                const volume = context.createGain();
                oscillator.connect(volume); volume.connect(context.destination);
                oscillator.frequency.value = 700; volume.gain.value = 0.08;
                oscillator.start(); oscillator.stop(context.currentTime + 0.3);
            }
        } catch { /* Audio is optional on browsers that suspend it in the background. */ }
    }

    async function requestWakeLock() {
        try {
            if (wakeLock.current?.released) wakeLock.current = null;
            if ('wakeLock' in navigator && !wakeLock.current) wakeLock.current = await navigator.wakeLock.request('screen');
        }
        catch { /* Wake Lock requires browser support and a secure context. */ }
    }

    async function activate() {
        if (activating || current.current.send || finishedRef.current) return;
        setActivating(true); setError('');
        try {
            // Call directly from the button gesture, before any network or storage await.
            if (fullscreenSupported && !document.fullscreenElement) await document.documentElement.requestFullscreen();
            if (document.visibilityState === 'hidden') throw new Error('Kembali ke halaman ujian sebelum melanjutkan.');
            if (typeof AudioContext !== 'undefined') {
                if (!audio.current) audio.current = new AudioContext();
                void audio.current.resume().catch(() => {});
            }
            void requestWakeLock();
            const latest = current.current;
            callback.current({ ...latest, security: { ...(latest.security ?? { count: 0, pending: [] }), warning: undefined } });
            incident.current = false;
            armed.current = true;
            setReady(true);
            window.dispatchEvent(new Event('resize'));
        } catch {
            setError('Mode layar penuh belum aktif. Izinkan fullscreen lalu tekan tombol di bawah.');
        } finally { setActivating(false); }
    }

    useEffect(() => {
        clearTimeout(cleanupTimer.current);
        let blurTimer: ReturnType<typeof setTimeout> | undefined;
        let resizeTimer: ReturnType<typeof setTimeout> | undefined;
        const hidden = () => {
            if (document.hidden) record('tab-hidden');
            else if (armed.current) { wakeLock.current = null; void requestWakeLock(); }
        };
        const blur = () => {
            clearTimeout(blurTimer);
            blurTimer = setTimeout(() => { if (!document.hasFocus()) record('window-blur'); }, 750);
        };
        const focus = () => clearTimeout(blurTimer);
        const fullscreen = () => { if (!document.fullscreenElement) record('fullscreen-exit'); };
        const resize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                // Width only: a mobile keyboard may reduce height and must not count.
                if (window.screen.width >= 600 && window.innerWidth < window.screen.width * 0.8) record('split-screen');
            }, 800);
        };
        const contextMenu = (event: Event) => { if (armed.current) event.preventDefault(); };
        const shortcut = (event: KeyboardEvent) => {
            if (armed.current && ((event.ctrlKey || event.metaKey) && ['c', 'v', 'x', 'p', 's', 'u'].includes(event.key.toLowerCase()) || armed.current && event.key === 'F12')) event.preventDefault();
        };
        const clipboard = (event: ClipboardEvent) => { if (armed.current) event.preventDefault(); };
        document.addEventListener('visibilitychange', hidden);
        document.addEventListener('fullscreenchange', fullscreen);
        document.addEventListener('contextmenu', contextMenu);
        document.addEventListener('keydown', shortcut);
        document.addEventListener('copy', clipboard); document.addEventListener('cut', clipboard); document.addEventListener('paste', clipboard);
        window.addEventListener('blur', blur); window.addEventListener('focus', focus); window.addEventListener('resize', resize);
        // A newly started attempt arrives with fullscreen already approved. Arm monitoring immediately.
        if (prepared && !current.current.security?.warning && !current.current.send &&
            !document.hidden && document.hasFocus() && (!fullscreenSupported || !!document.fullscreenElement)) {
            void activate();
        }
        return () => {
            armed.current = false;
            clearTimeout(blurTimer); clearTimeout(resizeTimer);
            document.removeEventListener('visibilitychange', hidden);
            document.removeEventListener('fullscreenchange', fullscreen);
            document.removeEventListener('contextmenu', contextMenu);
            document.removeEventListener('keydown', shortcut);
            document.removeEventListener('copy', clipboard); document.removeEventListener('cut', clipboard); document.removeEventListener('paste', clipboard);
            window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); window.removeEventListener('resize', resize);
            // StrictMode remounts effects. Only leave fullscreen when the component really unmounts.
            cleanupTimer.current = setTimeout(() => {
                void wakeLock.current?.release().catch(() => {});
                void audio.current?.close().catch(() => {});
                if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            }, 0);
        };
    }, []);

    useEffect(() => {
        if (finished || current.current.send) {
            armed.current = false;
            void wakeLock.current?.release().catch(() => {});
        }
    }, [finished, current.current.send]);

    return { ready, error, activating, activate, fullscreenSupported };
}
