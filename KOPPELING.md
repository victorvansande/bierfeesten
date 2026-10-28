# Koppeling kassa → live bierteller

Dit document is voor wie het kassasysteem bouwde. Het beschrijft het enige wat de kassa moet doen: bestellingen doorsturen naar één HTTP-endpoint. De rest (opslag, totalen, live verspreiding naar beamer en gsm's) gebeurt aan de kant van de teller.

## Wat al vastligt

- **Een bier telt bij de bestelling**, niet bij het afrekenen. De kassa stuurt dus best elke bestelling door op het moment dat ze ingegeven wordt.
- **Alleen bier telt.** Frisdrank, wijn en andere dranken stuurt de kassa niet door (of de teller moet ze kunnen herkennen, zie vraag 2 hieronder).
- **Elke bestelling heeft een tafel** (1 t/m 71). Aan de toog wordt niet besteld; alles gaat via de garçons en de kassa.
- **De kassa heeft internet** in de zaal: rechtstreeks doorsturen naar de teller is de eenvoudigste weg. De brug in `bridge/` is enkel nodig als je liever een wachtrij naast de kassa draait.
- **Testmoment: vrijdag**, vóór de opening. Daarvoor bestaat een aparte testeditie (zie onderaan), zodat de echte telling leeg blijft.
- **Live:** https://bierfeesten.victorvansande.workers.dev. De token (`KASSA_TOKEN`) krijg je van Victor.

## Vragen aan jou

1. **Hoe stuurt de kassa het liefst door?** Per bestelling meteen (aanbevolen), in groepjes, of als totaalstand per tafel?
2. **Hoe herkent de kassa bier?** Stuurt ze enkel bier door, of stuurt ze alles en filteren we aan de kant van de teller op productcode? In het tweede geval hebben we een lijst nodig met de codes van de bieren.
3. **Kent de kassa het volume per product** (ml), of enkel een productcode? Dan zet ik de omzettabel aan de kant van de teller (`PRODUCTEN`).
4. **Wat is een stabiele unieke sleutel per bestellijn** in de kassa (bv. bonnummer + lijnnummer)? Die maakt opnieuw versturen veilig.
5. **Kan een bestelling achteraf geannuleerd of gewijzigd worden**, en zo ja, kan de kassa dat als storno doorsturen?
6. **Tapbier van een vat**: hoeveel ml is één glas (33 cl?), en stuurt de kassa dat volume per glas mee?
7. **Alcoholvrij bier** (11 op de voorlopige lijst): telt dat mee als bier? Dat beslist Victor; de kassa moet het wel kunnen onderscheiden.
8. **Kan de kassa de naam van het bier meesturen** (`product`)? Dan toont de pagina de populairste bieren. Is die naam geschikt om publiek te tonen, of zijn het interne codes?

## In het kort

```
POST https://<teller-domein>/api/kassa
Authorization: Bearer <KASSA_TOKEN>
Content-Type: application/json

{ "bestellingen": [
    { "id": "bon-4711-2", "tafel": 23, "ml": 330, "aantal": 2, "product": "Tripel", "tijd": "2026-10-03T21:14:07+02:00" }
] }
```

Antwoord:

```json
{ "aanvaard": 1, "dubbel": 0, "geweigerd": [], "totaal_ml": 1234560 }
```

Staat een tafelnummer niet op het plan (1 t/m 71), dan telt de bestelling wel mee in het totaal, maar komt er een extra veld `waarschuwingen` bij, zodat een tikfout in de kassa op het testmoment meteen opvalt.

## Velden per bestelling

| Veld | Verplicht | Betekenis |
|---|---|---|
| `id` | ja | Unieke sleutel per bestellijn, max. 120 tekens. Een id die de server al kent wordt genegeerd (`dubbel`), dus opnieuw versturen na een time-out is altijd veilig. Voorbeeld: `bonnummer-lijnnummer`. |
| `tafel` | nee | Tafelnummer 1 t/m 71 (getal of tekst, `"Tafel 23"` mag ook). Leeg, `null` of `0` = verkoop zonder tafel (toog); telt mee in het totaal, niet op het plan. |
| volume | ja, één van | `ml`, `cl` of `liter`: volume **per stuk** (bij tapbier: per glas). Of `product`: een code die in de lijst `PRODUCTEN` van de server staat (zie onder). |
| `aantal` | nee, standaard 1 | Aantal stuks. Het totale volume is volume per stuk × aantal. |
| `product` | nee | Naam van het bier zoals de kassa het kent, bv. `Tripel`. Verschijnt in "Laatste bestellingen" en telt voor "Populairste bieren" (liters en stuks per naam). Gebruik voor hetzelfde bier altijd exact dezelfde naam en zet het aantal in `aantal`, niet in de naam. Zonder namen blijft het blok "Populairste bieren" weg. |
| `tijd` | nee | ISO 8601 of Unix-tijd (seconden of milliseconden). Zonder tijd geldt het ontvangstmoment. Een tijd meer dan 5 minuten in de toekomst wordt vervangen door de servertijd. |

Engelse sleutels werken ook (`table`, `qty`, `events`), zodat er zo weinig mogelijk omgezet moet worden.

Volumes worden intern als gehele milliliters bewaard, zodat er nooit afrondingsfouten opstapelen. Grenzen tegen tikfouten: 1 tot 5.000 ml per stuk en hoogstens 200 stuks per lijn. Max. 500 lijnen per oproep.

## Drie manieren om te koppelen

Kies wat het best past bij hoe de kassa werkt. Ze zijn combineerbaar met storno's.

**1. Per bestelling (aanbevolen).** De kassa stuurt elke bestelling door zodra ze ingegeven is, één per oproep of in groepjes. Geeft de beste live-ervaring: de lijst "Laatste bestellingen" en het verloop per 5 minuten kloppen exact.

**2. Storno's.** Wordt een bestelling geannuleerd, stuur dan haar id terug:

```json
{ "storno": ["bon-4711-2"] }
```

**3. Absolute stand per tafel.** Voor een kassa die alleen totalen kent: stuur periodiek (bv. elke 10 s) de volledige stand in liter.

```json
{ "stand": { "tafels": { "1": 12.75, "2": 8.25 }, "zonder_tafel": 31.5 } }
```

De server zet het verschil met zijn eigen stand om in correctieregels. Zo blijft er één boekhouding en verdubbelt er nooit iets. Combineer deze vorm liefst niet met manier 1 binnen dezelfde editie.

## Fouten

| Status | Betekenis |
|---|---|
| 200 | Verwerkt. Kijk naar `geweigerd` voor regels met een fout (met index, id en reden). |
| 401 | Token ontbreekt of is fout. |
| 413 | Meer dan 500 regels in één oproep. |
| 422 | Alle regels geweigerd. |
| 5xx | Server tijdelijk weg: later opnieuw versturen, dubbels zijn veilig. |

## Productcodes (optioneel)

Kent de kassa wel productcodes maar geen volumes, dan staat de omzetting op de server, in `wrangler.toml`:

```toml
PRODUCTEN = '{"PILS25": 250, "PILS33": 330, "SPEC33": 330, "PINT50": 500, "KAN100": 1000}'
```

Een bestelling `{ "id": "...", "tafel": 5, "product": "PILS33", "aantal": 3 }` telt dan als 990 ml.

## Als het internet in de zaal wegvalt

`bridge/kassa-brug.mjs` is een kleine brug (Node, geen afhankelijkheden) die naast de kassa kan draaien. Hij schrijft elke bestelling eerst naar een lokaal wachtrijbestand en stuurt daarna door, met herhaalpogingen. Valt het netwerk weg, dan loopt de teller achter, maar gaat er niets verloren. Alleen de functie `leesNieuweBestellingen()` moet ingevuld worden (bv. een query op de kassadatabank met `WHERE id > laatsteId`).

Kan de kassa zelf HTTP-oproepen doen en heeft ze een eigen wachtrij, dan is de brug overbodig.

## Lezen (voor andere schermen of eigen tools)

| Endpoint | Wat |
|---|---|
| `GET /api/stand` | Volledige stand als JSON. Publiek, CORS open. Bevat ook `dagen` (liters per feestdag, 06:00 tot 06:00 Belgische tijd) en `vandaag`. |
| `GET /api/live` | WebSocket. Stuurt bij verbinden en na elke wijziging (hoogstens ~3 keer per seconde) de volledige stand: `{ "type": "stand", "stand": { ... } }`. Berichten van kijkers worden genegeerd. |
| `?editie=2025` | Op beide: een andere editie bekijken. Elke editie heeft een eigen, gescheiden telling. |

Er bestaat bewust geen endpoint om te wissen of te resetten. Een nieuw jaar = `EDITIE` aanpassen in `wrangler.toml`; de cijfers van vorige jaren blijven opvraagbaar.

## Testen zonder het echte feest te raken

**Op het testmoment (vrijdag)** stuurt de kassa naar de echte server, maar naar een aparte testeditie. Zo blijft de echte telling leeg:

```
POST https://bierfeesten.victorvansande.workers.dev/api/kassa?editie=test-vrijdag
bekijken: https://bierfeesten.victorvansande.workers.dev/?editie=test-vrijdag
```

Na de test gewoon het `?editie=`-deel weglaten; de testcijfers blijven apart staan.

Lokaal, zonder internet:

```bash
npm install
npm run dev                         # lokale server op http://127.0.0.1:8787 (token: zie .dev.vars)
node tools/test.mjs                 # 16 controles: token, idempotentie, storno, stand, feestdagen, onbekende tafels, WebSocket
node tools/simuleer.mjs             # verzonnen bestellingen naar editie "simulatie"
# bekijk: http://127.0.0.1:8787/?editie=simulatie
```
