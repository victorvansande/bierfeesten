# Herentalse Bierfeesten: live bierteller

Project van Victor (KSA Herentals). Live liters bier per tafel en totaal, gevoed door het kassasysteem.

## Werkafspraken

- **Antwoord in het Nederlands**, kort en concreet. Geen em dashes en geen typische AI-taal, ook niet in UI-teksten, docs of commits.
- **Publiek:** de bouwer van het kassasysteem organiseert de Bierfeesten al decennia en kent Claude door en door. Alles moet technisch doordacht, getest en verantwoord zijn. Geen loze claims, beslissingen uitleggen met hun afweging.
- **Gsm eerst: 95% van de bezoekers kijkt op gsm.** Na elke wijziging `npm run check` draaien (360, 375 en 430 px, tablet, laptop, beamer) en de gsm-screenshots zelf bekijken: niet alleen "geen fouten", ook mooi, logisch en goed gestructureerd. Nieuwe onderdelen krijgen een plaats in de gsm-volgorde (`order` in app.css).
- **Na elke wijziging `npm test`** (backend). GitHub Actions blokkeert de deploy als een van beide faalt.
- **Alleen lezen voor kijkers** is een harde eis: schrijven kan enkel via `/api/kassa` met token.
- **Nooit verzonnen cijfers op de beamer.** Demo alleen via `?demo`, `bron: 'demo'` of de aparte demo-editie op de server, altijd met de band "Voorbeeld"; de live bron valt nooit stil terug op demo, en de echte editie krijgt nooit verzonnen bestellingen.
- **Stijl is "Stempel"** (geel affichepapier, zwarte inkt, ruwe randen zoals het logo). Andere stijlen zijn bewust geschrapt.
- Nooit secrets of tokens zelf invullen. Ze staan als GitHub secrets.

## Online

- Live: https://bierfeesten.victorvansande.workers.dev (Beamer: `?beamer`).
- Push naar `main` = testen + online zetten via GitHub Actions (`.github/workflows/deploy.yml`). Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` en `KASSA_TOKEN` staan in GitHub.
- Cloudsessies kunnen het live domein meestal niet bereiken (niet bij Allowed domains): deploy dan opvolgen via de GitHub Actions-run en het deploylog.

## Feiten

- Open twee dagen van 12u tot ±1u à 2u (~27 uur), samen ±1.200 L. Gemiddeld ±45 L/u, avondpieken ±80 à 90 L/u. Demo volgt die verhoudingen.
- Vorig jaar: zeker 1.000 L (`vorig_jaar_l`), precies getal volgt. Tussendoelen per 250 L.
- Een bier telt bij de bestelling. Alleen bier telt. Elke bestelling heeft een tafel (geen toogverkoop). De kassa heeft internet. Testmoment met de kassa: vrijdag vóór de opening.
- Tafels wisselen vaak van groep (zoals een café): ranglijst is oké, geen namen bij tafels, geen "mijn tafel"-functie (bewust geschrapt).
- Wellicht geen beamer; de site is vooral voor gsm's. Geen geluid. Donkere zaal, gele achtergrond is oké.
- Teller over het weekend én per feestdag (06:00 tot 06:00 Belgische tijd).
- Tuinzaal ligt links van de grote zaal; de twee deuren rechts in de tuinzaal sluiten aan op de twee deuren links in de grote zaal (uitlijning in `zaal.js`).

## Open punten (Victor herinneren)

- **Live voorbeeld staat aan** op de hoofdpagina (`editie: 'demo'` in `public/js/config.js`, demo-editie `DEMO_EDITIE` in `wrangler.toml`, code in `worker/demo.js`). Vóór het testmoment met de kassa en zeker vóór het feest: `editie` uit config.js halen, zodat de hoofdpagina de echte telling toont.

- Precies aantal liter van vorig jaar.
- Frisdrank en wijn: nu alleen bier; later eventueel filteren of apart tonen. Victor wil hier later op terugkomen.
- Eigen domein (nu workers.dev).
- Bierlijst: voorlopige lijst 2026 ontvangen (111 bieren: vooral flesjes 33 cl, ook 75, 37,5, 25 en 35,5 cl; 12 vaten van 15 à 20 L die per glas getapt worden, glas vermoedelijk 33 cl). Ter illustratie, niets definitiefs mee doen. Niet in de repository zetten.
- Alcoholvrij bier (11 op de lijst): meetellen of niet? Victor vragen.
- Glasvolume van tapbier bevestigen (33 cl?).
- Antwoorden van de bouwer van de kassa op de vragen in KOPPELING.md.
- Na het feest: eindstand en archief per editie (later).
