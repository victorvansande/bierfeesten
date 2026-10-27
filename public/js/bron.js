/* Gegevensbronnen. Elke bron roept onStand(stand) op met hetzelfde formaat
 * dat de Worker op /api/stand teruggeeft, en onStatus(staat, tekst).
 *
 *   LiveBron  WebSocket naar /api/live, valt terug op polling van /api/stand
 *   DemoBron  verzonnen feestavond, enkel voor het ontwerp en voor tests
 */
(function () {
  const EMMER_MS = 5 * 60 * 1000;
  const EMMERS = 48;

  class LiveBron {
    constructor(api, onStand, onStatus) {
      this.api = api.replace(/\/$/, '');
      this.onStand = onStand;
      this.onStatus = onStatus;
      this.pogingen = 0;
      this.pollTimer = null;
      this.ws = null;
      /* ?editie=2025 bekijkt een vorige editie of een testtelling */
      const ed = new URLSearchParams(location.search).get('editie');
      this.qs = ed ? '?editie=' + encodeURIComponent(ed) : '';
    }
    start() {
      this.verbind();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && (!this.ws || this.ws.readyState > 1)) this.verbind(true);
      });
      addEventListener('online', () => this.verbind(true));
    }
    wsUrl() {
      const basis = this.api || location.origin;
      return basis.replace(/^http/, 'ws') + '/api/live' + this.qs;
    }
    verbind(meteen) {
      clearTimeout(this.herTimer);
      if (this.ws && this.ws.readyState <= 1) return;
      this.onStatus('verbinden', 'Verbinden…');
      let ws;
      try { ws = new WebSocket(this.wsUrl()); } catch { return this.terugval(); }
      this.ws = ws;
      ws.onopen = () => {
        this.pogingen = 0;
        this.stopPoll();
        this.hartslag = setInterval(() => { try { ws.send('ping'); } catch {} }, 25000);
      };
      ws.onmessage = e => {
        if (e.data === 'pong') return;
        try {
          const m = JSON.parse(e.data);
          if (m.type === 'stand') { this.onStand(m.stand); this.onStatus('live', 'Live'); }
        } catch {}
      };
      ws.onclose = () => {
        clearInterval(this.hartslag);
        this.pogingen++;
        if (this.pogingen >= 3) this.terugval();
        /* exponentieel wachten met wat toeval, zodat 300 gsm's niet tegelijk terugkomen */
        const wacht = Math.min(30000, 1000 * 2 ** Math.min(this.pogingen, 5)) * (0.6 + Math.random() * 0.8);
        this.onStatus('weg', 'Verbinding kwijt, opnieuw proberen…');
        this.herTimer = setTimeout(() => this.verbind(), meteen ? 0 : wacht);
      };
    }
    /* Als WebSockets geblokkeerd zijn (sommige bedrijfsnetwerken): elke 5 s de stand ophalen. */
    terugval() {
      if (this.pollTimer) return;
      const haal = async () => {
        try {
          const r = await fetch(this.api + '/api/stand' + this.qs, { cache: 'no-store' });
          if (!r.ok) throw new Error(r.status);
          this.onStand(await r.json());
          this.onStatus('live', 'Live (elke 5 s)');
        } catch { this.onStatus('weg', 'Geen verbinding met de telling'); }
      };
      haal();
      this.pollTimer = setInterval(haal, 5000);
    }
    stopPoll() { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  /* ---- Demo: een geloofwaardige zaterdagavond ---- */
  class DemoBron {
    constructor(onStand, onStatus) {
      this.onStand = onStand;
      this.onStatus = onStatus;
      this.producten = [
        ['Flesje 25 cl', 250, 0.55], ['Flesje 33 cl', 330, 0.32], ['Trappist 33 cl', 330, 0.08], ['Fles 75 cl', 750, 0.05]
      ];
      /* Elke tafel krijgt een eigen dorst, zodat er echte koplopers ontstaan. */
      this.dorst = {};
      let zaad = 11;
      const rnd = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
      for (const nr of Object.keys(ZAAL.zaalVan)) this.dorst[nr] = 0.25 + rnd() ** 2.2 * 2.5;
      this.som = Object.values(this.dorst).reduce((a, b) => a + b, 0);
      this.stand = { v: 1, editie: 'demo', totaal_ml: 0, zonder_tafel_ml: 0, bestellingen: 0, tafels: {}, recent: [], verloop: null, bijgewerkt: Date.now(), server_tijd: Date.now() };
      this.emmers = new Map();
    }
    kiesTafel() {
      let r = Math.random() * this.som;
      for (const [nr, d] of Object.entries(this.dorst)) { if ((r -= d) <= 0) return nr; }
      return '1';
    }
    kiesProduct() {
      let r = Math.random();
      for (const p of this.producten) { if ((r -= p[2]) <= 0) return p; }
      return this.producten[0];
    }
    bestel(ts, stil) {
      const zonderTafel = Math.random() < 0.06;
      const tafel = zonderTafel ? null : this.kiesTafel();
      const [naam, ml] = this.kiesProduct();
      const aantal = 1 + Math.floor(Math.random() ** 2 * 8);
      const totaal = ml * aantal;
      const s = this.stand;
      if (tafel) {
        const t = s.tafels[tafel] || (s.tafels[tafel] = { ml: 0, n: 0, laatst: 0 });
        t.ml += totaal; t.n++; t.laatst = ts;
      } else s.zonder_tafel_ml += totaal;
      s.totaal_ml += totaal;
      s.bestellingen++;
      const e = Math.floor(ts / EMMER_MS) * EMMER_MS;
      this.emmers.set(e, (this.emmers.get(e) || 0) + totaal);
      if (!stil) {
        s.recent.unshift({ t: tafel, ml: totaal, p: (aantal > 1 ? aantal + ' × ' : '') + naam, ts });
        s.recent.length = Math.min(s.recent.length, 12);
      }
    }
    publiceer() {
      const nu = Date.now();
      const begin = Math.floor(nu / EMMER_MS) * EMMER_MS - (EMMERS - 1) * EMMER_MS;
      const ml = [];
      for (let e = begin; e <= nu; e += EMMER_MS) ml.push(this.emmers.get(e) || 0);
      this.stand.verloop = { emmer_ms: EMMER_MS, begin, ml };
      this.stand.bijgewerkt = this.stand.server_tijd = nu;
      this.onStand(JSON.parse(JSON.stringify(this.stand)));
    }
    start() {
      /* Vier uur voorgeschiedenis met een avondcurve, zodat het verloop meteen iets toont. */
      const nu = Date.now();
      for (let m = 240; m > 0; m -= 0.5) {
        const ts = nu - m * 60000;
        const drukte = 0.6 + Math.sin(((240 - m) / 240) * Math.PI * 0.9) * 2.2;
        const kans = Math.random() * 3 < drukte ? Math.round(drukte * 1.6) : 0;
        for (let i = 0; i < kans; i++) this.bestel(ts, m > 3);
      }
      this.onStatus('demo', 'Demo');
      this.publiceer();
      const tik = () => {
        const n = Math.random() < 0.25 ? 2 : 1;
        for (let i = 0; i < n; i++) this.bestel(Date.now());
        this.publiceer();
        setTimeout(tik, 900 + Math.random() * 2600);
      };
      setTimeout(tik, 1500);
    }
  }

  window.BRON = { LiveBron, DemoBron };
})();
