/* The server prepends the build version and the list of Vite assets. */
const shellPrefix = 'cbt-shell-';
const shellCache = shellPrefix + build.version;
const mediaCache = 'cbt-media-v1';

self.addEventListener('install', event => {
    event.waitUntil(caches.open(shellCache).then(cache => cache.addAll(['/', ...build.assets])));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(shellPrefix) && key !== shellCache)
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

async function navigate(request) {
    try {
        return await fetch(request);
    } catch {
        const cache = await caches.open(shellCache);
        return (await cache.match('/')) ?? Response.error();
    }
}

async function cachedAsset(request, name) {
    const cache = await caches.open(name);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put(request, response.clone()).catch(() => {});
    return response;
}

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin ||
        url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/assets/')) event.respondWith(cachedAsset(request, shellCache));
    else if (url.pathname.startsWith('/media/')) event.respondWith(cachedAsset(request, mediaCache));
    else if (request.mode === 'navigate') event.respondWith(navigate(request));
});
