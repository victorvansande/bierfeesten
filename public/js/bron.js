/* Gegevensbronnen. Elke bron roept onStand(stand) op met hetzelfde formaat
 * dat de Worker op /api/stand teruggeeft, en onStatus(staat, tekst).
 *
 *   LiveBron  WebSocket naar /api/live, valt terug op polling van /api/stand
 *   DemoBron  verzonnen feestavond, enkel voor het ontwerp en voor tests
 */
(function () {
  const EMMER_MS = 5 * 60 * 1000;
  const EMMERS = 48;
  /* Zelfde feestdag-indeling als de server: 06:00 tot 06:00 Belgische tijd. */
  const DAG = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
  const feestdag = ts => DAG.format(new Date(ts - 6 * 3600000));

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
        /* Hartslag: een gsm die van wifi naar 4G wisselt, verliest zijn verbinding soms zonder melding.
         * Komt er binnen 10 s geen antwoord op een ping, dan sluiten we zelf en verbinden opnieuw. */
        this.hartslag = setInterval(() => {
          try { ws.send('ping'); } catch {}
          clearTimeout(this.pongTimer);
          this.pongTimer = setTimeout(() => ws.close(), 10000);
        }, 25000);
      };
      ws.onmessage = e => {
        clearTimeout(this.pongTimer);
        if (e.data === 'pong') return;
        try {
          const m = JSON.parse(e.data);
          if (m.type === 'stand') { this.onStand(m.stand); this.onStatus('live', 'Live'); }
        } catch {}
      };
      ws.onclose = () => {
        clearInterval(this.hartslag);
        clearTimeout(this.pongTimer);
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

  /* ---- Demo: een geloofwaardig weekend (gisteren afgelopen, vandaag bezig) ---- */
  class DemoBron {
    constructor(onStand, onStatus) {
      this.onStand = onStand;
      this.onStatus = onStatus;
      /* Verhoudingen losjes naar de voorlopige bierlijst 2026: vooral flesjes van 33 cl,
       * tapbier van een vat per glas, en enkele grotere en kleinere flessen. Ter illustratie. */
      this.producten = [
        ['Flesje 33 cl', 330, 0.62], ['Tapbier 33 cl', 330, 0.18], ['Flesje 37,5 cl', 375, 0.08],
        ['Flesje 25 cl', 250, 0.06], ['Fles 75 cl', 750, 0.06]
      ];
      /* Elke tafel krijgt een eigen dorst, zodat er echte koplopers ontstaan. */
      this.dorst = {};
      let zaad = 11;
      const rnd = () => (zaad = (zaad * 16807) % 2147483647) / 2147483647;
      for (const nr of Object.keys(ZAAL.zaalVan)) this.dorst[nr] = 0.25 + rnd() ** 2.2 * 2.5;
      this.som = Object.values(this.dorst).reduce((a, b) => a + b, 0);
      this.stand = { v: 1, editie: 'demo', totaal_ml: 0, zonder_tafel_ml: 0, bestellingen: 0, tafels: {}, recent: [], verloop: null, bijgewerkt: Date.now(), server_tijd: Date.now() };
      this.emmers = new Map();
      this.dagen = {};
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
      const tafel = this.kiesTafel();   // elke bestelling heeft een tafel: aan de toog wordt niet besteld
      const [naam, ml] = this.kiesProduct();
      const aantal = 1 + Math.floor(Math.random() ** 2 * 4);
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
      const d = feestdag(ts);
      this.dagen[d] = (this.dagen[d] || 0) + totaal;
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
      this.stand.dagen = Object.entries(this.dagen).sort().map(([dag, ml]) => ({ dag, ml }));
      this.stand.vandaag = feestdag(nu);
      this.stand.bijgewerkt = this.stand.server_tijd = nu;
      this.onStand(JSON.parse(JSON.stringify(this.stand)));
    }
    start() {
      /* Realistische cijfers: de Bierfeesten zijn twee dagen open van 12u tot ±1u à 2u
       * (~27 uur) en halen samen ±1.200 L. Dat is gemiddeld ±45 L per uur, met
       * avondpieken rond 80 à 90 L. Vier uur voorgeschiedenis met zo'n avondcurve:
       * 0,35 tot 1,85 bestellingen per minuut van gemiddeld ~0,7 L. */
      const nu = Date.now();
      /* Gisteren: een volledige feestdag van ±600 L (12u tot 1u30), stil vooraf ingeladen. */
      const gisteren = new Date(nu - 24 * 3600000);
      gisteren.setHours(12, 0, 0, 0);
      for (let i = 0; i < 860; i++) {
        const u = Math.random() ** 0.7 * 13.5;   // drukker naar de avond toe
        this.bestel(gisteren.getTime() + u * 3600000, true);
      }
      for (let m = 240; m > 0; m -= 0.5) {
        const ts = nu - m * 60000 + Math.random() * 30000;
        const perMinuut = 0.35 + Math.sin(((240 - m) / 240) * Math.PI * 0.85) * 1.5;
        if (Math.random() < perMinuut / 2) this.bestel(ts, m > 25);
      }
      this.onStatus('demo', 'Demo');
      this.publiceer();
      /* Live: gemiddeld elke ~35 s een bestelling, dus ±70 L per uur. */
      const tik = () => {
        this.bestel(Date.now());
        this.publiceer();
        setTimeout(tik, 12000 + Math.random() * 46000);
      };
      setTimeout(tik, 2500);
    }
  }

  window.BRON = { LiveBron, DemoBron };
})();
