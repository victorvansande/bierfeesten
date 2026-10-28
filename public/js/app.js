/* Herentalse Bierfeesten: weergave van de live telling.
 *
 * Alles hier is alleen lezen: de pagina krijgt een volledige stand van de bron
 * (bron.js) en tekent die. Indeling:
 *   1. Instellingen en hulpfuncties
 *   2. Plattegrond
 *   3. Teller
 *   4. Kerncijfers, feestdagen, tussendoelen en feestmoment
 *   5. Ranglijst en laatste bestellingen
 *   6. Verloop (grafiek)
 *   7. Tafeldetail
 *   8. Delen met QR-code
 *   9. Status, klok, beamer en start
 */
(function () {
  /* ---- 1. Instellingen en hulpfuncties ---- */
  const cfg = Object.assign({}, window.BF_CONFIG);
  const q = new URLSearchParams(location.search);
  if (q.has('demo')) cfg.bron = 'demo';
  const beamer = q.has('beamer');

  const $ = id => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const fmt1 = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt0 = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });
  const liter = ml => fmt1.format(ml / 1000);
  const zaalNaam = nr => (ZAAL.zaalVan[nr] === 'tuinzaal' ? 'Tuinzaal' : 'Grote zaal');
  const verminderBeweging = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqGsm = matchMedia('(max-width: 899px)');
  const mqGroot = matchMedia('(min-width: 1200px) and (min-aspect-ratio: 4/3)');

  function el(naam, attrs, ouder) {
    const e = document.createElementNS(SVGNS, naam);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (ouder) ouder.append(e);
    return e;
  }
  const html = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uurMin = ts => new Date(ts).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  /* Korte relatieve tijd: "nu", "3 min geleden", of het uur als het langer dan een uur geleden is. */
  function geleden(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 45) return 'nu';
    const m = Math.round(s / 60);
    return m < 60 ? `${m} min geleden` : `om ${uurMin(ts)}`;
  }

  let laatsteStand = null;
  let rangVan = {};

  /* ---- 2. Plattegrond ----
   * Groot scherm: één plan met beide zalen naast elkaar, zoals in het echt.
   * Gsm: elke zaal apart onder elkaar (anders worden de tafels te klein), met
   * de verbindingsdeuren aangeduid. De lege middenzone van de grote zaal (tussen de
   * linker- en rechterrij tafels) wordt smaller getekend, zodat de tafels groter blijven. */
  const BREUK = { van: 125, tot: 410, nieuw: 64 };   // 64: tafels 38 en 39 (56,5 breed) passen er nog in
  function maakFx(zaal, inkorten) {
    if (!inkorten || zaal.id !== 'grote-zaal') return { fx: x => x, breedte: zaal.breedte };
    const f = BREUK.nieuw / (BREUK.tot - BREUK.van);
    const fx = x => x <= BREUK.van ? x : x >= BREUK.tot ? x - (BREUK.tot - BREUK.van) + BREUK.nieuw : BREUK.van + (x - BREUK.van) * f;
    return { fx, breedte: fx(zaal.breedte) };
  }
  /* Pad met absolute commando's (M L H V A Z) horizontaal herschalen. */
  function padFx(d, fx) {
    let uit = '', cmd = '', arg = 0;
    for (const t of d.match(/[MLHVAZ]|-?[\d.]+/g)) {
      if (/[A-Z]/.test(t)) { cmd = t; arg = 0; uit += t; continue; }
      let n = parseFloat(t);
      if (((cmd === 'M' || cmd === 'L') && arg % 2 === 0) || cmd === 'H' || (cmd === 'A' && arg % 7 === 5)) n = fx(n);
      uit += (arg ? ' ' : '') + Math.round(n * 10) / 10;
      arg++;
    }
    return uit;
  }

  const tafelEls = {};     // nr -> { g, vul, clip, l1, l2, h, title, laatsteMl }
  const zaalSomEls = {};   // zaal-id -> text-element met de liters van die zaal

  function tekenZaal(zaal, ouder, inkorten) {
    const { fx, breedte } = maakFx(zaal, inkorten);
    el('rect', { class: 'vloer', x: 0, y: 0, width: breedte, height: zaal.hoogte, rx: 3 }, ouder);
    for (const e of zaal.elementen) {
      el('path', { class: 'el el-' + e.soort, d: padFx(e.pad, fx) }, ouder);
      if (!e.label) continue;
      /* Een label met een breedte (labelBereik) blijft gecentreerd op het element, ook als de zaal ingekort is. */
      const [lx, ly] = e.labelPos;
      const x = e.labelBereik ? (fx(e.labelBereik[0]) + fx(e.labelBereik[1])) / 2 : fx(lx);
      const t = el('text', { class: 'el-label el-label-' + e.soort, x, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, ouder);
      if (e.draai) t.setAttribute('transform', `rotate(${e.draai} ${x} ${ly})`);
      t.textContent = e.label;
    }
    el('text', { class: 'zaal-naam', x: 2, y: -9 }, ouder).textContent = zaal.naam;
    zaalSomEls[zaal.id] = el('text', { class: 'zaal-som', x: breedte - 2, y: -9, 'text-anchor': 'end' }, ouder);
    zaalSomEls[zaal.id].textContent = '0,0 L';

    for (const [nr, [x0, y, w, h]] of Object.entries(zaal.tafels)) {
      const g = el('g', { class: 'tafel', transform: `translate(${fx(x0 + w / 2) - w / 2} ${y})`, tabindex: 0, role: 'button', 'data-nr': nr }, ouder);
      const clipId = 'clip-' + nr;
      const clip = el('rect', { x: 0, y: h, width: w, height: 0 }, el('clipPath', { id: clipId }, g));
      el('rect', { class: 't-blad', width: w, height: h }, g);
      const vul = el('rect', { class: 't-vul', y: h, width: w, height: 0 }, g);
      el('rect', { class: 't-rand', width: w, height: h }, g);
      /* Twee keer dezelfde tekst: één in inkt, één in papierkleur die enkel zichtbaar is waar de tafel "vol" is. */
      const ny = h > w ? h * 0.36 : h * 0.4, ly = h > w ? h * 0.7 : h * 0.77;
      const tekst = extra => {
        const tg = el('g', extra, g);
        el('text', { class: 't-nr', x: w / 2, y: ny, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, tg).textContent = nr;
        const tl = el('text', { class: 't-liter', x: w / 2, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, tg);
        tl.textContent = '0,0';
        return tl;
      };
      const l1 = tekst({ class: 't-tekst' });
      const l2 = tekst({ class: 't-tekst t-tekst-op-vul', 'clip-path': `url(#${clipId})` });
      tafelEls[nr] = { g, vul, clip, l1, l2, h, title: el('title', {}, g), laatsteMl: -1 };
    }
    return breedte;
  }

  function bouwPlannen() {
    const m = 10, kop = 30, S = ZAAL.samen;
    const zalen = Object.fromEntries(ZAAL.zalen.map(z => [z.id, z]));
    const svgs = [];
    if (!mqGsm.matches) {
      const tz = zalen['tuinzaal'], gz = zalen['grote-zaal'];
      const [tx, ty] = S.plaats['tuinzaal'], gy = S.plaats['grote-zaal'][1];
      const svg = el('svg', { role: 'group', 'aria-label': 'Plan van de zaal: tuinzaal links, grote zaal rechts' });
      const bT = tekenZaal(tz, el('g', { transform: `translate(${tx} ${ty})` }, svg), false);
      const gx = tx + bT + S.muur;
      /* Tussenmuur met de twee doorgangen. */
      let y = ty, d = '';
      for (const [van, tot] of S.doorgangen) { d += `M${bT + S.muur / 2} ${y}V${van}`; y = tot; }
      d += `M${bT + S.muur / 2} ${y}V${ty + tz.hoogte}`;
      el('path', { class: 'tussenmuur', d, 'stroke-width': S.muur }, svg);
      for (const [van, tot] of S.doorgangen) el('path', { class: 'doorgang', d: `M${bT - 4} ${(van + tot) / 2}H${gx + 4}` }, svg);
      const bG = tekenZaal(gz, el('g', { transform: `translate(${gx} ${gy})` }, svg), cfg.plan_inkorten);
      svg.setAttribute('viewBox', `${-m} ${-kop} ${gx + bG + 2 * m} ${Math.max(gz.hoogte + gy, tz.hoogte + ty) + kop + m}`);
      svgs.push(svg);
    } else {
      for (const id of ['grote-zaal', 'tuinzaal']) {
        const z = zalen[id], tuin = id === 'tuinzaal';
        const svg = el('svg', { role: 'group', 'aria-label': `Plan ${z.naam}` });
        const b = tekenZaal(z, el('g', {}, svg), !tuin);
        /* Verbindingsdeuren aanduiden: in het echt hangen de zalen hier aan elkaar. */
        const oy = S.plaats[id][1];
        for (const [van, tot] of S.doorgangen) {
          const yy = (van + tot) / 2 - oy, x = tuin ? b + 9 : -9;   // net buiten de muur, gecentreerd op de deur
          el('text', { class: 'doorgang-label', x, y: yy, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `rotate(${tuin ? 90 : -90} ${x} ${yy})` }, svg)
            .textContent = tuin ? 'naar grote zaal' : 'naar tuinzaal';
        }
        svg.setAttribute('viewBox', `${-m - 6} ${-kop} ${b + 2 * m + 12} ${z.hoogte + kop + m}`);   // extra zijmarge voor de deurlabels
        svgs.push(svg);
      }
    }
    svgs.forEach(s => { s.classList.add('plan-svg'); s.setAttribute('preserveAspectRatio', 'xMidYMin meet'); });   // bovenaan uitlijnen met de andere kolommen
    $('plan').replaceChildren(...svgs);
    $('plan').dataset.weergave = mqGsm.matches ? 'apart' : 'samen';
    if (laatsteStand) toonTafels(laatsteStand, true);
  }

  function toonTafels(s, eerste) {
    /* De volste tafel is "vol"; onder 2 L blijft de schaal op 2 L, zodat het begin van de avond niet overdreven oogt. */
    const maxMl = Math.max(2000, ...Object.values(s.tafels).map(t => t.ml));
    rangVan = {};
    Object.entries(s.tafels).filter(([nr, t]) => ZAAL.zaalVan[nr] && t.ml > 0)
      .sort((a, b) => b[1].ml - a[1].ml).forEach(([nr], i) => { rangVan[nr] = i + 1; });
    const perZaal = {};
    for (const [nr, e] of Object.entries(tafelEls)) {
      const t = s.tafels[nr] || { ml: 0 };
      perZaal[ZAAL.zaalVan[nr]] = (perZaal[ZAAL.zaalVan[nr]] || 0) + t.ml;
      const hv = e.h * t.ml / maxMl;
      for (const r of [e.vul, e.clip]) {
        r.setAttribute('y', e.h - hv); r.setAttribute('height', hv);
        r.style.y = (e.h - hv) + 'px'; r.style.height = hv + 'px';   // CSS-overgang in browsers die dat kennen
      }
      const tekst = liter(t.ml);
      e.l1.textContent = e.l2.textContent = tekst;
      e.g.setAttribute('aria-label', `Tafel ${nr}: ${tekst} liter`);
      e.title.textContent = `Tafel ${nr}: ${tekst} L`;
      if (!eerste && e.laatsteMl >= 0 && t.ml > e.laatsteMl) {
        e.g.classList.remove('t-tik'); void e.g.getBBox(); e.g.classList.add('t-tik');
      }
      e.laatsteMl = t.ml;
    }
    for (const [id, x] of Object.entries(zaalSomEls)) x.textContent = liter(perZaal[id] || 0) + ' L';
  }

  /* ---- 3. Teller ----
   * Elk cijfer is een strookje 0-9 dat twee keer herhaald is. Bij een nieuwe waarde
   * schuift het strookje enkel vooruit naar het volgende voorkomen van het nieuwe
   * cijfer (9 → 0 gaat dus naar beneden door, niet terug), en springt daarna
   * onzichtbaar terug naar de eerste helft. Zo staat elk cijfer na een halve
   * seconde weer recht; er blijft nooit een half cijfer hangen. */
  const teller = $('teller-getal');
  const STROOK = '0123456789'.repeat(2).split('').join('\n');
  function zetCijfer(c, cijfer, direct) {
    const rol = c.firstChild;
    let pos = +c.dataset.pos || 0;
    let doel = cijfer;
    while (doel < pos) doel += 10;
    if (doel === pos) return;
    const schuif = p => { rol.style.transform = `translateY(${-p * 5}%)`; };   // 20 regels = 5% per cijfer
    if (direct) { rol.style.transition = 'none'; schuif(cijfer); c.dataset.pos = cijfer; return; }
    rol.style.transition = '';
    schuif(doel);
    c.dataset.pos = doel;
    if (doel >= 10) {
      /* Na de overgang terug naar de eerste helft. Lees de positie opnieuw: er kan intussen al een nieuwe waarde gekomen zijn. */
      rol.addEventListener('transitionend', () => {
        const p = +c.dataset.pos;
        if (p >= 10) { rol.style.transition = 'none'; schuif(p - 10); c.dataset.pos = p - 10; }
      }, { once: true });
    }
  }
  function tekenTeller(ml, direct) {
    const tekst = fmt1.format(ml / 1000);
    if (teller.dataset.tekst?.length !== tekst.length) {
      teller.replaceChildren(...[...tekst].map(ch => {
        const s = document.createElement('span');
        if (/\d/.test(ch)) { s.className = 'c'; s.dataset.pos = 0; s.append(Object.assign(document.createElement('span'), { className: 'rol', textContent: STROOK })); }
        else { s.className = 'sep'; s.textContent = ch; }
        return s;
      }));
      direct = true;
    }
    teller.dataset.tekst = tekst;
    teller.setAttribute('aria-label', `${tekst} liter bier`);
    const cijfers = tekst.replace(/\D/g, '');
    teller.querySelectorAll('.c').forEach((c, i) => zetCijfer(c, +cijfers[i], direct || verminderBeweging || document.hidden));
  }

  /* ---- 4. Kerncijfers, feestdagen, tussendoelen en feestmoment ---- */
  /* Liter per uur over het laatste kwartier (de drie recentste emmers van 5 minuten). */
  function literPerUur(s) {
    const v = s.verloop, n = v?.ml.length || 0;
    if (n < 3) return 0;
    const som = v.ml[n - 1] + v.ml[n - 2] + v.ml[n - 3];
    const duur = (s.server_tijd || Date.now()) - (v.begin + (n - 3) * v.emmer_ms);
    return duur > 0 ? som / 1000 / (duur / 3600000) : 0;
  }
  function toonKerncijfers(s) {
    $('k-uur').textContent = fmt0.format(literPerUur(s));
    $('k-best').textContent = fmt0.format(s.bestellingen);
  }

  /* De server telt per feestdag (06:00 tot 06:00 Belgische tijd): de nacht tot 2u hoort bij de dag ervoor. */
  const weekdag = d => { const w = new Date(d + 'T12:00:00').toLocaleDateString('nl-BE', { weekday: 'long' }); return w[0].toUpperCase() + w.slice(1); };
  function toonDagen(s) {
    const dagen = s.dagen || [];
    $('dagen').hidden = !dagen.length;
    $('dagen').replaceChildren(...dagen.map(({ dag, ml }) => {
      const li = document.createElement('li');
      const nu = dag === s.vandaag;
      li.classList.toggle('dag-nu', nu);
      li.innerHTML = `<span class="dag-naam">${weekdag(dag)}${nu ? ' · vandaag' : ''}</span><span class="dag-l">${liter(ml)} L</span>`;
      return li;
    }));
  }

  /* Tussendoelen: elke `tussendoel_l` liter een feestmoment, met het record van vorig
   * jaar als apart doel. De balk loopt tot dat record, of tot het volgende
   * tussendoel zodra het record gebroken is. */
  let doelIndex = null, recordGehaald = false;
  function toonDoelen(s, eerste) {
    const L = s.totaal_ml / 1000, stap = cfg.tussendoel_l, vj = cfg.vorig_jaar_l || 0;
    const volgend = (Math.floor(L / stap) + 1) * stap;
    const einde = Math.max(vj, volgend);
    const record = vj && L >= vj;
    const doel = vj && !record ? Math.min(volgend, vj) : volgend;
    $('mb-label').textContent = record ? `Record gebroken! Volgend doel: ${fmt0.format(volgend)} L`
      : doel === vj ? `Op naar het record: ${fmt0.format(vj)} L`
      : `Volgend tussendoel: ${fmt0.format(doel)} L`;
    $('mb-rest').textContent = `nog ${fmt0.format(Math.max(0, Math.ceil(doel - L)))} L`;
    $('mb-vul').style.width = Math.min(100, L / einde * 100) + '%';

    /* Streepjes per tussendoel en een ster voor vorig jaar; enkel hertekenen als de schaal verandert. */
    const spoor = $('mb-spoor');
    if (spoor.dataset.einde !== String(einde)) {
      spoor.dataset.einde = einde;
      spoor.querySelectorAll('i').forEach(x => x.remove());
      for (let d = stap; d < einde; d += stap) {
        if (d !== vj) spoor.append(Object.assign(document.createElement('i'), { className: 'mb-streep', style: `left:${d / einde * 100}%` }));
      }
      if (vj) spoor.append(Object.assign(document.createElement('i'), { className: 'mb-vj', title: `Vorig jaar: ${fmt0.format(vj)} L`, style: `left:${vj / einde * 100}%` }));
      const vjOpEinde = vj === einde;
      $('mb-schaal').innerHTML = `<span>0</span>`
        + (vj && !vjOpEinde ? `<span class="mb-schaal-vj" style="left:${vj / einde * 100}%">vorig jaar</span>` : '')
        + `<span${vjOpEinde ? ' class="mb-schaal-vj-eind"' : ''}>${fmt0.format(einde)} L</span>`;
    }

    const idx = Math.floor(L / stap);
    if (doelIndex !== null && !eerste) {
      if (record && !recordGehaald) vier(vj, 'record');
      else if (idx > doelIndex) vier(idx * stap, 'tussendoel');
    }
    doelIndex = idx;
    recordGehaald = record;
  }
  function vier(l, soort) {
    const m = $('mijlpaal');
    $('mp-getal').textContent = fmt0.format(l);
    $('mp-tekst').textContent = soort === 'record' ? 'Record van vorig jaar gebroken!' : 'liter bier gedronken';
    m.dataset.soort = soort;
    m.classList.remove('weg');
    m.hidden = false;
    clearTimeout(vier.t);
    vier.t = setTimeout(() => { m.classList.add('weg'); setTimeout(() => { m.hidden = true; }, 600); }, soort === 'record' ? 12000 : 6500);
  }

  /* ---- 5. Ranglijst en laatste bestellingen ---- */
  function toonRanglijst(s) {
    const top = Object.entries(rangVan).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([nr]) => [nr, s.tafels[nr]]);
    const max = top[0]?.[1].ml || 1;
    $('ranglijst').innerHTML = top.length
      ? top.map(([nr, t], i) => `<li data-nr="${nr}"><span class="rl-rang">${i + 1}</span><span class="rl-naam">Tafel ${nr}<small>${zaalNaam(nr)}</small></span><span class="rl-liter">${liter(t.ml)} L</span><span class="rl-balk" style="--w:${(t.ml / max * 100).toFixed(1)}%"></span></li>`).join('')
      : '<li class="leeg">Nog geen bestellingen</li>';
  }

  function toonRecent(s) {
    const ul = $('recent');
    const sleutel = r => `${r.ts}-${r.t}-${r.ml}`;
    const vorige = ul.dataset.sleutel;
    ul.innerHTML = s.recent.length
      ? s.recent.map((r, i) => `<li${i === 0 && vorige && vorige !== sleutel(r) ? ' class="nieuw"' : ''}><span class="rc-tafel">${r.t ? 'Tafel ' + html(r.t) : 'Zonder tafel'}</span><span class="rc-wat">${r.p ? html(r.p) : ''}</span><span class="rc-ml">+${liter(r.ml)} L</span><span class="rc-tijd" data-ts="${r.ts}">${geleden(r.ts)}</span></li>`).join('')
      : '<li class="leeg">Wachten op de eerste bestelling</li>';
    ul.dataset.sleutel = s.recent[0] ? sleutel(s.recent[0]) : '';
    pasRecentAan();
  }
  /* Op groot scherm vult de lijst de kolom: zoveel regels als er volledig passen, nooit een halve.
   * Op gsm en tablet: hoogstens 6. */
  function pasRecentAan() {
    const items = [...$('recent').children];
    if (!mqGroot.matches) { items.forEach((li, i) => { li.hidden = i >= 6; }); return; }
    items.forEach(li => { li.hidden = false; });
    const onder = $('blok-recent').getBoundingClientRect().bottom;
    items.forEach(li => { li.hidden = li.getBoundingClientRect().bottom > onder + 0.5; });
  }

  /* ---- 6. Verloop ----
   * Linosnede: één inktblok per 5 minuten, het lopende blok in het rood. De viewBox
   * volgt de echte pixelmaat, zodat tekst nooit uitgerekt wordt. */
  function tekenVerloop() {
    const s = laatsteStand, svg = $('verloop-svg');
    if (!s?.verloop) return;
    const W = Math.max(200, Math.round(svg.clientWidth)), H = Math.max(60, Math.round(svg.clientHeight));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const ml = s.verloop.ml, n = ml.length;
    const voet = H - 16, top = 14;
    const max = Math.max(1000, ...ml);   // schaal minstens 1 L per 5 minuten, zodat een rustig begin niet overdreven oogt
    const bw = W / n, gat = Math.max(1, bw * 0.24);
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
    const piekI = ml.indexOf(Math.max(...ml));
    const px = piekI * bw + bw / 2;
    const piek = ml[piekI] > 0
      ? `<text class="vl-piek" x="${px.toFixed(1)}" y="${(voet - ml[piekI] / max * (voet - top) - 4).toFixed(1)}" text-anchor="${px > W - 40 ? 'end' : px < 40 ? 'start' : 'middle'}">${fmt1.format(ml[piekI] / 1000)} L</text>`
      : '';
    svg.innerHTML = `<g class="vl-inkt">${balken}<line class="vl-voet" x1="0" x2="${W}" y1="${voet}" y2="${voet}"/></g>${uren}${piek}`;
  }

  /* ---- 7. Tafeldetail: onderblad op gsm, zwevend kaartje op groot scherm ---- */
  let openNr = null;
  function openDetail(nr, anker) {
    openNr = nr;
    vulDetail();
    const d = $('tafel-detail');
    d.hidden = false;
    const zwevend = anker && !mqGsm.matches;
    d.classList.toggle('zwevend', !!zwevend);
    if (zwevend) {
      const r = anker.getBoundingClientRect(), bw = d.offsetWidth, bh = d.offsetHeight;
      let x = r.right + 12;
      if (x + bw > innerWidth - 16) x = r.left - bw - 12;
      d.style.left = Math.max(16, x) + 'px';
      d.style.top = Math.max(16, Math.min(innerHeight - bh - 16, r.top + r.height / 2 - bh / 2)) + 'px';
    } else d.style.left = d.style.top = '';
    document.querySelectorAll('.tafel.t-open').forEach(g => g.classList.remove('t-open'));
    tafelEls[nr]?.g.classList.add('t-open');
    $('td-sluit').focus({ preventScroll: true });
  }
  function vulDetail() {
    if (!openNr) return;
    const s = laatsteStand || { tafels: {}, totaal_ml: 0 };
    const t = s.tafels[openNr] || { ml: 0, n: 0, laatst: 0 };
    $('td-zaal').textContent = zaalNaam(openNr);
    $('td-titel').textContent = 'Tafel ' + openNr;
    $('td-liter').innerHTML = `${liter(t.ml)}<small> L</small>`;
    $('td-rang').textContent = rangVan[openNr] ? `${rangVan[openNr]} van ${Object.keys(ZAAL.zaalVan).length}` : 'nog geen';
    $('td-n').textContent = fmt0.format(t.n);
    $('td-deel').textContent = s.totaal_ml ? fmt1.format(t.ml / s.totaal_ml * 100) + ' %' : '0,0 %';
    $('td-laatst').textContent = t.laatst ? geleden(t.laatst) : 'nog geen';
  }
  function sluitDetail() {
    const g = tafelEls[openNr]?.g;
    $('tafel-detail').hidden = true;
    g?.classList.remove('t-open');
    openNr = null;
    g?.focus({ preventScroll: true });
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('.tafel, #ranglijst li[data-nr]');
    if (g) { const nr = g.dataset.nr; openDetail(nr, tafelEls[nr]?.g); return; }
    if (openNr && !e.target.closest('#tafel-detail')) sluitDetail();
  });
  $('td-sluit').addEventListener('click', sluitDetail);

  /* ---- 8. Delen met QR-code ----
   * Wie de site open heeft, toont de code aan iemand anders, die hem scant. De code
   * wordt in de browser gemaakt (qrcode-generator, MIT), zonder externe dienst. */
  const deelUrl = () => cfg.deel_url || (location.origin + location.pathname);
  function openDeel() {
    const url = deelUrl(), qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('deel-qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true, alt: 'QR-code naar ' + url });
    $('deel-url').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    $('deel-delen').hidden = !navigator.share;
    $('deel').hidden = false;
    $('deel-sluit').focus({ preventScroll: true });
  }
  function sluitDeel() { $('deel').hidden = true; $('deel-knop').focus({ preventScroll: true }); }
  $('deel-knop').addEventListener('click', openDeel);
  $('deel-sluit').addEventListener('click', sluitDeel);
  $('deel').addEventListener('click', e => { if (e.target === $('deel')) sluitDeel(); });
  $('deel-kopieer').addEventListener('click', async () => {
    const knop = $('deel-kopieer');
    try { await navigator.clipboard.writeText(deelUrl()); knop.textContent = 'Gekopieerd'; }
    catch { getSelection().selectAllChildren($('deel-url')); knop.textContent = 'Geselecteerd, kopieer zelf'; }
    setTimeout(() => { knop.textContent = 'Kopieer link'; }, 2500);
  });
  $('deel-delen').addEventListener('click', () => navigator.share?.({ title: 'Herentalse Bierfeesten', url: deelUrl() }).catch(() => {}));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('deel').hidden) sluitDeel(); else if (openNr) sluitDetail(); }
    const g = e.target.closest?.('.tafel');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(g.dataset.nr, g); }
    if (beamer && e.key === 'f') document.documentElement.requestFullscreen?.().catch(() => {});
  });

  /* ---- 9. Status, klok, beamer en start ---- */
  /* Zonder verbinding blijft de laatst gekende stand staan, met het uur erbij. */
  function onStatus(staat, tekst) {
    if (laatsteStand && staat === 'weg') tekst = `Geen verbinding · stand van ${uurMin(laatsteStand.server_tijd)}`;
    if (laatsteStand && staat === 'verbinden' && uitCache) tekst = `Verbinden… · stand van ${uurMin(laatsteStand.server_tijd)}`;
    $('status').dataset.staat = staat;
    $('status-tekst').textContent = tekst;
    /* Op gsm staat de voettekst ver weg: een wegvallende verbinding krijgt bovenaan een eigen band. */
    const band = $('verbinding-band');
    band.hidden = staat !== 'weg';
    if (staat === 'weg') band.textContent = laatsteStand
      ? `Geen verbinding. Je ziet de stand van ${uurMin(laatsteStand.server_tijd)}; de teller loopt verder zodra het netwerk terug is.`
      : 'Geen verbinding met de telling. Opnieuw proberen…';
  }

  /* ---- Laatste stand bewaren op het toestel ----
   * Zo toont de pagina meteen iets bij het openen, ook als het netwerk in de zaal hapert
   * (de pagina zelf komt dan uit de service worker, sw.js). Enkel echte live standen, nooit de demo in de browser. */
  const gevraagdeEditie = q.get('editie') || cfg.editie || 'standaard';
  const BEWAARSLEUTEL = 'bf-stand:' + gevraagdeEditie;
  let laatstBewaard = 0;
  function bewaarStand(s, vanToestel) {
    if (vanToestel || cfg.bron === 'demo' || Date.now() - laatstBewaard < 5000) return;
    laatstBewaard = Date.now();
    try { localStorage.setItem(BEWAARSLEUTEL, JSON.stringify(s)); } catch {}
  }
  function bewaardeStand() {
    try { return JSON.parse(localStorage.getItem(BEWAARSLEUTEL)); } catch { return null; }
  }
  function toonVoet() {
    if (!laatsteStand?.bestellingen) return;
    $('voet-info').textContent = `Laatste bestelling ${geleden(laatsteStand.bijgewerkt)} · cijfers komen rechtstreeks uit de kassa`;
  }
  /* Relatieve tijden ("3 min geleden") lopen ook zonder nieuwe bestellingen mee. */
  setInterval(() => {
    document.querySelectorAll('.rc-tijd').forEach(x => { x.textContent = geleden(+x.dataset.ts); });
    toonVoet();
    vulDetail();
  }, 15000);

  /* Het live voorbeeld van de server is altijd duidelijk gemarkeerd. */
  function toonDemoBand(s) {
    const band = $('demo-band');
    if (!s.demo || cfg.bron === 'demo') return;
    const uren = Math.round((s.demo_reset_ms || 0) / 3600000);
    band.firstElementChild.innerHTML = `<b>Live voorbeeld</b> met verzonnen bestellingen: zo ziet de teller eruit tijdens de Bierfeesten.${uren ? ` Begint om de ${uren} uur opnieuw.` : ''}`;
    band.hidden = false;
  }

  /* uitCache: de getoonde stand komt van het toestel. De eerste echte stand daarna telt als "eerste":
   * geen feestmoment voor een tussendoel dat al lang gehaald was, geen knipperende tafels. */
  let uitCache = false;
  function onStand(s, vanToestel = false) {
    const eerste = !laatsteStand || uitCache;
    uitCache = vanToestel;
    laatsteStand = s;
    bewaarStand(s, vanToestel);
    toonDemoBand(s);
    tekenTeller(s.totaal_ml, eerste);
    toonTafels(s, eerste);
    toonKerncijfers(s);
    toonDagen(s);
    toonDoelen(s, eerste);
    toonRanglijst(s);
    toonRecent(s);
    tekenVerloop();
    toonVoet();
    vulDetail();
  }

  if (beamer) {
    const wakker = () => navigator.wakeLock?.request('screen').catch(() => {});
    wakker();
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wakker());
    let t;
    addEventListener('mousemove', () => { document.body.classList.remove('cursor-weg'); clearTimeout(t); t = setTimeout(() => document.body.classList.add('cursor-weg'), 3000); });
  }

  let herteken;
  addEventListener('resize', () => { clearTimeout(herteken); herteken = setTimeout(() => { tekenVerloop(); pasRecentAan(); }, 150); });
  mqGsm.addEventListener('change', bouwPlannen);

  bouwPlannen();
  tekenTeller(0, true);
  if (cfg.bron === 'demo') {
    $('demo-band').hidden = false;
    new BRON.DemoBron(onStand, onStatus).start();
  } else {
    const bewaard = bewaardeStand();
    if (bewaard?.tafels) onStand(bewaard, true);
    new BRON.LiveBron(cfg.api, onStand, onStatus).start();
  }

  /* Service worker: enkel op een echte site (niet in een voorbeeldomgeving zonder eigen domein). */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
