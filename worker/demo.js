/* Live voorbeeld op de server.
 *
 * Enkel actief in de editie die DEMO_EDITIE heet (wrangler.toml). Het Durable Object
 * van die editie verzint zelf bestellingen via een alarm, zodat iedereen die kijkt
 * dezelfde cijfers ziet, net zoals tijdens het echte feest. De echte editie wordt
 * hier nooit aangeraakt.
 *
 *   - Om de 4 uur begint het voorbeeld opnieuw: gisteren een volledige feestdag
 *     (±600 L), vandaag al vier uur bezig (±260 L). Zo valt het record van 1.000 L
 *     binnen het venster en zien kijkers ook een feestmoment.
 *   - Daarna gemiddeld elke ±35 s een bestelling van ±0,7 L, dus ±70 L per uur.
 *   - Kijkt er een halfuur niemand, dan stopt het alarm. Komt er weer iemand, dan
 *     wordt de tussentijd aangevuld alsof het al die tijd doorliep.
 *
 * Verhoudingen losjes naar de voorlopige bierlijst 2026; ter illustratie.
 */

export const RESET_MS = 4 * 3600 * 1000;
/* Snel voorbeeld (DEMO_SNEL = "1"): om de werking te tonen. Elk uur opnieuw, zodat de cijfers niet absurd hoog oplopen. */
export const RESET_SNEL_MS = 3600 * 1000;
/* Ophogen als het formaat van de verzonnen bestellingen verandert: het voorbeeld begint dan meteen opnieuw. */
export const DEMO_VERSIE = 3;
const STIL_MS = 30 * 60 * 1000;          // zonder kijkers stoppen na een halfuur
const GEM_TUSSENTIJD_MS = 35 * 1000;     // gemiddeld één bestelling per 35 s

/* Biersoorten zonder merknamen; volumes zoals op de lijst (vooral 33 cl, tapbier per glas). */
const PRODUCTEN = [
  ['Pils van het vat', 330, 0.18], ['Tripel', 330, 0.18], ['Blond', 330, 0.15], ['Dubbel', 330, 0.10],
  ['IPA', 330, 0.08], ['Kriek', 250, 0.08], ['Witbier', 250, 0.07], ['Bruin', 330, 0.06],
  ['Saison', 375, 0.05], ['Grote tripel', 750, 0.05]
];
const TAFELS = Array.from({ length: 71 }, (_, i) => String(i + 1));

/* Elke tafel een vaste "dorst" (vast zaad), zodat er telkens echte koplopers ontstaan. */
const DORST = (() => {
  let zaad = 11;
  const rnd = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
  return TAFELS.map(() => 0.25 + rnd() ** 2.2 * 2.5);
})();
const DORST_SOM = DORST.reduce((a, b) => a + b, 0);

function kiesTafel() {
  let r = Math.random() * DORST_SOM;
  for (let i = 0; i < TAFELS.length; i++) if ((r -= DORST[i]) <= 0) return TAFELS[i];
  return TAFELS[0];
}
function kiesProduct() {
  let r = Math.random();
  for (const p of PRODUCTEN) if ((r -= p[2]) <= 0) return p;
  return PRODUCTEN[0];
}

/* Eén bestelling in het gewone kassaformaat, dus via exact dezelfde weg als de echte kassa. */
export function bestelling(ts) {
  const [naam, ml] = kiesProduct();
  const aantal = 1 + Math.floor(Math.random() ** 2 * 4);
  return {
    id: `demo-${ts}-${Math.random().toString(36).slice(2, 8)}`,
    tafel: kiesTafel(), ml, aantal, product: naam,
    tijd: ts
  };
}

/* Beginstand: gisteren een volledige feestdag, vandaag de laatste vier uur. Gesorteerd op tijd. */
export function beginstand(nu) {
  const uit = [];
  /* Gisteren 12u tot ±1u30 (13,5 uur), drukker naar de avond toe: ±860 bestellingen, ±600 L. */
  const gisteren12u = nu - 24 * 3600 * 1000 - (nu % (24 * 3600 * 1000)) + 11 * 3600 * 1000; // 11u UTC = 12u Belgische wintertijd
  for (let i = 0; i < 860; i++) uit.push(bestelling(Math.round(gisteren12u + Math.random() ** 0.7 * 13.5 * 3600 * 1000)));
  /* Vandaag: vier uur avondcurve, 0,35 tot 2,25 bestellingen per minuut: ±375 bestellingen, ±260 L. */
  for (let m = 240; m > 0; m -= 0.5) {
    const perMinuut = 0.35 + Math.sin(((240 - m) / 240) * Math.PI * 0.85) * 1.9;
    if (Math.random() < perMinuut / 2) uit.push(bestelling(Math.round(nu - m * 60000 + Math.random() * 30000)));
  }
  return uit.sort((a, b) => a.tijd - b.tijd);
}

/* Bestellingen tussen twee tijdstippen, aan het gewone tempo (voor het aanvullen van een stille periode). */
export function tussenIn(van, tot) {
  const uit = [];
  for (let t = van + volgendeTussentijd(); t < tot; t += volgendeTussentijd()) uit.push(bestelling(t));
  return uit;
}

/* Willekeurige tussentijd rond 35 s (exponentieel verdeeld, maar nooit korter dan 5 s). */
export function volgendeTussentijd(snel = false) {
  /* Snel: gemiddeld elke 4 s (minstens 1,5 s). Het aanvullen van een stille periode (tussenIn) blijft op het gewone tempo. */
  if (snel) return Math.max(1500, Math.round(-Math.log(1 - Math.random()) * 4000));
  return Math.max(5000, Math.round(-Math.log(1 - Math.random()) * GEM_TUSSENTIJD_MS));
}

export { STIL_MS };

/* Uitverkocht in het voorbeeld: één bier van bij de start, een tweede na twee uur.
 * Soorten die de demo zelf niet bestelt, zodat het klopt met de rest van de pagina. */
export function demoUitverkocht(start, nu) {
  const lijst = [{ nr: '41', naam: 'Geuze', sinds: (start || nu) - 3 * 3600 * 1000 }];
  if (start && nu - start > 2 * 3600 * 1000) lijst.push({ nr: '87', naam: 'Winterbier', sinds: start + 2 * 3600 * 1000 });
  return lijst;
}

/* Het voorbeeld speelt altijd op een weekend: het echte feest valt op zaterdag en zondag.
 * De twee recentste feestdagen krijgen de data van de laatste zaterdag en zondag
 * (vandaag = zondag), zodat de pagina "Zaterdag" en "Zondag · vandaag" toont. */
export function alsWeekend(dagen, vandaag) {
  const d = new Date(vandaag + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());          // laatste zondag (vandaag zelf als het zondag is)
  const zondag = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() - 1);
  const zaterdag = d.toISOString().slice(0, 10);
  const recent = dagen.slice(-2);
  const nieuw = recent.length === 2 ? [{ dag: zaterdag, ml: recent[0].ml }, { dag: zondag, ml: recent[1].ml }] : recent.map(x => ({ dag: zondag, ml: x.ml }));
  return { dagen: nieuw, vandaag: zondag };
}

