/* Service worker: de site opent ook bij slecht of geen netwerk in de zaal.
 *
 *   - De pagina zelf (HTML): eerst het netwerk, zodat een nieuwe versie meteen zichtbaar is;
 *     lukt dat niet binnen 4 s, dan de bewaarde versie.
 *   - Opmaak, scripts, beelden: meteen uit de cache, en op de achtergrond bijwerken.
 *   - Lettertypes van Google: eenmaal opgehaald, daarna uit de cache.
 *   - De telling (/api/...) gaat nooit via de cache: die is altijd live. De laatst gekende
 *     stand bewaart de pagina zelf (zie app.js), zodat ze zonder netwerk iets kan tonen.
 *
 * Bij elke wijziging aan deze lijst of dit bestand: VERSIE ophogen, dan ruimt de oude cache zichzelf op.
 */
const VERSIE = 'bierfeesten-v1';
const BASIS = [
  './', 'css/app.css', 'js/config.js', 'js/vendor/qrcode-generator-1.4.4.js', 'js/zaal.js', 'js/bron.js', 'js/app.js',
  'img/logo-masker.png', 'img/icoon/favicon.svg', 'img/icoon/icoon-192.png', 'manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIE).then(c => c.addAll(BASIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(sleutels => Promise.all(sleutels.filter(k => k !== VERSIE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;   // live gegevens: nooit cachen

  if (req.mode === 'navigate') {
    e.respondWith(eersteNetwerk(req));
  } else if (url.origin === location.origin) {
    e.respondWith(cacheEnBijwerken(e, req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(eersteCache(req));
  }
});

async function eersteNetwerk(req) {
  const cache = await caches.open(VERSIE);
  try {
    const antwoord = await Promise.race([fetch(req), new Promise((_, nee) => setTimeout(() => nee(new Error('traag')), 4000))]);
    if (antwoord.ok) cache.put('./', antwoord.clone());
    return antwoord;
  } catch {
    return (await cache.match('./')) || Response.error();
  }
}

async function cacheEnBijwerken(e, req) {
  const cache = await caches.open(VERSIE);
  const bewaard = await cache.match(req, { ignoreSearch: true });
  const vers = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  if (bewaard) { e.waitUntil(vers); return bewaard; }
  return (await vers) || Response.error();
}

async function eersteCache(req) {
  const cache = await caches.open(VERSIE);
  const bewaard = await cache.match(req);
  if (bewaard) return bewaard;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
  return r;
}
