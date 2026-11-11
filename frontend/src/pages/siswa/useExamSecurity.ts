import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { violationLimit } from './attemptStore';
import { fullscreenAvailable, nativeApp } from '../../services/nativeApp';
import type { LocalAttempt, SecurityEvent } from './attemptStore';

export const violationLabels: Record<SecurityEvent['reason'], string> = {
    'tab-hidden': 'Tab ujian ditinggalkan',
    'window-blur': 'Berpindah aplikasi atau jendela',
    'fullscreen-exit': 'Keluar dari layar penuh',
    'split-screen': 'Terdeteksi mode jendela atau split screen',
    copy: 'Upaya menyalin', paste: 'Upaya menempel', 'context-menu': 'Membuka menu klik kanan', print: 'Upaya mencetak'
};

export function interruptsExam(reason: SecurityEvent['reason']) {
    return ['tab-hidden', 'window-blur', 'fullscreen-exit', 'split-screen'].includes(reason);
}

export default function useExamSecurity(current: MutableRefObject<LocalAttempt>, update: (attempt: LocalAttempt) => void, finished: boolean, prepared = false) {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [activating, setActivating] = useState(false);
    const armed = useRef(false);
    const incident = useRef(false);
    const lastPassive = useRef<Partial<Record<SecurityEvent['reason'], number>>>({});
    const audio = useRef<AudioContext>();
    const wakeLock = useRef<WakeLockSentinel | null>(null);
    const cleanupTimer = useRef<ReturnType<typeof setTimeout>>();
    const callback = useRef(update);
    callback.current = update;
    const finishedRef = useRef(finished);
    finishedRef.current = finished;
    const fullscreenSupported = fullscreenAvailable();

    function record(reason: SecurityEvent['reason']) {
        const latest = current.current;
        const now = Date.now();
        if (!armed.current || incident.current || finishedRef.current || latest.send || now + latest.offset >= latest.deadline || latest.securityWeights?.[reason] === 0) return;
        const security = latest.security ?? { count: 0, pending: [] };
        const interrupt = interruptsExam(reason);
        if (!interrupt && (security.pending.length >= 13 || now - (lastPassive.current[reason] ?? 0) < 10_000)) return;
        lastPassive.current[reason] = now;
        const limit = violationLimit(latest);
        const count = !interrupt ? security.count : limit ? Math.min(limit, security.count + 1) : security.count + 1;
        const submit = limit > 0 && count >= limit;
        const event: SecurityEvent = { id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), reason };
        if (interrupt) {
            incident.current = true;
            armed.current = false;
            setReady(false);
        }
        callback.current({ ...latest, send: submit || latest.send, versi: submit ? latest.versi + 1 : latest.versi,
            security: { count, pending: [...security.pending, event], warning: interrupt ? violationLabels[reason] : security.warning } });
        window.dispatchEvent(new Event('cbt-security-report'));
        if (!interrupt) return;
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
            // Aplikasi Android: blokir screenshot, layar tetap menyala, dan sembunyikan bilah sistem.
            await nativeApp()?.enableExamMode({ pin: false }).catch(() => {});
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
        const contextMenu = (event: Event) => { if (armed.current) { event.preventDefault(); record('context-menu'); } };
        const shortcut = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if (!armed.current || !((event.ctrlKey || event.metaKey) && ['c', 'v', 'x', 'p', 's', 'u'].includes(key) || event.key === 'F12')) return;
            event.preventDefault();
            if (key === 'c' || key === 'x') record('copy');
            if (key === 'v') record('paste');
            if (key === 'p') record('print');
        };
        const clipboard = (event: ClipboardEvent) => { if (armed.current) { event.preventDefault(); record(event.type === 'paste' ? 'paste' : 'copy'); } };
        const print = () => record('print');
        const nativeSplit = () => record('split-screen');
        document.addEventListener('visibilitychange', hidden);
        document.addEventListener('fullscreenchange', fullscreen);
        document.addEventListener('contextmenu', contextMenu);
        document.addEventListener('keydown', shortcut);
        document.addEventListener('copy', clipboard); document.addEventListener('cut', clipboard); document.addEventListener('paste', clipboard);
        window.addEventListener('blur', blur); window.addEventListener('focus', focus); window.addEventListener('resize', resize);
        window.addEventListener('beforeprint', print);
        window.addEventListener('cbtnativesplit', nativeSplit);
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
            window.removeEventListener('beforeprint', print);
            window.removeEventListener('cbtnativesplit', nativeSplit);
            // StrictMode remounts effects. Only leave fullscreen when the component really unmounts.
            cleanupTimer.current = setTimeout(() => {
                void wakeLock.current?.release().catch(() => {});
                void nativeApp()?.disableExamMode().catch(() => {});
                void audio.current?.close().catch(() => {});
                if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            }, 0);
        };
    }, []);

    useEffect(() => {
        if (finished || current.current.send) {
            armed.current = false;
            void wakeLock.current?.release().catch(() => {});
            void nativeApp()?.disableExamMode().catch(() => {});
        }
    }, [finished, current.current.send]);

    return { ready, error, activating, activate, fullscreenSupported };
}
