/* Service worker: de site opent ook bij slecht of geen netwerk in de zaal.
 *
 *   - Pagina, opmaak, scripts en beelden: eerst het netwerk, zodat na een nieuwe versie alles
 *     meteen bij elkaar past; geen antwoord binnen 3 s (of geen netwerk), dan de bewaarde versie.
 *   - De telling (/api/...) gaat nooit via de cache: die is altijd live. De laatst gekende
 *     stand bewaart de pagina zelf (zie app.js), zodat ze zonder netwerk iets kan tonen.
 *
 * Bij elke wijziging aan deze lijst of dit bestand: VERSIE ophogen, dan ruimt de oude cache zichzelf op.
 */
const VERSIE = 'bierfeesten-v8';
const BASIS = [
  './', 'css/app.css', 'js/config.js', 'js/vendor/qrcode-generator-1.4.4.js', 'js/zaal.js', 'js/bron.js', 'js/app.js',
  'img/logo-masker.png', 'img/icoon/favicon.svg', 'img/icoon/icoon-192.png', 'manifest.webmanifest',
  'fonts/anton-400.woff2', 'fonts/courier-prime-400.woff2', 'fonts/courier-prime-700.woff2'
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
    e.respondWith(eersteNetwerk(req, './'));
  } else if (url.origin === location.origin) {
    e.respondWith(eersteNetwerk(req, req));
  }
});

async function eersteNetwerk(req, sleutel) {
  const cache = await caches.open(VERSIE);
  try {
    const antwoord = await Promise.race([fetch(req), new Promise((_, nee) => setTimeout(() => nee(new Error('traag')), 3000))]);
    if (antwoord.ok) cache.put(sleutel, antwoord.clone());
    return antwoord;
  } catch {
    return (await cache.match(sleutel, { ignoreSearch: true })) || Response.error();
  }
}
