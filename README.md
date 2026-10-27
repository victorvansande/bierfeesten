# Herentalse Bierfeesten: live bierteller

Live weergave van het aantal liter bier per tafel en in totaal, voor de beamer in de zaal en voor iedereen op gsm of computer. Alleen lezen: niemand kan via de site iets aanpassen. De cijfers komen uit het kassasysteem.

## Hoe het werkt

```
kassa ──POST /api/kassa (token)──▶ Cloudflare Worker ──▶ Durable Object "Telling" (SQLite)
                                                              │
                     beamer, gsm's, laptops ◀──WebSocket /api/live── (volledige stand bij elke wijziging)
```

- **Eén bron van waarheid.** Elke bestelling wordt bewaard (idempotent op `id`), totalen staan in gehele milliliters.
- **Live naar iedereen.** Kijkers krijgen via WebSocket de volledige stand (~5 KB), gebundeld tot hoogstens ~3 keer per seconde. Een volledige stand in plaats van losse wijzigingen betekent: een gemiste update herstelt zichzelf bij de volgende. Lukt WebSocket niet (strenge netwerken), dan valt de pagina terug op elke 5 s `/api/stand`.
- **Hibernatable WebSockets.** Het Durable Object slaapt tussen bestellingen; honderden open gsm's kosten zo bijna niets.
- **Per editie gescheiden.** `EDITIE` in `wrangler.toml`. Geen reset-knop, dus ook geen per ongeluk gewiste avond.
- **Koppeling met de kassa:** zie [KOPPELING.md](KOPPELING.md).

## Bestanden

| Pad | Inhoud |
|---|---|
| `public/index.html` | De pagina (beamer en gsm in één, responsief) |
| `public/css/app.css` | Basislayout + twee stijlen: Stempel en Scorebord (`body[data-thema=...]`) |
| `public/js/zaal.js` | Plattegrond: tafelposities uit de vectorlagen van de tafelplan-pdf's |
| `public/js/bron.js` | Gegevensbron: live (WebSocket met terugval) of demo |
| `public/js/app.js` | Teller, plan, ranglijst, verloop, mijlpalen, tafeldetail |
| `public/js/config.js` | Instellingen (stijl, mijlpaal, vorig jaar, ...) |
| `worker/index.js` | Worker + Durable Object |
| `bridge/kassa-brug.mjs` | Optionele brug naast de kassa met offline wachtrij |
| `tools/test.mjs`, `tools/simuleer.mjs` | Integratietest en simulator |

## Gebruik

- Beamer: `https://<domein>/?beamer` (cursor verdwijnt, scherm blijft wakker, `f` = volledig scherm).
- Gsm: gewoon `https://<domein>/`. Tik op een tafel voor details, "Dit is mijn tafel" onthoudt je tafel op dat toestel.
- Stijl kiezen: `?thema=stempel` of `?thema=scorebord`, of vast in `config.js`.
- Demo met verzonnen cijfers: `?demo` (nooit op de beamer tijdens het feest).

## Lokaal draaien

```bash
npm install
npm run dev                    # http://127.0.0.1:8787
node tools/test.mjs            # alle controles moeten "ok" geven
node tools/simuleer.mjs        # daarna: http://127.0.0.1:8787/?editie=simulatie
```

## Online zetten (Cloudflare)

```bash
npx wrangler login
npx wrangler secret put KASSA_TOKEN     # lange willekeurige reeks, bv. `openssl rand -hex 32`
npm run deploy
```

Durable Objects met SQLite werken op het gratis Workers-plan. Een eigen domein (bv. `live.bierfeesten.be`) kan via Cloudflare gekoppeld worden.
