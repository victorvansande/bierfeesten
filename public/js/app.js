/* Herentalse Bierfeesten: weergave van de live telling. */
(function () {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);

  /* ---- Instellingen: config.js, enkele zaken overschrijfbaar via de URL ---- */
  const cfg = Object.assign({}, window.BF_CONFIG);
  const q = new URLSearchParams(location.search);
  if (q.has('demo')) cfg.bron = 'demo';
  const beamer = q.has('beamer');

  const fmt1 = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt0 = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });
  const liter = ml => fmt1.format(ml / 1000);

  let mijnTafel = null;
  try { mijnTafel = localStorage.getItem('bf-mijn-tafel'); } catch {}

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

  const tafelEls = {};   // nr -> { g, vul, clip, l1, l2, w, h, title, laatsteMl }
  const zaalLiterEls = {}; // zaal-id -> [text-elementen]

  /* Eén zaal tekenen in groep `ouder`. Geeft de breedte na eventuele inkorting terug. */
  function tekenZaal(zaal, ouder, compact, metLabel) {
    const { fx, breedte, breuk } = maakFx(zaal, compact);
    el('rect', { class: 'vloer', x: 0, y: 0, width: breedte, height: zaal.hoogte, rx: 3 }, ouder);
    if (breuk) {
      el('rect', { class: 'breuk-zone', x: breuk[0], y: 0, width: breuk[1] - breuk[0], height: zaal.hoogte }, ouder);
      el('path', { class: 'breuk', d: `M${breuk[0]} 0V${zaal.hoogte}M${breuk[1]} 0V${zaal.hoogte}` }, ouder);
    }
    for (const e of zaal.elementen) {
      el('path', { class: 'el el-' + e.soort, d: padFx(e.pad, fx) }, ouder);
      if (e.label) {
        const [lx, ly] = e.labelPos;
        const t = el('text', { class: 'el-label el-label-' + e.soort, x: fx(lx), y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, ouder);
        if (e.draai) t.setAttribute('transform', `rotate(${e.draai} ${fx(lx)} ${ly})`);
        t.textContent = e.label;
      }
    }
    if (metLabel) {
      const naam = el('text', { class: 'zaal-naam', x: 2, y: -9 }, ouder);
      naam.textContent = zaal.naam;
      const l = el('text', { class: 'zaal-som', x: breedte - 2, y: -9, 'text-anchor': 'end' }, ouder);
      l.textContent = '0,0 L';
      (zaalLiterEls[zaal.id] ||= []).push(l);
    }
    for (const [nr, [x0, y, w, h]] of Object.entries(zaal.tafels)) {
      const x = fx(x0 + w / 2) - w / 2;
      const g = el('g', { class: 'tafel', transform: `translate(${x} ${y})`, tabindex: 0, role: 'button', 'data-nr': nr }, ouder);
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
    return breedte;
  }

  /* Groot scherm: één plan met beide zalen naast elkaar, zoals in het echt.
   * Gsm: elke zaal apart onder elkaar (anders worden de tafels te klein),
   * met de verbindingsdeuren aangeduid. */
  const mqGsm = matchMedia('(max-width: 899px)');
  function bouwPlannen() {
    const gsm = mqGsm.matches;
    const houder = $('plan');
    for (const k in zaalLiterEls) delete zaalLiterEls[k];
    const m = 10, kop = 30;
    const zalen = Object.fromEntries(ZAAL.zalen.map(z => [z.id, z]));
    const svgs = [];
    if (!gsm) {
      const S = ZAAL.samen;
      const tz = zalen['tuinzaal'], gz = zalen['grote-zaal'];
      const svg = el('svg', { role: 'group', 'aria-label': 'Plan van de zaal: tuinzaal links, grote zaal rechts' });
      const [tx, ty] = S.plaats['tuinzaal'];
      const [, gy] = S.plaats['grote-zaal'];
      const gT = el('g', { transform: `translate(${tx} ${ty})` }, svg);
      const bT = tekenZaal(tz, gT, false, true);
      const gx = tx + bT + S.muur;
      /* Tussenmuur met de twee doorgangen. */
      const muurTop = ty, muurBodem = ty + tz.hoogte;
      let y = muurTop, d = '';
      for (const [van, tot] of S.doorgangen) { d += `M${bT + S.muur / 2} ${y}V${van}`; y = tot; }
      d += `M${bT + S.muur / 2} ${y}V${muurBodem}`;
      el('path', { class: 'tussenmuur', d, 'stroke-width': S.muur }, svg);
      for (const [van, tot] of S.doorgangen) el('path', { class: 'doorgang', d: `M${bT - 4} ${(van + tot) / 2}H${gx + 4}` }, svg);
      const gG = el('g', { transform: `translate(${gx} ${gy})` }, svg);
      const bG = tekenZaal(gz, gG, cfg.plan_inkorten, true);
      svg.setAttribute('viewBox', `${-m} ${-kop} ${gx + bG + 2 * m} ${Math.max(gz.hoogte + gy, tz.hoogte + ty) + kop + m}`);
      svgs.push(svg);
    } else {
      for (const id of ['grote-zaal', 'tuinzaal']) {
        const z = zalen[id];
        const svg = el('svg', { role: 'group', 'aria-label': `Plan ${z.naam}` });
        const b = tekenZaal(z, el('g', {}, svg), id === 'grote-zaal', true);
        /* Verbindingsdeuren aanduiden: in het echt hangen de zalen hier aan elkaar. */
        const S = ZAAL.samen, oy = S.plaats[id][1];
        for (const [van, tot] of S.doorgangen) {
          const yy = (van + tot) / 2 - oy;
          const t = el('text', { class: 'doorgang-label', x: id === 'tuinzaal' ? b - 4 : 4, y: yy, 'text-anchor': id === 'tuinzaal' ? 'end' : 'start', 'dominant-baseline': 'central' }, svg);
          t.textContent = id === 'tuinzaal' ? 'grote zaal →' : '← tuinzaal';
          if (id === 'grote-zaal') t.setAttribute('transform', `rotate(-90 4 ${yy}) translate(-22 6)`);
          if (id === 'tuinzaal') t.setAttribute('transform', `rotate(90 ${b - 4} ${yy}) translate(26 6)`);
        }
        svg.setAttribute('viewBox', `${-m} ${-kop} ${b + 2 * m} ${z.hoogte + kop + m}`);
        svgs.push(svg);
      }
    }
    svgs.forEach(s => s.classList.add('plan-svg'));
    houder.replaceChildren(...svgs);
    houder.dataset.weergave = gsm ? 'apart' : 'samen';
    if (laatsteStand) toonTafels(laatsteStand, true);
  }
  mqGsm.addEventListener('change', bouwPlannen);

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
    toonDoelen(s, eerste);
    toonMijn();
  }

  function toonTafels(s, eerste) {
    const maxMl = Math.max(2000, ...Object.values(s.tafels).map(t => t.ml));
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
    for (const [id, els] of Object.entries(zaalLiterEls)) for (const x of els) x.textContent = liter(perZaal[id] || 0) + ' L';
  }

  function literPerUur(s) {
    const v = s.verloop; if (!v) return 0;
    const n = v.ml.length; if (n < 3) return 0;
    const som = v.ml[n - 1] + v.ml[n - 2] + v.ml[n - 3];
    const duur = (s.server_tijd || Date.now()) - (v.begin + (n - 3) * v.emmer_ms);
    return duur > 0 ? som / 1000 / (duur / 3600000) : 0;
  }

  function toonKerncijfers(s) {
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
    const items = s.recent.slice(0, 10);   // gsm toont er 6, de beamer vult de kolom
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

  /* Verloop als linosnede: één inktblok per 5 minuten, het lopende blok in het rood.
   * De viewBox volgt de echte pixelbreedte, zodat tekst nooit uitgerekt wordt. */
  function tekenVerloop() {
    const s = laatsteStand; const svg = $('verloop-svg');
    if (!s || !s.verloop) return;
    const W = Math.max(200, Math.round(svg.clientWidth)), H = Math.max(60, Math.round(svg.clientHeight));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const ml = s.verloop.ml, n = ml.length;
    const voet = H - 16, top = 14;
    const max = Math.max(1000, ...ml);
    const bw = W / n, gat = Math.max(1, bw * 0.24);
    const piekI = ml.indexOf(Math.max(...ml));
    let balken = '', uren = '';
    ml.forEach((v, i) => {
      const h = v / max * (voet - top);
      if (h > 0) balken += `<rect class="vl-balk${i === n - 1 ? ' vl-nu' : ''}" x="${(i * bw + gat / 2).toFixed(1)}" y="${(voet - h).toFixed(1)}" width="${(bw - gat).toFixed(1)}" height="${h.toFixed(1)}"/>`;
      const ts = s.verloop.begin + i * s.verloop.emmer_ms;
      if (new Date(ts).getMinutes() === 0) {
        const x = (i * bw).toFixed(1);
        balken += `<line class="vl-uur" x1="${x}" x2="${x}" y1="${voet}" y2="${voet + 5}"/>`;
        uren += `<text class="vl-uurlabel" x="${x}" y="${H - 1}">${new Date(ts).getHours()}u</text>`;
      }
    });
    const piek = ml[piekI] > 0 ? `<text class="vl-piek" x="${Math.min(W - 2, Math.max(2, piekI * bw + bw / 2))}" y="${(voet - ml[piekI] / max * (voet - top) - 4).toFixed(1)}" text-anchor="${piekI * bw > W - 60 ? 'end' : piekI * bw < 60 ? 'start' : 'middle'}">${fmt1.format(ml[piekI] / 1000)} L</text>` : '';
    svg.innerHTML = `<g class="vl-inkt">${balken}<line class="vl-voet" x1="0" x2="${W}" y1="${voet}" y2="${voet}"/></g>${uren}${piek}`;
  }
  let herteken;
  addEventListener('resize', () => { clearTimeout(herteken); herteken = setTimeout(tekenVerloop, 150); });

  /* Tussendoelen: elke `tussendoel_l` liter een feestmoment, met het totaal van
   * vorig jaar als apart (en groter) doel. De balk loopt tot het record van
   * vorig jaar, of tot het volgende tussendoel zodra dat record gebroken is. */
  function toonDoelen(s, eerste) {
    const L = s.totaal_ml / 1000;
    const stap = cfg.tussendoel_l;
    const vj = cfg.vorig_jaar_l || 0;
    const volgend = (Math.floor(L / stap) + 1) * stap;
    const einde = Math.max(vj, volgend);
    let label;
    if (vj && L >= vj) label = `Record gebroken! Volgend doel ${fmt0.format(volgend)} L`;
    else if (vj && volgend >= vj) label = `Op weg naar het record van vorig jaar: ${fmt0.format(vj)} L`;
    else label = `Volgend tussendoel: ${fmt0.format(volgend)} L`;
    const doel = vj && L < vj ? Math.min(volgend, vj) : volgend;
    $('mb-label').textContent = label;
    $('mb-rest').textContent = 'nog ' + fmt0.format(Math.max(0, Math.ceil(doel - L))) + ' L';
    $('mb-vul').style.width = Math.min(100, L / einde * 100) + '%';

    /* Streepjes voor elk tussendoel, een ster voor vorig jaar. Enkel hertekenen als de schaal verandert. */
    const spoor = $('mb-spoor');
    if (spoor.dataset.einde !== String(einde)) {
      spoor.dataset.einde = einde;
      spoor.querySelectorAll('.mb-streep, .mb-vj').forEach(x => x.remove());
      for (let d = stap; d < einde; d += stap) {
        if (d === vj) continue;
        const t = document.createElement('i');
        t.className = 'mb-streep'; t.style.left = (d / einde * 100) + '%';
        spoor.append(t);
      }
      if (vj) {
        const v = document.createElement('i');
        v.className = 'mb-vj'; v.style.left = (vj / einde * 100) + '%';
        v.title = 'Vorig jaar: ' + fmt0.format(vj) + ' L';
        spoor.append(v);
      }
      const vjOpEinde = vj && vj === einde;
      $('mb-schaal').innerHTML = `<span>0</span>${vj && !vjOpEinde ? `<span class="mb-schaal-vj" style="left:${vj / einde * 100}%">vorig jaar</span>` : ''}<span${vjOpEinde ? ' class="mb-schaal-eind"' : ''}>${fmt0.format(einde)} L${vjOpEinde ? ' = vorig jaar' : ''}</span>`;
    }

    const idx = Math.floor(L / stap);
    const recordNu = vj && L >= vj;
    if (mijlpaalIndex !== null && !eerste) {
      if (recordNu && !mijlpaalRecord) vier(vj, 'record');
      else if (idx > mijlpaalIndex) vier(idx * stap, 'tussendoel');
    }
    mijlpaalIndex = idx;
    mijlpaalRecord = recordNu;
  }
  let mijlpaalRecord = false;
  function vier(l, soort) {
    const m = $('mijlpaal');
    $('mp-getal').textContent = fmt0.format(l);
    $('mp-tekst').textContent = soort === 'record' ? 'Record van vorig jaar gebroken!' : 'liter bier gedronken';
    m.dataset.soort = soort;
    m.hidden = false;
    m.classList.remove('weg');
    clearTimeout(vier.t);
    vier.t = setTimeout(() => { m.classList.add('weg'); setTimeout(() => { m.hidden = true; }, 600); }, soort === 'record' ? 12000 : 6500);
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
    if (!laatsteStand) { m.hidden = true; return; }
    m.hidden = false;
    m.classList.toggle('mijn-leeg', !mijnTafel);
    if (!mijnTafel) { m.textContent = 'Aan welke tafel zit jij? Tik ze aan in het plan.'; return; }
    const t = laatsteStand.tafels[mijnTafel] || { ml: 0 };
    m.hidden = false;
    m.innerHTML = `<span class="mijn-label">Jouw tafel</span><b>Tafel ${mijnTafel}</b><span class="mijn-liter">${liter(t.ml)} L</span><span class="mijn-rang">${t.ml ? '#' + rangVan[mijnTafel] : ''}</span>`;
  }
  $('mijn')?.addEventListener('click', () => {
    if (mijnTafel) openDetail(mijnTafel, tafelEls[mijnTafel]?.g);
    else $('kaart').scrollIntoView({ behavior: verminderBeweging ? 'auto' : 'smooth', block: 'start' });
  });

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
  bouwPlannen();
  tekenTeller(0);
  if (cfg.bron === 'demo') {
    $('demo-band').hidden = false;
    new BRON.DemoBron(onStand, onStatus).start();
  } else {
    new BRON.LiveBron(cfg.api, onStand, onStatus).start();
  }
})();
