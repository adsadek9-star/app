/* Dental Student Planner service worker (v17)
   Lives next to index.html, so its scope is the site's own folder (/app/).
   All paths are relative so nothing depends on the domain or subpath.

   Strategy:
   - Page navigations: network-first, falling back to the cached index.html.
     Online students ALWAYS get the newest version; the cache is only the
     offline fallback, so a stale index.html can never stick.
   - App files (manifest, icons, sheets.json): network-first, cache fallback.
   - The Google Sheet CSVs (docs.google.com gviz): network-first, cache
     fallback - offline students see the last lectures/exams they synced.
   - Firebase/font CDNs (versioned files): cache-first so the app boots fast;
     Firestore/Auth calls themselves always go to the network. */
const CACHE = 'dsp-v17-1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'sheets.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  return fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then((m) => {
    if (m) return m;
    throw new Error('offline and not cached');
  }));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // page navigations: fresh when online, cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('index.html', copy));
        }
        return res;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // the year's Google Sheet CSV + the sheets manifest: fresh data when
  // online, last synced data when offline
  if (url.hostname === 'docs.google.com' || url.pathname.endsWith('sheets.json')) {
    e.respondWith(networkFirst(req));
    return;
  }

  // versioned CDN files (firebase compat, fonts): cache-first
  if (url.hostname === 'www.gstatic.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // everything else on our origin (icons, manifest): cache-first, then network
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
