/* Afdrukbaar tafelplan (A4, 3 pagina's) in de stijl van de site (Stempel: geel papier, zwarte inkt):
 *   1. beide zalen naast elkaar zoals in het echt
 *   2. enkel de tuinzaal
 *   3. enkel de grote zaal
 * Per pagina kiest het script liggend of staand, naargelang wat de plattegrond het grootst maakt.
 * De middenzone van de grote zaal is smaller getekend dan op de originele tekening, zoals op de site.
 * Elke pagina vult het papier zo goed mogelijk, met de tafelnummers zo groot als de tafels toelaten.
 *
 * Gebruik:  node tools/tafelplan-pdf.mjs [uitvoer.pdf]
 * Bron:     public/js/zaal.js (dezelfde plattegrond als de site)
 */
import { chromium } from 'playwright';
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UIT = process.argv[2] || 'tafelplan.pdf';

/* zaal.js is een browserscript dat window.ZAAL zet: hier in een zandbak uitvoeren. */
const zandbak = { window: {} };
vm.runInNewContext(readFileSync(ROOT + 'public/js/zaal.js', 'utf8'), zandbak);
const ZAAL = zandbak.window.ZAAL;
const S = ZAAL.samen;
const zalen = Object.fromEntries(ZAAL.zalen.map(z => [z.id, z]));
const tz = zalen['tuinzaal'], gz = zalen['grote-zaal'];

/* Lettertypes van de site, ingebed (geen netwerk nodig). */
const font = f => `data:font/woff2;base64,${readFileSync(ROOT + 'public/fonts/' + f).toString('base64')}`;

/* Eén lettergrootte voor alle tafels: de grootste die in de kleinste tafel past (Anton-cijfer ≈ 0,5 em breed). */
const alleTafels = ZAAL.zalen.flatMap(z => Object.entries(z.tafels));
const korte = Math.min(...alleTafels.map(([, [, , w, h]]) => Math.min(w, h)));
const FS = Math.floor(Math.min(korte * 0.80, (korte * 0.88) / (0.5 * 2)));   // 2 cijfers moeten in de smalle kant passen

/* De lege middenzone van de grote zaal is in het echt smaller dan op de originele tekening:
 * zoals op de site (BREUK in public/js/app.js) wordt die zone smaller getekend. Tafels behouden
 * hun maat en schuiven mee met hun midden; paden worden horizontaal herschaald. */
const BREUK = { van: 125, tot: 410, nieuw: 64 };
function maakFx(z) {
  if (z.id !== 'grote-zaal') return { fx: x => x, breedte: z.breedte };
  const f = BREUK.nieuw / (BREUK.tot - BREUK.van);
  const fx = x => x <= BREUK.van ? x : x >= BREUK.tot ? x - (BREUK.tot - BREUK.van) + BREUK.nieuw : BREUK.van + (x - BREUK.van) * f;
  return { fx, breedte: fx(z.breedte) };
}
/* Pad met absolute commando's (M L H V A Z) horizontaal herschalen (zelfde als padFx op de site). */
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

function zaal(z, ox, oy) {
  const { fx, breedte } = maakFx(z);
  let s = `<g transform="translate(${ox} ${oy})">`;
  s += `<rect class="vloer" width="${breedte}" height="${z.hoogte}" rx="2"/>`;
  for (const e of z.elementen) {
    s += `<path class="el el-${e.soort}" d="${padFx(e.pad, fx)}"/>`;
    if (e.label) {
      const x = e.labelBereik ? (fx(e.labelBereik[0]) + fx(e.labelBereik[1])) / 2 : fx(e.labelPos[0]), y = e.labelPos[1];
      s += `<text class="el-label el-label-${e.soort}" x="${x}" y="${y}"${e.draai ? ` transform="rotate(${e.draai} ${x} ${y})"` : ''}>${e.label}</text>`;
    }
  }
  s += `<text class="zaal-naam" x="0" y="-10">${z.naam}</text>`;
  for (const [nr, [x0, y, w, h]] of Object.entries(z.tafels)) {
    const x = fx(x0 + w / 2) - w / 2;
    s += `<rect class="tafel" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    s += `<text class="nr" x="${x + w / 2}" y="${y + h / 2}" font-size="${FS}">${nr}</text>`;
  }
  return s + '</g>';
}

/* Pagina 1: beide zalen, uitgelijnd op de verbindingsdeuren. */
function samen() {
  const [tx, ty] = S.plaats['tuinzaal'];
  const gx = tx + tz.breedte + S.muur, gy = S.plaats['grote-zaal'][1];
  let muur = '', y = ty;
  for (const [van, tot] of S.doorgangen) { muur += `M${tz.breedte + S.muur / 2} ${y}V${van}`; y = tot; }
  muur += `M${tz.breedte + S.muur / 2} ${y}V${ty + tz.hoogte}`;
  const breedte = gx + maakFx(gz).breedte, hoogte = Math.max(gz.hoogte + gy, tz.hoogte + ty);
  return {
    viewBox: `-4 -34 ${breedte + 20} ${hoogte + 38}`,   // rechts extra plaats voor het label "kinderhoek" buiten de muur
    inhoud: zaal(tz, tx, ty)
      + `<path class="tussenmuur" d="${muur}" stroke-width="${S.muur}"/>`
      + S.doorgangen.map(([van, tot]) => `<path class="doorgang" d="M${tz.breedte - 6} ${(van + tot) / 2}H${gx + 6}"/>`).join('')
      + zaal(gz, gx, gy)
  };
}
const apart = z => ({ viewBox: `-4 -34 ${maakFx(z).breedte + (z.id === 'grote-zaal' ? 20 : 8)} ${z.hoogte + 38}`, inhoud: zaal(z, 0, 0) });

/* Per pagina de stand van het papier die de plattegrond het grootst maakt. */
const A4 = [297, 210], MARGE = 7;
function pagina(p) {
  const [, , w, h] = p.viewBox.split(' ').map(Number);
  const schaal = ([pw, ph]) => Math.min((pw - 2 * MARGE) / w, (ph - 2 * MARGE) / h);
  const liggend = schaal(A4) >= schaal([A4[1], A4[0]]);
  return { ...p, liggend, mmPerEenheid: schaal(liggend ? A4 : [A4[1], A4[0]]) };
}

function html(p) {
  const [pw, ph] = p.liggend ? A4 : [A4[1], A4[0]];
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
  @font-face { font-family: Anton; src: url(${font('anton-400.woff2')}); }
  @font-face { font-family: 'Courier Prime'; font-weight: 700; src: url(${font('courier-prime-700.woff2')}); }
  @page { size: ${pw}mm ${ph}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: ${pw}mm; height: ${ph}mm; }
  body { padding: ${MARGE}mm; }
  svg { display: block; width: 100%; height: 100%; }
  /* Stijl "Stempel" zoals de site: geel affichepapier, zwarte inkt, ruwe randen */
  html, body { background: #FDDF59; }
  .vloer { fill: #FFE88A; stroke: #151110; stroke-width: 3; }
  .tafel { fill: #FFF4C7; stroke: #151110; stroke-width: 2.4; }
  .nr { font-family: Anton, Impact, sans-serif; fill: #151110; text-anchor: middle; dominant-baseline: central; }
  .el-toog, .el-kassa, .el-scherm, .el-podium { fill: #151110; }
  .el-kassa { stroke: #FFE88A; stroke-width: 2; }
  .el-muur { fill: none; stroke: #151110; stroke-width: 3.5; stroke-linecap: round; }
  .el-deur { fill: none; stroke: #151110; stroke-width: 1.5; stroke-dasharray: 3 3; opacity: .8; }
  .el-label { font-family: Anton, Impact, sans-serif; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; fill: #FDDF59; text-anchor: middle; dominant-baseline: central; }
  .el-label-scherm { font-size: 9px; }
  .el-label-deur { font-family: 'Courier Prime', monospace; font-weight: 700; font-size: 11px; fill: #C23B22; text-transform: none; letter-spacing: .04em; }
  .tussenmuur { fill: none; stroke: #151110; }
  .doorgang { fill: none; stroke: #C23B22; stroke-width: 2; stroke-dasharray: 3 3; }
  .zaal-naam { font-family: Anton, Impact, sans-serif; font-size: 22px; letter-spacing: .04em; text-transform: uppercase; fill: #151110; }
  .vloer, .el, .tafel, .tussenmuur, .zaal-naam { filter: url(#ruw); }
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${p.viewBox}" preserveAspectRatio="xMidYMid meet">
  <defs><filter id="ruw" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="ruis"/>
    <feDisplacementMap in="SourceGraphic" in2="ruis" scale="3.2"/>
  </filter></defs>
  ${p.inhoud}</svg>
</body></html>`;
}

const paginas = [samen(), apart(tz), apart(gz)].map(pagina);
const browser = await chromium.launch();
const p = await browser.newPage();
const delen = [];
for (const [i, pg] of paginas.entries()) {
  await p.setContent(html(pg), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const deel = UIT.replace(/\.pdf$/, `-deel${i + 1}.pdf`);
  await p.pdf({ path: deel, preferCSSPageSize: true, printBackground: true });
  delen.push(deel);
  console.log(`Pagina ${i + 1}: ${pg.liggend ? 'liggend' : 'staand'}, tafelnummers ${(FS * pg.mmPerEenheid).toFixed(1)} mm hoog (cijferhoogte ≈ ${(FS * pg.mmPerEenheid * 0.73).toFixed(1)} mm)`);
}
await browser.close();
execFileSync('pdfunite', [...delen, UIT]);
for (const d of delen) rmSync(d);
console.log(`Tafelplan: ${UIT}`);
