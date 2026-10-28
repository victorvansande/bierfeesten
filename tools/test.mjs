/* Integratietest tegen een lopende `npm run dev`. Gebruik: node tools/test.mjs [basis-url] [token]
 * Werkt met een aparte editie, zodat de echte telling nooit geraakt wordt. */
const BASIS = process.argv[2] || 'http://127.0.0.1:8787';
const TOKEN = process.argv[3] || 'lokaal-test-token';
const ED = 'test-' + Date.now();
let fouten = 0;
const ok = (v, wat) => { console.log((v ? 'ok   ' : 'FOUT ') + wat); if (!v) fouten++; };
const post = (body, token = TOKEN) => fetch(`${BASIS}/api/kassa?editie=${ED}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body)
}).then(async r => ({ status: r.status, data: await r.json() }));
const stand = () => fetch(`${BASIS}/api/stand?editie=${ED}`).then(r => r.json());

/* Kijker via WebSocket: moet updates krijgen en mag niets kunnen schrijven. */
const berichten = [];
const ws = new WebSocket(`${BASIS.replace(/^http/, 'ws')}/api/live?editie=${ED}`);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { if (e.data !== 'pong') berichten.push(JSON.parse(e.data)); });
ws.send(JSON.stringify({ bestellingen: [{ id: 'hack', tafel: 1, ml: 99999 }] }));

let r = await post({ bestellingen: [{ id: 'a', tafel: 1, ml: 330 }] }, null);
ok(r.status === 401, 'zonder token geweigerd');
r = await post({ bestellingen: [{ id: 'a', tafel: 1, ml: 330 }] }, 'fout');
ok(r.status === 401, 'met foute token geweigerd');

r = await post({ bestellingen: [
  { id: 'b1', tafel: 12, ml: 330, aantal: 2, product: 'Flesje 33 cl' },
  { id: 'b2', tafel: '23', cl: 25 },
  { id: 'b3', tafel: 'Tafel 23', liter: 0.75 },
  { id: 'b4', tafel: null, ml: 250 },
  { id: 'b5', tafel: 5, product: 'PILS33', aantal: 3 }
] });
ok(r.status === 200 && r.data.aanvaard === 5, '5 bestellingen aanvaard (ml, cl, liter, zonder tafel, productcode)');
let s = await stand();
ok(s.totaal_ml === 660 + 250 + 750 + 250 + 990, 'totaal klopt in ml: ' + s.totaal_ml);
ok(s.tafels['23'].ml === 1000 && s.tafels['23'].n === 2, 'tafel 23 = 1,0 L uit 2 bestellingen ("Tafel 23" herkend)');
ok(s.zonder_tafel_ml === 250, 'bestelling zonder tafel apart geteld');

r = await post({ bestellingen: [{ id: 'b1', tafel: 12, ml: 330, aantal: 2 }] });
ok(r.data.dubbel === 1 && r.data.aanvaard === 0, 'zelfde id nog eens = genegeerd (idempotent)');

r = await post({ bestellingen: [{ tafel: 1, ml: 330 }, { id: 'x', tafel: 1 }, { id: 'y', tafel: 1, ml: 90000 }, { id: 'z', tafel: 1, ml: 330, aantal: 0 }, { id: 'c', tafel: 1, ml: -500, correctie: true }] });
ok(r.status === 422 && r.data.geweigerd.length === 5, 'ongeldige regels geweigerd met reden (ook een vervalste correctie)');

r = await post({ storno: ['b5'] });
s = await stand();
ok(s.tafels['5'].ml === 0 && s.totaal_ml === 1910 && s.tafels['5'].n === 0, 'storno trekt bestelling terug');
r = await post({ storno: ['b5'] });
ok(r.data.dubbel === 1, 'dubbele storno genegeerd');

r = await post({ bestellingen: [{ id: 'p1', tafel: 3, ml: 330, aantal: 4, product: 'Tripel' }, { id: 'p2', tafel: 4, ml: 330, product: 'Tripel' }] });
s = await stand();
const tripel = s.bieren.find(b => b.p === 'Tripel'), fles = s.bieren.find(b => b.p === 'Flesje 33 cl');
ok(s.bieren[0].p === 'Tripel' && tripel.ml === 1650 && tripel.n === 5 && fles?.ml === 660 && fles.n === 2 && !s.bieren.some(b => b.p === 'PILS33'),
  'populairste bieren: liters en stuks per product, gestorneerd bier verdwijnt');
ok(s.recent.find(x => x.p === 'Tripel' && x.t === '3')?.a === 4, 'laatste bestellingen geven het aantal apart mee');
await post({ storno: ['p1', 'p2'] });

/* Uitverkochte bieren: volledige lijst, losse wijzigingen, en foute invoer verandert niets. */
r = await post({ uitverkocht: [12, '7', { nr: 41, naam: 'Geuze' }, 'Winterbier'] });
s = await stand();
ok(r.status === 200 && JSON.stringify(s.uitverkocht.map(b => [b.nr, b.naam])) === JSON.stringify([['7', null], ['12', null], ['41', 'Geuze'], [null, 'Winterbier']]),
  'uitverkocht: volledige lijst, gesorteerd op nummer (nummers, namen en objecten)');
const sinds41 = s.uitverkocht.find(b => b.nr === '41').sinds;
r = await post({ voorraad: [{ nr: 12, uitverkocht: false }, { nr: 41, uitverkocht: true }, { nr: 5, naam: 'Kriek', uitverkocht: true }] });
s = await stand();
ok(r.status === 200 && s.uitverkocht.map(b => b.nr).join() === '5,7,41,' && s.uitverkocht.find(b => b.nr === '41').sinds === sinds41,
  'uitverkocht: losse wijzigingen, tijdstip blijft bij een bier dat al op was');
r = await post({ voorraad: [{ nr: 7, uitverkocht: false }, { nr: 8 }] });
ok(r.status === 400 && (await stand()).uitverkocht.length === 4, 'uitverkocht: foute regel geweigerd, lijst onveranderd');
r = await post({ uitverkocht: [] });
ok((await stand()).uitverkocht.length === 0, 'uitverkocht: lege lijst = alles weer te bestellen');

r = await post({ stand: { tafels: { 12: 2.5, 40: 1.2 } } });
s = await stand();
ok(s.tafels['12'].ml === 2500 && s.tafels['40'].ml === 1200 && s.tafels['12'].n === 1, 'absolute stand per tafel zet correcties zonder bestellingen te verdubbelen');

r = await post({ bestellingen: [{ id: 'w1', tafel: 99, ml: 330 }] });
ok(r.data.aanvaard === 1 && r.data.waarschuwingen?.length === 1, 'tafel buiten het plan: aanvaard met waarschuwing');
r = await post({ storno: ['w1'] });

/* Per feestdag: 06:00 tot 06:00 Belgische tijd. 01:30 's nachts telt nog bij de vorige dag. */
r = await post({ bestellingen: [
  { id: 'd1', tafel: 7, ml: 330, tijd: '2026-10-02T15:00:00+02:00' },
  { id: 'd2', tafel: 7, ml: 330, tijd: '2026-10-03T01:30:00+02:00' },
  { id: 'd3', tafel: 7, ml: 250, tijd: '2026-10-03T13:00:00+02:00' }
] });
s = await stand();
const dag = Object.fromEntries(s.dagen.map(d => [d.dag, d.ml]));
ok(dag['2026-10-02'] === 660 && dag['2026-10-03'] === 250, 'liters per feestdag (nacht telt bij de vorige dag): ' + JSON.stringify(dag));
ok(typeof s.vandaag === 'string' && /^\d{4}-\d\d-\d\d$/.test(s.vandaag), 'stand geeft de huidige feestdag mee');

/* Live voorbeeld: enkel in de demo-editie, nooit in een andere. */
const demo = await fetch(`${BASIS}/api/stand?editie=demo`).then(r => r.json());
ok(demo.uitverkocht?.[0]?.naam === 'Geuze', 'demo toont een uitverkocht bier');
ok(demo.demo === true && demo.totaal_ml > 600000 && demo.recent.length > 0, `demo-editie heeft een stand (${(demo.totaal_ml / 1000).toFixed(1)} L, ${demo.dagen.length} dagen)`);
ok(!s.demo && !(await stand()).demo, 'andere edities zijn nooit demo');
await new Promise(r => setTimeout(r, 1500));
const demo2 = await fetch(`${BASIS}/api/stand?editie=demo`).then(r => r.json());
ok(demo.demo_stil !== true || (demo2.totaal_ml === demo.totaal_ml && demo2.bestellingen === demo.bestellingen && Date.now() - demo2.recent[0].ts < 10 * 60000),
  demo.demo_stil ? 'stilgelegd voorbeeld: stand blijft staan, tijdstippen lijken van nu' : 'voorbeeld loopt (niet stilgelegd)');
const wd = d => new Date(d + 'T12:00:00Z').getUTCDay();
ok(demo.dagen.length === 2 && wd(demo.dagen[0].dag) === 6 && wd(demo.dagen[1].dag) === 0 && demo.vandaag === demo.dagen[1].dag, 'demo speelt op zaterdag en zondag (vandaag = zondag)');

await new Promise(r => setTimeout(r, 700));
const laatste = berichten.at(-1)?.stand;
ok(berichten.length >= 2 && laatste?.totaal_ml === s.totaal_ml, `WebSocket-kijker kreeg ${berichten.length} updates, laatste stand klopt`);
ok(!s.tafels['1'] || s.tafels['1'].ml === 0, 'bericht van een kijker veranderde niets');
ws.close();
console.log(fouten ? `\n${fouten} test(s) mislukt` : '\nAlle tests geslaagd');
process.exit(fouten ? 1 : 0);
