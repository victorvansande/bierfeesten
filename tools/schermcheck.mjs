/* Schermcontrole: draait de pagina (demo) op gsm-, tablet- en beamerformaat en faalt
 * bij alles wat op gsm misloopt. 95% van de bezoekers kijkt op gsm, dus dit draait
 * bij elke wijziging (lokaal én in GitHub Actions).
 *
 *   node tools/schermcheck.mjs [basis-url] [map-voor-screenshots]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASIS = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const MAP = process.argv[3] || 'schermcheck';
mkdirSync(MAP, { recursive: true });

const FORMATEN = [
  { naam: 'gsm-klein', w: 360, h: 740, gsm: true },   // kleine Android
  { naam: 'gsm', w: 375, h: 812, gsm: true },         // iPhone mini / SE-breedte
  { naam: 'gsm-groot', w: 430, h: 932, gsm: true },   // iPhone Pro Max
  { naam: 'tablet', w: 1024, h: 1366 },
  { naam: 'laptop', w: 1310, h: 1000 },
  { naam: 'beamer', w: 1920, h: 1080, beamer: true }
];

let fouten = 0;
const meld = (ok, wat) => { console.log((ok ? 'ok   ' : 'FOUT ') + wat); if (!ok) fouten++; };

const browser = await chromium.launch();
for (const f of FORMATEN) {
  const p = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: f.gsm ? 2 : 1, isMobile: !!f.gsm, hasTouch: !!f.gsm });
  const fout = [];
  p.on('pageerror', e => fout.push(e.message));
  p.on('console', m => { if (m.type() === 'error') fout.push(m.text()); });
  await p.goto(`${BASIS}/?demo${f.beamer ? '&beamer' : ''}`);
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const vw = innerWidth;
    const uitsteek = [...document.querySelectorAll('body *')]
      .filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > vw + 1 || b.left < -1) && !e.closest('.defs'); })
      .slice(0, 5).map(e => (e.id || e.className.baseVal || e.className || e.tagName));
    const tafels = [...document.querySelectorAll('.tafel')].map(t => t.getBoundingClientRect());
    const kleinste = tafels.reduce((m, b) => Math.min(m, b.width, b.height), Infinity);
    const nrs = [...document.querySelectorAll('.t-tekst:not(.t-tekst-op-vul) .t-nr')].map(t => t.getBoundingClientRect().height);
    const teller = document.getElementById('teller-getal').getBoundingClientRect();
    return {
      scroll: document.documentElement.scrollWidth, vw, uitsteek,
      tafels: tafels.length, kleinste, nrHoogte: Math.min(...nrs),
      tellerZichtbaar: teller.top >= 0 && teller.bottom <= innerHeight,
      tellerRechts: teller.right
    };
  });
  meld(r.scroll <= r.vw, `${f.naam}: geen horizontaal scrollen (${r.scroll} ≤ ${r.vw})${r.uitsteek.length ? ' steekt uit: ' + r.uitsteek.join(', ') : ''}`);
  meld(r.tafels === 71, `${f.naam}: alle 71 tafels getekend (${r.tafels})`);
  meld(r.tellerZichtbaar, `${f.naam}: teller volledig zichtbaar zonder scrollen`);
  meld(fout.length === 0, `${f.naam}: geen fouten in de console${fout.length ? ': ' + fout.join(' | ') : ''}`);
  if (f.gsm) {
    /* Apple en Google raden ~44 px aan voor aanraakdoelen; een tafel moet minstens 28 px zijn om er betrouwbaar op te tikken. */
    meld(r.kleinste >= 28, `${f.naam}: tafels groot genoeg om aan te tikken (kleinste zijde ${r.kleinste.toFixed(0)} px ≥ 28)`);
    meld(r.nrHoogte >= 9, `${f.naam}: tafelnummers leesbaar (${r.nrHoogte.toFixed(1)} px ≥ 9)`);
    /* Tikken op een tafel opent het detailblad, volledig binnen beeld. */
    await p.locator('.tafel[data-nr="23"]').tap();
    await p.waitForTimeout(400);
    const d = await p.evaluate(() => { const e = document.getElementById('tafel-detail'); const b = e.getBoundingClientRect(); return { open: !e.hidden, binnen: b.left >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5, titel: document.getElementById('td-titel').textContent }; });
    meld(d.open && d.binnen && d.titel === 'Tafel 23', `${f.naam}: tik op tafel 23 opent detailblad binnen het scherm`);
    await p.locator('#td-sluit').tap();
  }
  if (f.beamer) {
    const b = await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);
    meld(b, `${f.naam}: alles past op één scherm`);
  }
  await p.screenshot({ path: `${MAP}/${f.naam}.png`, fullPage: !f.beamer });
  await p.close();
}
await browser.close();
console.log(fouten ? `\n${fouten} controle(s) mislukt. Screenshots in ${MAP}/` : `\nAlle schermcontroles geslaagd. Screenshots in ${MAP}/`);
process.exit(fouten ? 1 : 0);
