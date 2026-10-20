const BASE = new URL('./', self.location.href);
const CACHE = 'c-pocket-study-diagnostics-v1.1:' + BASE.pathname;
const SHELL = ['index.html', 'app.js', 'style.css', 'runner.js', 'worker.js', 'diagnostics.js', 'offline.js', 'tests/cases.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data.command !== 'prepare') return;
  event.waitUntil((async () => {
    try {
      const response = await fetch(new URL('assets.json', BASE), { cache: 'no-store' });
      if (!response.ok) throw new Error('assets.json assente: eseguire acquisizione toolchain.');
      const assets = await response.json();
      const cache = await caches.open(CACHE);
      const engine = event.data.engine;
      const wanted = assets.filter(a => !a.path.endsWith('/stdc++.h.pch') &&
        (!engine || !a.path.startsWith('vendor/') ||
          a.path.startsWith(engine === 'binji' ? 'vendor/binji/' : 'vendor/browsercc/') ||
          (engine === 'browsercc' && a.path.startsWith('vendor/wasi/'))));
      // Sequential to limit peak memory while caching large compiler artifacts.
      for (const path of [...SHELL, 'assets.json', ...wanted.map(a => a.path)]) {
        const url = new URL(path, BASE);
        if (url.origin !== BASE.origin || !url.href.startsWith(BASE.href)) throw new Error('Asset esterno rifiutato');
        const resource = await fetch(url, { cache: 'no-store' });
        if (!resource.ok) throw new Error(`Download fallito: ${path}`);
        await cache.put(url, resource);
      }
      event.ports[0].postMessage({ message: `Cache completa. ${engine || 'Entrambe le toolchain'} disponibile offline. Ricaricare online, poi chiudere e riaprire in modalità aereo. Verifica iPhone ancora necessaria.` });
    } catch (error) { event.ports[0].postMessage({ message: `Offline NON pronto: ${error}` }); }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== BASE.origin || !url.href.startsWith(BASE.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = url.href === BASE.href ? new URL('index.html', BASE).href : event.request;
    return await cache.match(key) || fetch(event.request);
  })());
});
