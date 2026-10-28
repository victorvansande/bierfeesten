/* Afdrukbaar tafelplan (A4 liggend): tuinzaal en grote zaal naast elkaar, zoals in het echt,
 * met de tafelnummers zo groot als de tafels toelaten. Zwart op wit, zuinig voor de printer.
 *
 * Gebruik:  node tools/tafelplan-pdf.mjs [uitvoer.pdf]
 * Bron:     public/js/zaal.js (dezelfde plattegrond als de site)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UIT = process.argv[2] || 'tafelplan.pdf';

/* zaal.js is een browserscript dat window.ZAAL zet: hier in een zandbak uitvoeren. */
const zandbak = { window: {} };
vm.runInNewContext(readFileSync(ROOT + 'public/js/zaal.js', 'utf8'), zandbak);
const ZAAL = zandbak.window.ZAAL;
const logo = readFileSync(ROOT + 'tools/bron/logo-masker-groot.png').toString('base64');

const S = ZAAL.samen;
const zalen = Object.fromEntries(ZAAL.zalen.map(z => [z.id, z]));
const tz = zalen['tuinzaal'], gz = zalen['grote-zaal'];
const [tx, ty] = S.plaats['tuinzaal'];
const gx = tx + tz.breedte + S.muur, gy = S.plaats['grote-zaal'][1];

/* Eén lettergrootte voor alle tafels: de grootste die in de kleinste tafel past (Anton-cijfer ≈ 0,5 em breed). */
const alleTafels = ZAAL.zalen.flatMap(z => Object.entries(z.tafels));
const korte = Math.min(...alleTafels.map(([, [, , w, h]]) => Math.min(w, h)));
const lange = Math.min(...alleTafels.map(([, [, , w, h]]) => Math.max(w, h)));
const FS = Math.floor(Math.min(korte * 0.80, (korte * 0.88) / (0.5 * 2)));   // 2 cijfers moeten in de smalle kant passen

function zaal(z, ox, oy) {
  let s = `<g transform="translate(${ox} ${oy})">`;
  s += `<rect class="vloer" width="${z.breedte}" height="${z.hoogte}" rx="2"/>`;
  for (const e of z.elementen) {
    s += `<path class="el el-${e.soort}" d="${e.pad}"/>`;
    if (e.label) {
      const x = e.labelBereik ? (e.labelBereik[0] + e.labelBereik[1]) / 2 : e.labelPos[0], y = e.labelPos[1];
      s += `<text class="el-label el-label-${e.soort}" x="${x}" y="${y}"${e.draai ? ` transform="rotate(${e.draai} ${x} ${y})"` : ''}>${e.label}</text>`;
    }
  }
  s += `<text class="zaal-naam" x="0" y="-12">${z.naam}</text>`;
  for (const [nr, [x, y, w, h]] of Object.entries(z.tafels)) {
    s += `<rect class="tafel" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    s += `<text class="nr" x="${x + w / 2}" y="${y + h / 2}" font-size="${FS}">${nr}</text>`;
  }
  return s + '</g>';
}

let muur = '', y = ty;
for (const [van, tot] of S.doorgangen) { muur += `M${tz.breedte + S.muur / 2} ${y}V${van}`; y = tot; }
muur += `M${tz.breedte + S.muur / 2} ${y}V${ty + tz.hoogte}`;
const breedte = gx + gz.breedte, hoogte = Math.max(gz.hoogte + gy, tz.hoogte + ty);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -40 ${breedte + 16} ${hoogte + 48}">
  ${zaal(tz, tx, ty)}
  <path class="tussenmuur" d="${muur}" stroke-width="${S.muur}"/>
  ${S.doorgangen.map(([van, tot]) => `<path class="doorgang" d="M${tz.breedte - 6} ${(van + tot) / 2}H${gx + 6}"/>`).join('')}
  ${zaal(gz, gx, gy)}
</svg>`;

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Courier+Prime:wght@400;700&display=block" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 297mm; height: 210mm; }
  body { display: grid; grid-template-columns: 1fr 52mm; gap: 6mm; padding: 8mm 9mm; font-family: 'Courier Prime', monospace; color: #151110; }
  svg { width: 100%; height: 194mm; display: block; }
  .vloer { fill: #fff; stroke: #151110; stroke-width: 3; }
  .tafel { fill: #fff; stroke: #151110; stroke-width: 2.4; }
  .nr { font-family: Anton, Impact, sans-serif; fill: #151110; text-anchor: middle; dominant-baseline: central; }
  .el-toog, .el-kassa, .el-scherm, .el-podium { fill: #d6d3cf; stroke: #151110; stroke-width: 1.2; }
  .el-muur { fill: none; stroke: #151110; stroke-width: 3.5; stroke-linecap: round; }
  .el-deur { fill: none; stroke: #151110; stroke-width: 1.3; stroke-dasharray: 3 3; }
  .el-label { font-family: Anton, Impact, sans-serif; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; fill: #151110; text-anchor: middle; dominant-baseline: central; }
  .el-label-scherm { font-size: 9px; }
  .tussenmuur { fill: none; stroke: #151110; }
  .doorgang { fill: none; stroke: #151110; stroke-width: 1.5; stroke-dasharray: 3 3; }
  .zaal-naam { font-family: Anton, Impact, sans-serif; font-size: 24px; letter-spacing: .04em; text-transform: uppercase; fill: #151110; }
  aside { display: flex; flex-direction: column; gap: 6mm; padding-top: 2mm; }
  .logo { width: 100%; aspect-ratio: 1754 / 831; background: #151110; -webkit-mask: url(data:image/png;base64,${logo}) center / contain no-repeat; }
  h1 { margin: 0; font: 400 20pt/1.05 Anton, Impact, sans-serif; text-transform: uppercase; letter-spacing: .03em; }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 1.5mm 3mm; font-size: 9pt; }
  dt { font-weight: 700; } dd { margin: 0; }
  .klein { font-size: 7.5pt; color: #555; margin-top: auto; }
</style></head><body>
${svg}
<aside>
  <div class="logo" role="img" aria-label="Herentalse Bierfeesten"></div>
  <h1>Tafelplan</h1>
  <dl>
    <dt>Tuinzaal</dt><dd>54 t/m 71</dd>
    <dt>Grote zaal</dt><dd>1 t/m 53</dd>
    <dt>Totaal</dt><dd>${alleTafels.length} tafels</dd>
  </dl>
  <dl>
    <dt>- - -</dt><dd>deur en doorgang tussen de zalen</dd>
  </dl>
  <div class="klein">Gemaakt uit de tafelplannen van de Bierfeesten; dezelfde plattegrond als op de live site.</div>
</aside>
</body></html>`;

const browser = await chromium.launch();
const p = await browser.newPage();
await p.setContent(html, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: UIT, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
await p.screenshot({ path: UIT.replace(/\.pdf$/, '.png'), fullPage: true });
await browser.close();
console.log(`Tafelplan: ${UIT} (tafelnummers ${FS} eenheden hoog, tafel ${Math.round(korte)} x ${Math.round(lange)})`);
