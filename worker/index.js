/* Herentalse Bierfeesten: live bierteller.
 *
 * Eén Cloudflare Worker + één Durable Object per editie ("Telling").
 * Het Durable Object is de enige bron van waarheid: het bewaart elke
 * bestelling in SQLite (idempotent op id), houdt de totalen in het geheugen
 * en duwt de stand via WebSockets naar alle kijkers.
 *
 *   GET  /api/stand          stand als JSON (publiek, alleen lezen)
 *   GET  /api/live           WebSocket, stuurt de stand bij elke wijziging (alleen lezen)
 *   POST /api/kassa          invoer vanuit het kassasysteem (Bearer KASSA_TOKEN)
 *   GET  /api/gezondheid     eenvoudige check voor monitoring
 *
 * Het invoerformaat staat beschreven in KOPPELING.md.
 * De editie met de naam DEMO_EDITIE is een live voorbeeld met verzonnen bestellingen (demo.js).
 */

import { RESET_MS, STIL_MS, alsWeekend, beginstand, bestelling, tussenIn, volgendeTussentijd } from './demo.js';

const MAX_BATCH = 500;
const MAX_ML_PER_STUK = 5000;     // 5 L: alles daarboven is bijna zeker een tikfout
const MAX_AANTAL = 200;
const RECENT = 12;                 // laatste bestellingen in de stand
const EMMER_MS = 5 * 60 * 1000;    // emmers van 5 minuten voor het verloop
const EMMERS = 48;                 // 4 uur verloop
const UITZEND_MS = 300;            // hoogstens ~3 uitzendingen per seconde
/* Een feestdag loopt van 06:00 tot 06:00 Belgische tijd: de Bierfeesten zijn open van
 * 12u tot ±1u à 2u, dus wat na middernacht gedronken wordt, telt nog bij die dag. */
const DAGGRENS_UUR = 6;
const DAGFORMAAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
const feestdag = ts => DAGFORMAAT.format(new Date(ts - DAGGRENS_UUR * 3600000));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });
    if (url.pathname === '/api/gezondheid') return json({ ok: true, editie: env.EDITIE });

    const editie = (url.searchParams.get('editie') || env.EDITIE || 'test').slice(0, 20);
    const stub = env.TELLING.get(env.TELLING.idFromName(editie));
    /* Het Durable Object kent zijn eigen naam niet; geef die mee, zodat het weet of het de demo is. */
    /* POST: de body eerst volledig inlezen, zodat ook een geweigerde aanvraag (bv. foute token) netjes afgesloten wordt. */
    const headers = new Headers(req.headers);
    headers.set('x-editie', editie);
    const doorgegeven = req.method === 'POST'
      ? new Request(req.url, { method: 'POST', headers, body: await req.arrayBuffer() })
      : new Request(req, { headers });
    return stub.fetch(doorgegeven);
  }
};

export class Telling {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.uitzendTimer = null;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS bestelling (
        id TEXT PRIMARY KEY,
        tafel TEXT,
        ml INTEGER NOT NULL,
        product TEXT,
        ts INTEGER NOT NULL,
        ontvangen INTEGER NOT NULL,
        storno INTEGER NOT NULL DEFAULT 0
      )`);
      this.sql.exec('CREATE INDEX IF NOT EXISTS bestelling_ts ON bestelling(ts)');
      this.editie = await ctx.storage.get('editie');
      this.herbereken();
    });
  }

  /* Totalen volledig opnieuw opbouwen uit de database (bij opstart). */
  herbereken() {
    this.tafels = {};
    this.zonderTafel = 0;
    this.totaal = 0;
    this.aantal = 0;
    for (const r of this.sql.exec(`SELECT tafel, SUM(ml) AS ml, SUM(CASE WHEN product = 'standcorrectie' THEN 0 ELSE 1 END) AS n, MAX(ts) AS laatst FROM bestelling WHERE storno = 0 GROUP BY tafel`)) {
      this.boekTotaal(r.tafel, r.ml, r.n, r.laatst);
    }
    this.recent = [...this.sql.exec(`SELECT id, tafel, ml, product, ts FROM bestelling WHERE storno = 0 AND ml > 0 AND product IS NOT 'standcorrectie' ORDER BY ts DESC LIMIT ${RECENT}`)]
      .map(r => ({ id: r.id, t: r.tafel, ml: r.ml, p: r.product, ts: r.ts }));
    /* Liters per feestdag: per uur optellen in SQL, daarna per dag in JS (SQLite kent geen tijdzones). */
    this.dagen = {};
    for (const r of this.sql.exec('SELECT (ts / 3600000) AS u, SUM(ml) AS ml FROM bestelling WHERE storno = 0 GROUP BY u')) {
      const d = feestdag(Math.floor(r.u) * 3600000 + 1800000);
      this.dagen[d] = (this.dagen[d] || 0) + r.ml;
    }
    this.emmers = new Map();
    const vanaf = Date.now() - EMMERS * EMMER_MS;
    for (const r of this.sql.exec('SELECT (ts / ?) AS e, SUM(ml) AS ml FROM bestelling WHERE storno = 0 AND ts >= ? GROUP BY e', EMMER_MS, vanaf)) {
      this.emmers.set(Math.floor(r.e) * EMMER_MS, r.ml);
    }
    /* Tijdstip van de laatst verwerkte bestelling, ook na een herstart van het Durable Object. */
    this.bijgewerkt = this.sql.exec('SELECT MAX(ontvangen) AS t FROM bestelling').one().t || 0;
  }

  boekTotaal(tafel, ml, n, ts) {
    if (tafel == null) this.zonderTafel += ml;
    else {
      const t = this.tafels[tafel] || (this.tafels[tafel] = { ml: 0, n: 0, laatst: 0 });
      t.ml += ml; t.n += n;
      if (ts > t.laatst) t.laatst = ts;
    }
    this.totaal += ml;
    this.aantal += n;
  }

  /* Eén bestelling, correctie of storno (negatieve ml) in de totalen verwerken. */
  boek(b) {
    this.boekTotaal(b.tafel, b.ml, b.correctie ? 0 : b.storno ? -1 : 1, b.ts);
    const e = Math.floor(b.ts / EMMER_MS) * EMMER_MS;
    this.emmers.set(e, (this.emmers.get(e) || 0) + b.ml);
    const d = feestdag(b.ts);
    this.dagen[d] = (this.dagen[d] || 0) + b.ml;
    if (b.ml > 0 && !b.correctie && !b.storno) {
      this.recent.unshift({ id: b.id, t: b.tafel, ml: b.ml, p: b.product, ts: b.ts });
      this.recent.length = Math.min(this.recent.length, RECENT);
    }
  }

  stand() {
    const nu = Date.now();
    const begin = Math.floor(nu / EMMER_MS) * EMMER_MS - (EMMERS - 1) * EMMER_MS;
    const verloop = [];
    for (let e = begin; e <= nu; e += EMMER_MS) verloop.push(this.emmers.get(e) || 0);
    for (const k of this.emmers.keys()) if (k < begin) this.emmers.delete(k);
    let dagen = Object.entries(this.dagen).filter(([, ml]) => ml !== 0).sort().map(([dag, ml]) => ({ dag, ml }));
    let vandaag = feestdag(nu);
    if (this.isDemo()) ({ dagen, vandaag } = alsWeekend(dagen, vandaag));
    return {
      v: 1,
      editie: this.editie || this.env.EDITIE,
      ...(this.isDemo() ? { demo: true, demo_reset_ms: RESET_MS } : {}),
      totaal_ml: this.totaal,
      zonder_tafel_ml: this.zonderTafel,
      bestellingen: this.aantal,
      tafels: this.tafels,
      recent: this.recent.map(({ id, ...r }) => r),
      verloop: { emmer_ms: EMMER_MS, begin, ml: verloop },
      dagen,
      vandaag,
      bijgewerkt: this.bijgewerkt,
      server_tijd: nu
    };
  }

  async fetch(req) {
    const url = new URL(req.url);
    const editie = req.headers.get('x-editie');
    if (editie && editie !== this.editie) { this.editie = editie; await this.ctx.storage.put('editie', editie); }
    if (this.isDemo()) await this.demoWek();
    switch (url.pathname) {
      case '/api/stand':
        return json(this.stand(), { 'cache-control': 'no-store' });
      case '/api/live': {
        if (req.headers.get('Upgrade') !== 'websocket') return json({ fout: 'Verwacht een WebSocket.' }, {}, 426);
        const [klant, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server);
        server.send(JSON.stringify({ type: 'stand', stand: this.stand() }));
        return new Response(null, { status: 101, webSocket: klant });
      }
      case '/api/kassa':
        if (req.method !== 'POST') return json({ fout: 'Gebruik POST.' }, {}, 405);
        if (!this.magSchrijven(req)) return json({ fout: 'Ongeldige of ontbrekende token.' }, {}, 401);
        return this.invoer(req);
      default:
        return json({ fout: 'Onbekend pad.' }, {}, 404);
    }
  }

  /* Kijkers zijn alleen-lezen: berichten van klanten worden genegeerd,
   * behalve een ping om de verbinding te testen. */
  webSocketMessage(ws, bericht) {
    if (bericht === 'ping') ws.send('pong');
    this.laatsteKijker = Date.now();
  }

  /* ---- Live voorbeeld (enkel in de demo-editie) ---- */
  isDemo() {
    return !!this.env.DEMO_EDITIE && this.editie === this.env.DEMO_EDITIE;
  }

  /* Bij elke kijker: zorgen dat het voorbeeld loopt. Lag het stil (geen kijkers, of een alarm dat
   * te laat kwam), dan eerst het gat aanvullen aan het gewone tempo. */
  async demoWek() {
    this.laatsteKijker = Date.now();
    await this.demoBij(false);
    if (await this.ctx.storage.getAlarm() == null) await this.ctx.storage.setAlarm(Date.now() + volgendeTussentijd());
  }

  async alarm() {
    if (!this.isDemo()) return;
    const kijkers = this.ctx.getWebSockets().length;
    /* Niemand meer aan het kijken: stoppen. De volgende kijker wekt het voorbeeld weer. */
    if (!kijkers && Date.now() - (this.laatsteKijker || 0) > STIL_MS) return;
    await this.demoBij(true);
    await this.ctx.storage.setAlarm(Date.now() + volgendeTussentijd());
  }

  /* Het voorbeeld bijwerken:
   *   - ouder dan RESET_MS: opnieuw beginnen;
   *   - een alarm dat op tijd komt: precies één nieuwe bestelling;
   *   - een gat van meer dan 2 minuten: aanvullen aan het gewone tempo (±35 s per bestelling). */
  async demoBij(vanAlarm) {
    const nu = Date.now();
    const start = await this.ctx.storage.get('demo_start');
    if (!start || nu - start > RESET_MS) {
      this.ctx.storage.transactionSync(() => this.sql.exec('DELETE FROM bestelling'));
      this.herbereken();
      this.verwerk(beginstand(nu), [], nu);
      await this.ctx.storage.put({ demo_start: nu, demo_laatste: nu });
      this.planUitzending();
      return;
    }
    const laatste = (await this.ctx.storage.get('demo_laatste')) || nu;
    let lijst = [];
    if (nu - laatste > 2 * 60 * 1000) lijst = tussenIn(laatste, nu);
    else if (vanAlarm) lijst = [bestelling(nu)];
    else return;   // kijker tijdens een lopend voorbeeld: niets te doen
    if (lijst.length) this.verwerk(lijst, [], nu);
    await this.ctx.storage.put('demo_laatste', nu);
  }

  webSocketClose(ws, code) { try { ws.close(code, 'tot later'); } catch {} }
  webSocketError() {}

  magSchrijven(req) {
    const verwacht = this.env.KASSA_TOKEN;
    const kop = req.headers.get('Authorization') || '';
    const gekregen = kop.startsWith('Bearer ') ? kop.slice(7) : '';
    if (!verwacht || gekregen.length !== verwacht.length) return false;
    let verschil = 0;
    for (let i = 0; i < verwacht.length; i++) verschil |= verwacht.charCodeAt(i) ^ gekregen.charCodeAt(i);
    return verschil === 0;
  }

  async invoer(req) {
    let body;
    try { body = await req.json(); } catch { return json({ fout: 'Body is geen geldige JSON.' }, {}, 400); }

    const nu = Date.now();

    /* Vorm 1: losse bestellingen (aanbevolen). Een object zonder "bestellingen" telt als één bestelling. */
    let lijst = [].concat(body.bestellingen || body.events || (body.id != null ? [body] : []));
    /* "correctie" is enkel voor intern gebruik (zie standNaarCorrecties): van buitenaf nooit aanvaarden. */
    lijst = lijst.map(r => (r && typeof r === 'object' ? { ...r, correctie: false } : r));
    /* Vorm 2: storno's van eerder doorgestuurde bestellingen. */
    const storno = [].concat(body.storno || []);
    /* Vorm 3: absolute stand per tafel (voor kassa's die alleen totalen kennen). */
    if (body.stand) lijst = lijst.concat(this.standNaarCorrecties(body.stand, nu));

    if (lijst.length + storno.length > MAX_BATCH) return json({ fout: `Maximaal ${MAX_BATCH} regels per oproep.` }, {}, 413);

    const resultaat = this.verwerk(lijst, storno, nu);
    return json(resultaat, {}, resultaat.geweigerd.length && !resultaat.aanvaard && !resultaat.dubbel ? 422 : 200);
  }

  /* Bestellingen en storno's opslaan en boeken. Gedeeld door de kassa-invoer en de demo. */
  verwerk(lijst, storno, nu) {
    const producten = leesProducten(this.env.PRODUCTEN);
    const geldigeTafels = leesTafels(this.env.TAFELS);
    const resultaat = { aanvaard: 0, dubbel: 0, geweigerd: [], waarschuwingen: [] };

    /* De hele zending als één transactie: ofwel alles in de database, ofwel niets. */
    const teBoeken = [];
    const gestorneerd = new Set();
    this.ctx.storage.transactionSync(() => {
      for (let i = 0; i < lijst.length; i++) {
        const b = normaliseer(lijst[i], producten, nu);
        if (b.fout) { resultaat.geweigerd.push({ index: i, id: lijst[i]?.id ?? null, reden: b.fout }); continue; }
        /* Idempotent: een id die al bestaat, wordt stil overgeslagen. */
        const nieuw = this.sql.exec('INSERT OR IGNORE INTO bestelling (id, tafel, ml, product, ts, ontvangen) VALUES (?, ?, ?, ?, ?, ?)',
          b.id, b.tafel, b.ml, b.product, b.ts, nu).rowsWritten > 0;
        if (!nieuw) { resultaat.dubbel++; continue; }
        if (b.tafel != null && geldigeTafels && !geldigeTafels.has(b.tafel)) {
          resultaat.waarschuwingen.push({ id: b.id, melding: `Tafel ${b.tafel} staat niet op het plan; de liters tellen wel mee in het totaal.` });
        }
        teBoeken.push(b);
      }
      for (const id of storno.map(String)) {
        const rij = this.sql.exec('SELECT tafel, ml, ts, storno FROM bestelling WHERE id = ?', id).toArray()[0];
        if (!rij) { resultaat.geweigerd.push({ id, reden: 'Storno voor een onbekende bestelling.' }); continue; }
        if (rij.storno || gestorneerd.has(id)) { resultaat.dubbel++; continue; }
        this.sql.exec('UPDATE bestelling SET storno = 1 WHERE id = ?', id);
        gestorneerd.add(id);
        teBoeken.push({ id, tafel: rij.tafel, ml: -rij.ml, ts: rij.ts, storno: true });
      }
    });
    /* Pas na een geslaagde transactie de totalen in het geheugen bijwerken. */
    for (const b of teBoeken) { this.boek(b); resultaat.aanvaard++; }
    if (gestorneerd.size) this.recent = this.recent.filter(r => !gestorneerd.has(r.id));
    if (!resultaat.waarschuwingen.length) delete resultaat.waarschuwingen;

    if (resultaat.aanvaard) {
      this.bijgewerkt = nu;
      this.planUitzending();
    }
    resultaat.totaal_ml = this.totaal;
    return resultaat;
  }

  /* Een absolute stand omzetten naar correctieregels, zodat er maar één
   * boekhouding bestaat en de recente lijst en het verloop blijven kloppen. */
  standNaarCorrecties(stand, nu) {
    const uit = [];
    const tafels = stand.tafels || {};
    for (const [nr, liter] of Object.entries(tafels)) {
      const doel = Math.round(Number(liter) * 1000);
      const huidig = this.tafels[nr]?.ml || 0;
      if (Number.isFinite(doel) && doel !== huidig) uit.push({ id: `stand:${nr}:${nu}`, tafel: nr, ml: doel - huidig, product: 'standcorrectie', correctie: true });
    }
    if (stand.zonder_tafel != null) {
      const doel = Math.round(Number(stand.zonder_tafel) * 1000);
      if (Number.isFinite(doel) && doel !== this.zonderTafel) uit.push({ id: `stand:-:${nu}`, tafel: null, ml: doel - this.zonderTafel, product: 'standcorrectie', correctie: true });
    }
    return uit;
  }

  planUitzending() {
    if (this.uitzendTimer) return;
    this.uitzendTimer = setTimeout(() => {
      this.uitzendTimer = null;
      const bericht = JSON.stringify({ type: 'stand', stand: this.stand() });
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(bericht); } catch {} }
    }, UITZEND_MS);
  }
}

/* Eén bestelling in het interne formaat gieten. Aanvaardt Nederlandse en
 * Engelse sleutels, zodat het kassasysteem zo weinig mogelijk moet omzetten. */
function normaliseer(r, producten, nu) {
  if (!r || typeof r !== 'object') return { fout: 'Regel is geen object.' };
  const id = r.id ?? r.bon_id;
  if (id == null || String(id).length === 0 || String(id).length > 120) return { fout: 'Elke bestelling heeft een uniek "id" nodig (max. 120 tekens).' };

  let tafel = r.tafel ?? r.table ?? null;
  if (tafel === '' || tafel === 0 || tafel === '0') tafel = null;
  if (tafel != null) {
    tafel = String(tafel).trim().replace(/^tafel\s*/i, '');
    if (tafel.length > 12) return { fout: 'Tafelnummer is te lang.' };
  }

  const aantal = r.aantal ?? r.qty ?? r.quantity ?? 1;
  if (!Number.isInteger(aantal) || aantal === 0 || Math.abs(aantal) > MAX_AANTAL) return { fout: `"aantal" moet een geheel getal zijn tussen -${MAX_AANTAL} en ${MAX_AANTAL}, niet 0.` };

  let mlPerStuk;
  if (r.ml != null) mlPerStuk = Number(r.ml);
  else if (r.cl != null) mlPerStuk = Number(r.cl) * 10;
  else if (r.liter != null || r.liters != null) mlPerStuk = Number(r.liter ?? r.liters) * 1000;
  else if (r.product != null && producten[r.product] != null) mlPerStuk = producten[r.product];
  else return { fout: 'Geef een volume mee ("ml", "cl" of "liter") of een "product" dat in PRODUCTEN staat.' };

  if (!Number.isFinite(mlPerStuk)) return { fout: 'Volume is geen getal.' };
  mlPerStuk = Math.round(mlPerStuk);
  if (!r.correctie && (mlPerStuk <= 0 || mlPerStuk > MAX_ML_PER_STUK)) return { fout: `Volume per stuk moet tussen 1 en ${MAX_ML_PER_STUK} ml liggen.` };

  let ts = r.tijd ?? r.ts ?? r.time ?? nu;
  ts = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
  if (!Number.isFinite(ts)) ts = nu;
  if (ts > nu + 5 * 60 * 1000) ts = nu; // klok van de kassa loopt voor

  return {
    id: String(id),
    tafel,
    ml: r.correctie ? mlPerStuk : mlPerStuk * aantal,
    product: r.product != null ? String(r.product).slice(0, 60) : (r.naam != null ? String(r.naam).slice(0, 60) : null),
    ts,
    correctie: !!r.correctie
  };
}

/* "1-71" of "1-53,54-71,80" naar een verzameling tafelnummers. Leeg = alles toegelaten. */
function leesTafels(tekst) {
  if (!tekst) return null;
  const set = new Set();
  for (const deel of String(tekst).split(',')) {
    const [van, tot = van] = deel.trim().split('-').map(Number);
    for (let n = van; n <= tot; n++) set.add(String(n));
  }
  return set;
}

function leesProducten(tekst) {
  if (!tekst) return {};
  if (typeof tekst === 'object') return tekst;
  try { return JSON.parse(tekst); } catch { return {}; }
}

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type'
  };
}

function json(data, extra = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors(), ...extra }
  });
}
