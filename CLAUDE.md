# Herentalse Bierfeesten: live bierteller

Project van Victor (KSA Herentals). Live liters bier per tafel en totaal, gevoed door het kassasysteem.

## Werkafspraken

- **Antwoord in het Nederlands**, kort en concreet. Geen em dashes en geen typische AI-taal, ook niet in UI-teksten, docs of commits.
- **Publiek:** de bouwer van het kassasysteem organiseert de Bierfeesten al decennia en kent Claude door en door. Alles moet technisch doordacht, getest en verantwoord zijn. Geen loze claims, beslissingen uitleggen met hun afweging.
- **Gsm eerst: 95% van de bezoekers kijkt op gsm.** Na elke wijziging `npm run check` draaien (360, 375 en 430 px, tablet, laptop, beamer) en de gsm-screenshots zelf bekijken: niet alleen "geen fouten", ook mooi, logisch en goed gestructureerd. Nieuwe onderdelen krijgen een plaats in de gsm-volgorde (`order` in app.css).
- **Na elke wijziging `npm test`** (backend). GitHub Actions blokkeert de deploy als een van beide faalt.
- **Alleen lezen voor kijkers** is een harde eis: schrijven kan enkel via `/api/kassa` met token.
- **Nooit verzonnen cijfers op de beamer.** Demo alleen via `?demo` of `bron: 'demo'`; de live bron valt nooit stil terug op demo.
- **Stijl is "Stempel"** (geel affichepapier, zwarte inkt, ruwe randen zoals het logo). Andere stijlen zijn bewust geschrapt.
- Nooit secrets of tokens zelf invullen. Ze staan als GitHub secrets.

## Online

- Live: https://bierfeesten.victorvansande.workers.dev (Beamer: `?beamer`).
- Push naar `main` = testen + online zetten via GitHub Actions (`.github/workflows/deploy.yml`). Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` en `KASSA_TOKEN` staan in GitHub.
- Cloudsessies kunnen het live domein meestal niet bereiken (niet bij Allowed domains): deploy dan opvolgen via de GitHub Actions-run en het deploylog.

## Feiten

- Open twee dagen van 12u tot ±1u à 2u (~27 uur), samen ±1.200 L. Gemiddeld ±45 L/u, avondpieken ±80 à 90 L/u. Demo volgt die verhoudingen.
- Vorig jaar: zeker 1.000 L (`vorig_jaar_l`). Tussendoelen per 250 L.
- Tuinzaal ligt links van de grote zaal; de twee deuren rechts in de tuinzaal sluiten aan op de twee deuren links in de grote zaal (uitlijning in `zaal.js`).

## Open punten

- Hoe het kassasysteem koppelt (push per bestelling, absolute stand of brug): nog navragen bij de bouwer. Contract staat in KOPPELING.md.
- Productlijst met volumes, als de kassa geen ml meestuurt.
