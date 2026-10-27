/* Herentalse Bierfeesten: weergave van de live telling. */
(function () {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const THEMAS = [
    ['stempel', 'Stempel'], ['schuim', 'Schuimkraag'], ['vertrekbord', 'Vertrekbord'],
    ['affiche', 'Kermisaffiche'], ['scorebord', 'Scorebord'], ['blauwdruk', 'Blauwdruk']
  ];

  /* ---- Instellingen: config.js, overschreven door URL en #thema ---- */
  const cfg = Object.assign({}, window.BF_CONFIG);
  const q = new URLSearchParams(location.search);
  if (q.has('demo')) cfg.bron = 'demo';
  if (q.has('kiezer')) cfg.kiezer = true;
  if (q.get('thema')) cfg.thema = q.get('thema');
  const uitHash = location.hash.slice(1);
  if (THEMAS.some(t => t[0] === uitHash)) cfg.thema = uitHash;
  const beamer = q.has('beamer');

  const fmt1 = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt0 = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });
  const liter = ml => fmt1.format(ml / 1000);

  let mijnTafel = null;
  try { mijnTafel = localStorage.getItem('bf-mijn-tafel'); } catch {}

  /* ---- Thema ---- */
  function zetThema(id) {
    if (!THEMAS.some(t => t[0] === id)) id = 'stempel';
    document.body.dataset.thema = id;
    cfg.thema = id;
    document.querySelectorAll('.kiezer-knoppen button').forEach(b => b.setAttribute('aria-selected', b.dataset.thema === id));
    const kleur = getComputedStyle(document.body).getPropertyValue('--bg').trim();
    if (kleur) document.querySelector('meta[name=theme-color]').content = kleur;
    tekenVerloop();
  }
  if (cfg.kiezer) {
    $('kiezer').hidden = false;
    for (const [id, naam] of THEMAS) {
      const b = document.createElement('button');
      b.type = 'button'; b.role = 'tab'; b.dataset.thema = id; b.textContent = naam;
      b.addEventListener('click', () => { zetThema(id); history.replaceState(null, '', '#' + id); });
      $('kiezer-knoppen').append(b);
    }
    addEventListener('hashchange', () => zetThema(location.hash.slice(1)));
  }

  /* ---- Plattegrond ---- */
  /* Op smalle schermen wordt de lege middenzone van de grote zaal (tussen de
   * linker- en rechterrij tafels) samengedrukt. Een gestippelde breuklijn
   * toont waar dat gebeurt, zodat het plan eerlijk blijft. */
  const BREUK = { van: 125, tot: 410, nieuw: 72 };
  function maakFx(zaal, compact) {
    if (!compact || zaal.id !== 'grote-zaal') return { fx: x => x, breedte: zaal.breedte, breuk: null };
    const f = BREUK.nieuw / (BREUK.tot - BREUK.van);
    const fx = x => x <= BREUK.van ? x : x >= BREUK.tot ? x - (BREUK.tot - BREUK.van) + BREUK.nieuw : BREUK.van + (x - BREUK.van) * f;
    return { fx, breedte: fx(zaal.breedte), breuk: [BREUK.van, BREUK.van + BREUK.nieuw] };
  }
  /* Pad met absolute commando's (M L H V A Z) horizontaal herschalen. */
  function padFx(d, fx) {
    const delen = d.match(/[MLHVAZ]|-?[\d.]+/g);
    let uit = '', cmd = '', i = 0, arg = 0;
    while (i < delen.length) {
      const t = delen[i++];
      if (/[A-Z]/.test(t)) { cmd = t; arg = 0; uit += t; continue; }
      let n = parseFloat(t);
      if ((cmd === 'M' || cmd === 'L') && arg % 2 === 0) n = fx(n);
      if (cmd === 'H') n = fx(n);
      if (cmd === 'A' && arg % 7 === 5) n = fx(n);
      uit += (arg ? ' ' : '') + Math.round(n * 10) / 10;
      arg++;
    }
    return uit;
  }
  function el(naam, attrs, ouder) {
    const e = document.createElementNS(SVGNS, naam);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (ouder) ouder.append(e);
    return e;
  }

  const tafelEls = {};   // nr -> { g, vul, clip, liter, liter2, w, h }
  function bouwPlannen() {
    const compact = matchMedia('(max-width: 899px)').matches;
    for (const zaal of ZAAL.zalen) {
      const houder = document.querySelector(`[data-plan="${zaal.id}"]`);
      const { fx, breedte, breuk } = maakFx(zaal, compact);
      const m = 10;
      const svg = el('svg', { viewBox: `${-m} ${-m} ${breedte + 2 * m} ${zaal.hoogte + 2 * m}`, role: 'group', 'aria-label': `Plan ${zaal.naam}` });
      svg.classList.add('plan-svg');
      el('rect', { class: 'vloer', x: 0, y: 0, width: breedte, height: zaal.hoogte, rx: 3 }, svg);
      if (breuk) {
        el('rect', { class: 'breuk-zone', x: breuk[0], y: 0, width: breuk[1] - breuk[0], height: zaal.hoogte }, svg);
        el('path', { class: 'breuk', d: `M${breuk[0]} 0V${zaal.hoogte}M${breuk[1]} 0V${zaal.hoogte}` }, svg);
      }
      for (const e of zaal.elementen) {
        el('path', { class: 'el el-' + e.soort, d: padFx(e.pad, fx) }, svg);
        if (e.label) {
          const [lx, ly] = e.labelPos;
          const t = el('text', { class: 'el-label el-label-' + e.soort, x: fx(lx), y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
          if (e.draai) t.setAttribute('transform', `rotate(${e.draai} ${fx(lx)} ${ly})`);
          t.textContent = e.label;
        }
      }
      for (const [nr, [x0, y, w, h]] of Object.entries(zaal.tafels)) {
        const x = fx(x0 + w / 2) - w / 2;
        const g = el('g', { class: 'tafel', transform: `translate(${x} ${y})`, tabindex: 0, role: 'button', 'data-nr': nr }, svg);
        const id = 'clip-' + nr;
        const cp = el('clipPath', { id }, g);
        const clip = el('rect', { x: 0, y: h, width: w, height: 0 }, cp);
        el('rect', { class: 't-blad', x: 0, y: 0, width: w, height: h }, g);
        const vul = el('rect', { class: 't-vul', x: 0, y: h, width: w, height: 0 }, g);
        el('rect', { class: 't-rand', x: 0, y: 0, width: w, height: h }, g);
        const staand = h > w;
        const ny = staand ? h * 0.36 : h * 0.4, ly = staand ? h * 0.7 : h * 0.77;
        const maakTekst = (klasse, extra) => {
          const tg = el('g', Object.assign({ class: klasse }, extra), g);
          const tn = el('text', { class: 't-nr', x: w / 2, y: ny, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, tg);
          tn.textContent = nr;
          const tl = el('text', { class: 't-liter', x: w / 2, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, tg);
          tl.textContent = '0,0';
          return tl;
        };
        const l1 = maakTekst('t-tekst');
        const l2 = maakTekst('t-tekst t-tekst-op-vul', { 'clip-path': `url(#${id})` });
        const title = el('title', {}, g);
        tafelEls[nr] = { g, vul, clip, l1, l2, w, h, title, laatsteMl: -1 };
        if (nr === mijnTafel) g.classList.add('t-mijn');
      }
      houder.replaceChildren(svg);
    }
    if (laatsteStand) toonTafels(laatsteStand, true);
  }
  const mq = matchMedia('(max-width: 899px)');
  mq.addEventListener('change', bouwPlannen);

  /* ---- Teller met rollende cijfers ---- */
  const teller = $('teller-getal');
  let tellerWaarde = 0, tellerDoel = 0, tellerVan = 0, tellerStart = 0, tellerAnim = 0;
  const DUUR = 1400;
  const verminderBeweging = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tekenTeller(v) {
    const tekst = fmt1.format(v / 1000);
    if (teller.dataset.tekst?.length !== tekst.length) {
      teller.replaceChildren();
      for (const ch of tekst) {
        const s = document.createElement('span');
        if (/\d/.test(ch)) {
          s.className = 'c';
          const rol = document.createElement('span');
          rol.className = 'rol';
          rol.textContent = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n0';
          s.append(rol);
        } else { s.className = 'sep'; s.textContent = ch; }
        teller.append(s);
      }
    }
    teller.dataset.tekst = tekst;
    teller.setAttribute('aria-label', tekst + ' liter');
    /* Kilometerteller: x = deciliters. Elk cijfer draait mee zodra alle lagere cijfers op 9 staan. */
    const x = v / 100;
    const cijfers = [...teller.querySelectorAll('.c')].reverse();
    cijfers.forEach((c, k) => {
      const macht = 10 ** k;
      let pos;
      if (k === 0) pos = x % 10;
      else {
        const rest = x % macht;
        pos = Math.floor(x / macht) % 10 + Math.max(0, rest - (macht - 1));
      }
      c.firstChild.style.transform = `translateY(${-pos * (100 / 11)}%)`;
    });
  }
  function animeerTeller(doel) {
    tellerVan = tellerWaarde; tellerDoel = doel; tellerStart = performance.now();
    if (verminderBeweging || document.hidden) { tellerWaarde = doel; tekenTeller(doel); return; }
    cancelAnimationFrame(tellerAnim);
    const stap = nu => {
      const t = Math.min(1, (nu - tellerStart) / DUUR);
      const e = 1 - (1 - t) ** 3;
      tellerWaarde = tellerVan + (tellerDoel - tellerVan) * e;
      tekenTeller(tellerWaarde);
      if (t < 1) tellerAnim = requestAnimationFrame(stap);
    };
    tellerAnim = requestAnimationFrame(stap);
  }

  /* ---- Stand verwerken ---- */
  let laatsteStand = null;
  let mijlpaalIndex = null;
  let rangVan = {};

  function onStand(s) {
    const eerste = !laatsteStand;
    laatsteStand = s;
    animeerTeller(s.totaal_ml);
    toonTafels(s, eerste);
    toonKerncijfers(s);
    toonRanglijst(s);
    toonRecent(s);
    tekenVerloop();
    toonMijlpaal(s, eerste);
    toonMijn();
  }

  function toonTafels(s, eerste) {
    const maxMl = Math.max(4000, ...Object.values(s.tafels).map(t => t.ml));
    const perZaal = {};
    const lijst = Object.entries(s.tafels).filter(([nr]) => ZAAL.zaalVan[nr]).sort((a, b) => b[1].ml - a[1].ml);
    rangVan = {};
    lijst.forEach(([nr], i) => { rangVan[nr] = i + 1; });
    for (const [nr, e] of Object.entries(tafelEls)) {
      const t = s.tafels[nr] || { ml: 0, n: 0 };
      const zaal = ZAAL.zaalVan[nr];
      perZaal[zaal] = (perZaal[zaal] || 0) + t.ml;
      const niveau = t.ml / maxMl;
      const hv = e.h * niveau;
      for (const r of [e.vul, e.clip]) { r.setAttribute('y', e.h - hv); r.setAttribute('height', hv); r.style.y = (e.h - hv) + 'px'; r.style.height = hv + 'px'; }
      const tekst = liter(t.ml);
      e.l1.textContent = e.l2.textContent = tekst;
      e.g.setAttribute('aria-label', `Tafel ${nr}: ${tekst} liter`);
      e.title.textContent = `Tafel ${nr}: ${tekst} L`;
      e.g.classList.toggle('t-top', rangVan[nr] <= 3 && t.ml > 0);
      e.g.dataset.rang = rangVan[nr] || '';
      if (!eerste && e.laatsteMl >= 0 && t.ml > e.laatsteMl) {
        e.g.classList.remove('t-tik'); void e.g.getBBox(); e.g.classList.add('t-tik');
      }
      e.laatsteMl = t.ml;
    }
    document.querySelectorAll('[data-zaal-liter]').forEach(x => { x.textContent = liter(perZaal[x.dataset.zaalLiter] || 0) + ' L'; });
  }

  function literPerUur(s) {
    const v = s.verloop; if (!v) return 0;
    const n = v.ml.length; if (n < 3) return 0;
    const som = v.ml[n - 1] + v.ml[n - 2] + v.ml[n - 3];
    const duur = (s.server_tijd || Date.now()) - (v.begin + (n - 3) * v.emmer_ms);
    return duur > 0 ? som / 1000 / (duur / 3600000) : 0;
  }

  function toonKerncijfers(s) {
    $('k-bakken').textContent = fmt0.format(Math.floor(s.totaal_ml / 1000 / cfg.bak_l));
    $('k-uur').textContent = fmt0.format(literPerUur(s));
    $('k-best').textContent = fmt0.format(s.bestellingen);
  }

  function toonRanglijst(s) {
    const top = Object.entries(s.tafels).filter(([nr, t]) => ZAAL.zaalVan[nr] && t.ml > 0).sort((a, b) => b[1].ml - a[1].ml).slice(0, 5);
    const max = top[0]?.[1].ml || 1;
    $('ranglijst').replaceChildren(...top.map(([nr, t], i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="rl-rang">${i + 1}</span><span class="rl-naam">Tafel ${nr}<small>${ZAAL.zaalVan[nr] === 'tuinzaal' ? 'Tuinzaal' : 'Grote zaal'}</small></span><span class="rl-liter">${liter(t.ml)} L</span><span class="rl-balk" style="--w:${(t.ml / max * 100).toFixed(1)}%"></span>`;
      li.addEventListener('click', () => openDetail(nr));
      return li;
    }));
    if (!top.length) $('ranglijst').innerHTML = '<li class="leeg">Nog geen bestellingen</li>';
  }

  function geleden(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'nu';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    return new Date(ts).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  }

  function toonRecent(s) {
    const ul = $('recent');
    const oud = ul.dataset.sleutel;
    const items = s.recent.slice(0, 6);
    ul.replaceChildren(...items.map((r, i) => {
      const li = document.createElement('li');
      if (i === 0 && oud && oud !== String(r.ts) + r.t) li.className = 'nieuw';
      li.innerHTML = `<span class="rc-tafel">${r.t ? 'Tafel ' + r.t : 'Toog'}</span><span class="rc-wat">${r.p ? escape(r.p) : ''}</span><span class="rc-ml">+${liter(r.ml)} L</span><span class="rc-tijd" data-ts="${r.ts}">${geleden(r.ts)}</span>`;
      return li;
    }));
    if (!items.length) ul.innerHTML = '<li class="leeg">Wachten op de eerste bestelling</li>';
    ul.dataset.sleutel = items[0] ? String(items[0].ts) + items[0].t : '';
  }
  function escape(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function tekenVerloop() {
    const s = laatsteStand; const svg = $('verloop-svg');
    if (!s || !s.verloop) return;
    const W = 400, H = 70, ml = s.verloop.ml, n = ml.length;
    const max = Math.max(1, ...ml);
    const pt = (v, i) => [i / (n - 1) * W, H - 4 - v / max * (H - 12)];
    const pts = ml.map(pt);
    const lijn = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const [ex, ey] = pts[n - 1];
    const uren = [];
    for (let i = 0; i < n; i++) {
      const ts = s.verloop.begin + i * s.verloop.emmer_ms;
      if (new Date(ts).getMinutes() === 0) uren.push([i / (n - 1) * W, new Date(ts).getHours()]);
    }
    svg.innerHTML =
      uren.map(([x, h]) => `<line class="vl-uur" x1="${x}" x2="${x}" y1="0" y2="${H}"/><text class="vl-uurlabel" x="${x + 3}" y="9">${h}u</text>`).join('') +
      `<path class="vl-vlak" d="${lijn}L${W} ${H}L0 ${H}Z"/><path class="vl-lijn" d="${lijn}"/><circle class="vl-punt" cx="${ex}" cy="${ey}" r="3.2"/>`;
  }

  function toonMijlpaal(s, eerste) {
    const L = s.totaal_ml / 1000;
    const stap = cfg.mijlpaal_l;
    let doel, label, deel;
    if (cfg.vorig_jaar_l && L < cfg.vorig_jaar_l) {
      doel = cfg.vorig_jaar_l; label = 'Vorig jaar: ' + fmt0.format(doel) + ' L';
    } else if (cfg.vorig_jaar_l) {
      doel = cfg.vorig_jaar_l; label = 'Record! Vorig jaar overtroffen';
    } else {
      doel = (Math.floor(L / stap) + 1) * stap; label = 'Op weg naar ' + fmt0.format(doel) + ' L';
    }
    deel = Math.min(1, L / doel);
    $('mb-label').textContent = label;
    $('mb-rest').textContent = L < doel ? 'nog ' + fmt0.format(Math.ceil(doel - L)) + ' L' : '+' + fmt0.format(L - doel) + ' L';
    document.body.style.setProperty('--niveau', ((cfg.vorig_jaar_l ? deel : (L % stap) / stap) * 100).toFixed(2) + '%');
    $('mb-vul').style.width = (cfg.vorig_jaar_l ? deel : (L % stap) / stap) * 100 + '%';

    const idx = Math.floor(L / stap);
    if (mijlpaalIndex !== null && idx > mijlpaalIndex && !eerste) vier(idx * stap);
    mijlpaalIndex = idx;
  }
  function vier(l) {
    const m = $('mijlpaal');
    $('mp-getal').textContent = fmt0.format(l);
    m.hidden = false;
    m.classList.remove('weg');
    clearTimeout(vier.t);
    vier.t = setTimeout(() => { m.classList.add('weg'); setTimeout(() => { m.hidden = true; }, 600); }, 6500);
  }

  /* ---- Tafeldetail ---- */
  let openNr = null;
  function openDetail(nr, anker) {
    openNr = nr;
    vulDetail();
    const d = $('tafel-detail');
    d.hidden = false;
    if (anker && matchMedia('(min-width: 900px)').matches) {
      const r = anker.getBoundingClientRect();
      const bw = 280, bh = d.offsetHeight;
      let x = r.right + 12, y = r.top + r.height / 2 - bh / 2;
      if (x + bw > innerWidth - 16) x = r.left - bw - 12;
      y = Math.max(16, Math.min(innerHeight - bh - 16, y));
      d.style.left = x + 'px'; d.style.top = y + 'px';
      d.classList.add('zwevend');
    } else { d.classList.remove('zwevend'); d.style.left = d.style.top = ''; }
    document.querySelectorAll('.tafel.t-open').forEach(g => g.classList.remove('t-open'));
    tafelEls[nr]?.g.classList.add('t-open');
    $('td-sluit').focus({ preventScroll: true });
  }
  function vulDetail() {
    if (!openNr) return;
    const s = laatsteStand || { tafels: {}, totaal_ml: 0 };
    const t = s.tafels[openNr] || { ml: 0, n: 0, laatst: 0 };
    $('td-zaal').textContent = ZAAL.zaalVan[openNr] === 'tuinzaal' ? 'Tuinzaal' : 'Grote zaal';
    $('td-titel').textContent = 'Tafel ' + openNr;
    $('td-liter').innerHTML = `${liter(t.ml)}<small> L</small>`;
    $('td-rang').textContent = t.ml > 0 ? `${rangVan[openNr]} van ${Object.keys(ZAAL.zaalVan).length}` : '–';
    $('td-n').textContent = fmt0.format(t.n);
    $('td-deel').textContent = s.totaal_ml ? fmt1.format(t.ml / s.totaal_ml * 100) + ' %' : '–';
    $('td-laatst').textContent = t.laatst ? geleden(t.laatst) + (geleden(t.laatst) === 'nu' || /:/.test(geleden(t.laatst)) ? '' : ' geleden') : 'nog niets';
    $('td-volg').textContent = mijnTafel === openNr ? 'Niet meer volgen' : 'Dit is mijn tafel';
  }
  function sluitDetail() {
    $('tafel-detail').hidden = true;
    tafelEls[openNr]?.g.classList.remove('t-open');
    const terug = tafelEls[openNr]?.g;
    openNr = null;
    terug?.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('.tafel');
    if (g) { openDetail(g.dataset.nr, g); return; }
    if (!e.target.closest('#tafel-detail') && !e.target.closest('#ranglijst') && !e.target.closest('#mijn')) { if (openNr) sluitDetail(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openNr) sluitDetail();
    const g = e.target.closest?.('.tafel');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(g.dataset.nr, g); }
    if (e.key === 'f' && !e.target.closest('input,textarea')) document.documentElement.requestFullscreen?.().catch(() => {});
  });
  $('td-sluit').addEventListener('click', sluitDetail);
  $('td-volg').addEventListener('click', () => {
    mijnTafel = mijnTafel === openNr ? null : openNr;
    try { mijnTafel ? localStorage.setItem('bf-mijn-tafel', mijnTafel) : localStorage.removeItem('bf-mijn-tafel'); } catch {}
    document.querySelectorAll('.tafel.t-mijn').forEach(g => g.classList.remove('t-mijn'));
    if (mijnTafel) tafelEls[mijnTafel]?.g.classList.add('t-mijn');
    vulDetail(); toonMijn();
  });

  function toonMijn() {
    const m = $('mijn'); if (!m) return;
    if (!mijnTafel || !laatsteStand) { m.hidden = true; return; }
    const t = laatsteStand.tafels[mijnTafel] || { ml: 0 };
    m.hidden = false;
    m.innerHTML = `<span class="mijn-label">Jouw tafel</span><b>Tafel ${mijnTafel}</b><span class="mijn-liter">${liter(t.ml)} L</span><span class="mijn-rang">${t.ml ? '#' + rangVan[mijnTafel] : ''}</span>`;
  }
  $('mijn')?.addEventListener('click', () => mijnTafel && openDetail(mijnTafel, tafelEls[mijnTafel]?.g));

  /* ---- Status ---- */
  function onStatus(staat, tekst) {
    $('status').dataset.staat = staat;
    $('status-tekst').textContent = tekst;
  }
  setInterval(() => {
    document.querySelectorAll('.rc-tijd').forEach(x => { x.textContent = geleden(+x.dataset.ts); });
    if (laatsteStand) {
      const t = new Date(laatsteStand.bijgewerkt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      $('voet-info').textContent = `Alleen lezen · laatste bestelling verwerkt om ${t}`;
    }
    vulDetail();
  }, 15000);

  /* ---- Beamer: scherm wakker houden en cursor verbergen ---- */
  if (beamer) {
    document.body.classList.add('beamer');
    const wakker = () => navigator.wakeLock?.request('screen').catch(() => {});
    wakker();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wakker());
    let t;
    addEventListener('mousemove', () => { document.body.classList.remove('cursor-weg'); clearTimeout(t); t = setTimeout(() => document.body.classList.add('cursor-weg'), 3000); });
  }

  /* ---- Start ---- */
  zetThema(cfg.thema);
  bouwPlannen();
  tekenTeller(0);
  if (cfg.bron === 'demo') {
    $('demo-band').hidden = false;
    new BRON.DemoBron(onStand, onStatus).start();
  } else {
    new BRON.LiveBron(cfg.api, onStand, onStatus).start();
  }
})();
