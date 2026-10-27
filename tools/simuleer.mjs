/* Stuurt verzonnen bestellingen naar /api/kassa, zoals de echte kassa dat zou doen.
 * Gebruik: node tools/simuleer.mjs [basis-url] [token] [editie]
 * Standaard naar de lokale dev-server en editie "simulatie", zodat de echte telling niet geraakt wordt. */
const BASIS = process.argv[2] || 'http://127.0.0.1:8787';
const TOKEN = process.argv[3] || 'lokaal-test-token';
const EDITIE = process.argv[4] || 'simulatie';
const tafels = Array.from({ length: 71 }, (_, i) => String(i + 1));
const dorst = Object.fromEntries(tafels.map(t => [t, 0.3 + Math.random() ** 2 * 2.5]));
const som = Object.values(dorst).reduce((a, b) => a + b, 0);
const producten = [['Flesje 25 cl', 250, .55], ['Flesje 33 cl', 330, .35], ['Fles 75 cl', 750, .1]];
const kies = (lijst, gewicht) => { let r = Math.random() * gewicht(null); for (const x of lijst) if ((r -= gewicht(x)) <= 0) return x; return lijst[0]; };
let n = 0;
async function stuur() {
  const tafel = Math.random() < .06 ? null : kies(tafels, t => t === null ? som : dorst[t]);
  const [naam, ml] = kies(producten, p => p === null ? 1 : p[2]);
  const best = { id: `sim-${Date.now()}-${n++}`, tafel, ml, aantal: 1 + Math.floor(Math.random() ** 2 * 6), product: naam, tijd: new Date().toISOString() };
  const r = await fetch(`${BASIS}/api/kassa?editie=${EDITIE}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: JSON.stringify({ bestellingen: [best] }) });
  const d = await r.json();
  console.log(r.status, `tafel ${tafel ?? 'toog'}`, `${best.aantal} × ${naam}`, `totaal ${(d.totaal_ml / 1000).toFixed(1)} L`);
  setTimeout(stuur, 300 + Math.random() * 1500);
}
stuur();
