/* Kassabrug: een klein programma dat naast het kassasysteem draait en bestellingen
 * doorstuurt naar de live telling. Geen afhankelijkheden, Node 18 of nieuwer.
 *
 * Waarom een brug? Het kassanetwerk is gesloten, zonder internet. De brug staat met één
 * aansluiting op dat netwerk (enkel lezen) en met een tweede op internet (eigen 4G, enkel
 * uitgaand), zonder doorgang tussen beide. Ook die verbinding kan wegvallen. De brug schrijft elke
 * bestelling eerst naar een lokaal wachtrijbestand en stuurt pas daarna door. Valt
 * het internet weg, dan loopt de telling achter maar gaat er niets verloren: zodra
 * de verbinding terug is, gaat alles alsnog door. Dubbel versturen is geen probleem,
 * want de server negeert een id die hij al kent.
 *
 * Gebruik (alleen het deel "leesNieuweBestellingen" moet aangepast worden aan de kassa):
 *   BF_URL=https://<jouw-worker>.workers.dev BF_TOKEN=... node bridge/kassa-brug.mjs
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const URL_ = (process.env.BF_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const TOKEN = process.env.BF_TOKEN || 'lokaal-test-token';
const WACHTRIJ = new URL('./.wachtrij.jsonl', import.meta.url).pathname;
const INTERVAL_MS = 2000;
const BATCH = 200;

/* ------------------------------------------------------------------
 * AAN TE PASSEN: haal hier de nieuwe bestellingen uit het kassasysteem.
 * Geef een lijst terug in het formaat uit KOPPELING.md, bv.
 *   [{ id: 'bon-4711-2', tafel: 23, ml: 330, aantal: 2, product: 'Flesje 33 cl', tijd: '2026-...' }]
 * Mogelijke bronnen: een SQL-query op de kassadatabank (WHERE id > laatsteId),
 * een exportbestand, een HTTP-endpoint van de kassa, ...
 * ------------------------------------------------------------------ */
async function leesNieuweBestellingen() {
  return [];
}

function laadWachtrij() {
  if (!existsSync(WACHTRIJ)) return [];
  return readFileSync(WACHTRIJ, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function bewaarWachtrij(lijst) {
  writeFileSync(WACHTRIJ + '.tmp', lijst.map(x => JSON.stringify(x)).join('\n') + (lijst.length ? '\n' : ''));
  renameSync(WACHTRIJ + '.tmp', WACHTRIJ);
}

async function verstuur() {
  let wachtrij = laadWachtrij();
  while (wachtrij.length) {
    const deel = wachtrij.slice(0, BATCH);
    const r = await fetch(`${URL_}/api/kassa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ bestellingen: deel }),
      signal: AbortSignal.timeout(10000)
    });
    if (r.status === 401) throw new Error('Token geweigerd: controleer BF_TOKEN.');
    if (r.status >= 500) throw new Error('Server tijdelijk niet bereikbaar (' + r.status + ').');
    const d = await r.json();
    for (const g of d.geweigerd || []) console.warn('Geweigerd:', g.id, g.reden);
    wachtrij = wachtrij.slice(deel.length);
    bewaarWachtrij(wachtrij);
    console.log(`${new Date().toLocaleTimeString('nl-BE')}  +${d.aanvaard} nieuw, ${d.dubbel} dubbel, totaal ${(d.totaal_ml / 1000).toFixed(1)} L, nog ${wachtrij.length} in wachtrij`);
  }
}

let wacht = INTERVAL_MS;
async function lus() {
  try {
    const nieuw = await leesNieuweBestellingen();
    for (const b of nieuw) appendFileSync(WACHTRIJ, JSON.stringify(b) + '\n');
    await verstuur();
    wacht = INTERVAL_MS;
  } catch (e) {
    wacht = Math.min(30000, wacht * 2);
    console.warn(`${new Date().toLocaleTimeString('nl-BE')}  ${e.message} Nieuwe poging over ${wacht / 1000} s.`);
  }
  setTimeout(lus, wacht);
}
console.log(`Kassabrug actief naar ${URL_}`);
lus();
