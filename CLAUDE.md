# Herentalse Bierfeesten: live bierteller

Project van Victor (KSA Herentals). Live liters bier per tafel en totaal, gevoed door het kassasysteem.

## Werkafspraken

- **Antwoord in het Nederlands**, kort en concreet. Geen em dashes en geen typische AI-taal, ook niet in UI-teksten, docs of commits.
- **Publiek:** de bouwer van het kassasysteem organiseert de Bierfeesten al decennia en kent Claude door en door. Alles moet technisch doordacht, getest en verantwoord zijn. Geen loze claims, beslissingen uitleggen met hun afweging.
- **Gsm eerst: 95% van de bezoekers kijkt op gsm.** Na elke wijziging `npm run check` draaien (360, 375 en 430 px, tablet, laptop, beamer) en de gsm-screenshots zelf bekijken: niet alleen "geen fouten", ook mooi, logisch en goed gestructureerd. Nieuwe onderdelen krijgen een plaats in de gsm-volgorde (`order` in app.css).
- **Uitlijning en rust:** `npm run check` bewaakt ook dat de dagen recht boven de kerncijfers staan, dat live getallen even brede cijfers hebben (`vast()` in app.js, want Anton is niet tabulair), dat niets buiten zijn blok loopt, en dat er na het laadscherm niets verspringt (layout-shift < 0,001). Nieuwe live getallen in Anton: altijd via `vast()`. Nieuwe meldingen die verschijnen: over de pagina leggen (fixed), niet de inhoud laten verschuiven.
- **Lettertypes** staan in `public/fonts/` (geen Google Fonts op de site): het laadscherm wacht erop, zodat er niets verspringt. De schermcontrole test ook onder traag netwerk.
- **Na elke wijziging `npm test`** (backend). GitHub Actions blokkeert de deploy als een van beide faalt.
- **Alleen lezen voor kijkers** is een harde eis: schrijven kan enkel via `/api/kassa` met token.
- **Nooit verzonnen cijfers op de beamer.** Demo alleen via `?demo`, `bron: 'demo'` of de aparte demo-editie op de server, altijd met de band "Voorbeeld"; de live bron valt nooit stil terug op demo, en de echte editie krijgt nooit verzonnen bestellingen.
- **Stijl is "Stempel"** (geel affichepapier, zwarte inkt, ruwe randen zoals het logo). Andere stijlen zijn bewust geschrapt.
- Nooit secrets of tokens zelf invullen. Ze staan als GitHub secrets.

## Iconen

- Bron: de ster uit het logo (`tools/bron/ster-masker.png`). Opnieuw maken: `python3 tools/maak-iconen.py` (Pillow + numpy).
- iOS: glazen zwarte ster op geel (apple-touch-icon, vierkant en ondoorzichtig: iOS rondt zelf af en vult transparantie met zwart). Echte iOS 26 Liquid Glass-lagen bestaan enkel voor native apps; voor een website zit het effect in de afbeelding.
- Android: maskable (Material, inhoud binnen de veilige zone) + monochrome. Naam: "Herentalse Bierfeesten", kort "Bierfeesten".

## Offline en voorvertoningen

- `public/sw.js` bewaart de pagina op het toestel; `/api/` gaat nooit via de cache. Bij een wijziging aan de bestandslijst of aan sw.js: `VERSIE` ophogen.
- Voorvertoningen (gedeelde link, iOS-laadscherm) tonen het algemene logo, op Victors vraag. Bij een eigen domein: de og-adressen in `index.html` aanpassen.

## Online

- Live: https://bierfeesten.victorvansande.workers.dev (Beamer: `?beamer`).
- Push naar `main` = testen + online zetten via GitHub Actions (`.github/workflows/deploy.yml`). Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` en `KASSA_TOKEN` staan in GitHub.
- Cloudsessies kunnen het live domein meestal niet bereiken (niet bij Allowed domains): deploy dan opvolgen via de GitHub Actions-run en het deploylog.

## Feiten

- Open twee dagen van 12u tot ±1u à 2u (~27 uur), samen ±1.200 L. Gemiddeld ±45 L/u, avondpieken ±80 à 90 L/u. Demo volgt die verhoudingen.
- Vorig jaar: zeker 1.000 L (`vorig_jaar_l`), precies getal volgt. Tussendoelen per 250 L.
- Een bier telt bij de bestelling. Alleen bier telt. Elke bestelling heeft een tafel (geen toogverkoop). De kassa zit op een **gesloten netwerk zonder internet** (bevestigd door de kassabouwer): voorstel is de brug (`bridge/kassa-brug.mjs`) met twee netwerken, enkel lezen uit de kassa en enkel uitgaand naar de teller via eigen 4G. QR-bestellen aan tafel is door de kassabouwer geopperd: apart project, nog niets beslist. Testmoment met de kassa: vrijdag vóór de opening.
- Populairste bieren: top 3 op liters per `product`-naam uit de kassa (aantal apart in `aantal`). Demo gebruikt biersoorten zonder merknamen. Wijzigt het formaat van de demobestellingen: `DEMO_VERSIE` in `worker/demo.js` ophogen, dan herstart het live voorbeeld meteen.
- Uitverkochte bieren: de kassa registreert ze en geeft ze door (hoe precies: nog onbekend). Pagina toont nummer + naam, op gsm meteen onder de teller. Kan tegen zondag lang worden: blok blijft hoogstens 3 rijen, rolt dan in een lus, "Toon alle" opent de volledige lijst; `npm run check` test dit met 40 bieren (gsm en beamer). Server bewaart de lijst in het Durable Object (`uitverkocht`, vorm A volledige lijst of B losse wijzigingen).
- Tafels wisselen vaak van groep (zoals een café): ranglijst is oké, geen namen bij tafels, geen "mijn tafel"-functie (bewust geschrapt).
- Wellicht geen beamer; de site is vooral voor gsm's. Geen geluid. Donkere zaal, gele achtergrond is oké.
- Teller over het weekend én per feestdag (06:00 tot 06:00 Belgische tijd).
- Tuinzaal ligt links van de grote zaal; de twee deuren rechts in de tuinzaal sluiten aan op de twee deuren links in de grote zaal (uitlijning in `zaal.js`).

## Open punten (Victor herinneren)

- **Voorbeeld staat op de hoofdpagina en telt snel** op Victors vraag, om de werking te tonen (`editie: 'demo'` in `public/js/config.js`, `DEMO_SNEL = "1"` in `wrangler.toml`: gemiddeld elke 4 s een bestelling, elk uur opnieuw). Stilleggen kan met `DEMO_STIL = "1"` (vaste stand, tijdstippen verschoven naar nu). Code in `worker/demo.js` en `worker/index.js`. Vóór het testmoment met de kassa en zeker vóór het feest: `editie` uit config.js halen, zodat de hoofdpagina de echte telling toont.

- Precies aantal liter van vorig jaar.
- Frisdrank en wijn: nu alleen bier; later eventueel filteren of apart tonen. Victor wil hier later op terugkomen.
- Eigen domein (nu workers.dev).
- Bierlijst: voorlopige lijst 2026 ontvangen (111 bieren: vooral flesjes 33 cl, ook 75, 37,5, 25 en 35,5 cl; 12 vaten van 15 à 20 L die per glas getapt worden, glas vermoedelijk 33 cl). Ter illustratie, niets definitiefs mee doen. Niet in de repository zetten.
- Alcoholvrij bier (11 op de lijst): meetellen of niet? Victor vragen.
- Glasvolume van tapbier bevestigen (33 cl?).
- Antwoorden van de bouwer van de kassa op de vragen in KOPPELING.md.
- Na het feest: eindstand en archief per editie (later).
