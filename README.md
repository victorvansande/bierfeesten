# Herentalse Bierfeesten: live bierteller

Live weergave van het aantal liter bier per tafel en in totaal, voor de beamer in de zaal en voor iedereen op gsm of computer. Alleen lezen: niemand kan via de site iets aanpassen. De cijfers komen uit het kassasysteem.

Live (na de eerste deploy): `https://bierfeesten.victorvansande.workers.dev`

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

## De pagina

- **Gsm eerst** (95% van de bezoekers): teller met liters per dag, tussendoel, QR-knop, dorstigste tafels, plan, laatste bestellingen, verloop. Tik op een tafel voor details.
- **Per dag en over het weekend**: de grote teller telt het weekend, eronder staat elke feestdag apart. Een feestdag loopt van 06:00 tot 06:00, zodat de nacht tot 2u bij de juiste dag hoort.
- **QR-code delen**: wie de site open heeft, toont een QR-code die iemand anders scant. De code wordt in de browser gemaakt (qrcode-generator, MIT, in `public/js/vendor/`).
- **Plattegrond**: tafelposities uit de vectorlagen van de tafelplan-pdf's. Op groot scherm één plan, tuinzaal links en grote zaal rechts, uitgelijnd op de twee verbindingsdeuren. Op gsm onder elkaar, met de deuren aangeduid. De lege middenzone van de grote zaal wordt smaller getekend, met een breuklijn (`plan_inkorten` in `config.js`).
- **Tussendoelen**: elke 250 L een feestmoment, het record van vorig jaar (1.000 L) als apart doel.
- **Beamer**: `https://<domein>/?beamer` (cursor verdwijnt, scherm blijft wakker, `f` = volledig scherm). Alles past op één scherm.
- **Op het beginscherm**: installeerbaar als app ("Herentalse Bierfeesten", op het beginscherm "Bierfeesten" omdat iOS lange namen afkapt). iOS krijgt een glazen ster in de stijl van iOS 26, Android een maskable Material-icoon (cirkel, druppel of squircle naargelang het toestel) en een monochrome versie voor themakleuren.
- **Bij slecht wifi**: de pagina en de laatst gekende stand blijven op het toestel bewaard. Zonder netwerk opent de site meteen, met bovenaan een rode band "Geen verbinding" en het uur van de getoonde stand. De telling zelf gaat nooit via de cache.
- **Gedeelde link** toont het logo met de naam en een korte zin (Open Graph). Het adres staat vast in `index.html`: bij een eigen domein daar aanpassen.
- **Demo** met verzonnen, realistische cijfers: `?demo`. Nooit op de beamer tijdens het feest.
- **Live voorbeeld op de server** (tijdelijk aan op de hoofdpagina): de editie `demo` verzint zelf bestellingen via een alarm van het Durable Object, zodat iedereen dezelfde cijfers live ziet oplopen. Om de 4 uur begint het opnieuw; zonder kijkers stopt het na een halfuur. Uitzetten: `editie` weghalen uit `public/js/config.js`. Code: `worker/demo.js`.

## Bestanden

| Pad | Inhoud |
|---|---|
| `public/index.html` | De pagina (gsm, tablet en beamer in één) |
| `public/css/app.css` | Stijl "Stempel", layout per schermgrootte |
| `public/js/zaal.js` | Plattegrond en hoe de zalen aan elkaar hangen |
| `public/js/bron.js` | Gegevensbron: live (WebSocket met terugval) of demo |
| `public/js/app.js` | Teller, plan, ranglijst, verloop, tussendoelen, tafeldetail |
| `public/js/config.js` | Instellingen (tussendoel, vorig jaar, ...) |
| `worker/index.js` | Worker + Durable Object |
| `bridge/kassa-brug.mjs` | Optionele brug naast de kassa met offline wachtrij |
| `tools/test.mjs` | Integratietest van de backend |
| `tools/schermcheck.mjs` | Schermcontrole op 360, 375, 430 px, tablet, laptop en beamer |
| `tools/simuleer.mjs` | Verzonnen kassabestellingen naar een testeditie |
| `tools/maak-iconen.py` | Maakt favicon en app-iconen uit de ster van het logo (`tools/bron/`) naar `public/img/icoon/` |
| `public/fonts/` | Anton en Courier Prime (SIL Open Font License), zelf meegeleverd: sneller, offline bruikbaar, geen gegevens naar Google |
| `public/sw.js` | Service worker: de site opent ook zonder netwerk (bij een wijziging van de bestandslijst: `VERSIE` ophogen) |
| `public/img/delen.png`, `public/img/laadscherm/` | Voorbeeld bij een gedeelde link en iOS-laadschermen, met het logo (`tools/maak-iconen.py`) |
| `public/manifest.webmanifest` | Naam en iconen voor "Zet op beginscherm" (Android en iOS) |

## Lokaal draaien

```bash
npm install
npm run dev                                   # http://127.0.0.1:8787
npm test                                      # backend: alles moet "ok" geven
npm run check                                 # schermen: alles moet "ok" geven (screenshots in schermcheck/)
node tools/simuleer.mjs                       # daarna: http://127.0.0.1:8787/?editie=simulatie
```

## Online zetten

Elke push naar `main` draait in GitHub Actions eerst de backendtest en de schermcontrole, en zet de site pas online als alles slaagt.

Eenmalig in GitHub, onder Settings → Secrets and variables → Actions:

| Secret | Waarde |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Dezelfde als bij de GekkooPedia-repository (Workers bewerken) |
| `CLOUDFLARE_ACCOUNT_ID` | Idem |
| `KASSA_TOKEN` | Lange willekeurige reeks, bv. `openssl rand -hex 32`. Geef die enkel aan de bouwer van de kassa. |

Durable Objects met SQLite werken op het gratis Workers-plan. Een eigen domein (bv. `live.bierfeesten.be`) kan later via Cloudflare.
