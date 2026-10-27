# Koppeling kassa → live bierteller

Dit document is voor wie het kassasysteem bouwde. Het beschrijft het enige wat de kassa moet doen: bestellingen doorsturen naar één HTTP-endpoint. De rest (opslag, totalen, live verspreiding naar beamer en gsm's) gebeurt aan de kant van de teller.

## In het kort

```
POST https://<teller-domein>/api/kassa
Authorization: Bearer <KASSA_TOKEN>
Content-Type: application/json

{ "bestellingen": [
    { "id": "bon-4711-2", "tafel": 23, "ml": 330, "aantal": 2, "product": "Flesje 33 cl", "tijd": "2026-10-03T21:14:07+02:00" }
] }
```

Antwoord:

```json
{ "aanvaard": 1, "dubbel": 0, "geweigerd": [], "totaal_ml": 1234560 }
```

## Velden per bestelling

| Veld | Verplicht | Betekenis |
|---|---|---|
| `id` | ja | Unieke sleutel per bestellijn, max. 120 tekens. Een id die de server al kent wordt genegeerd (`dubbel`), dus opnieuw versturen na een time-out is altijd veilig. Voorbeeld: `bonnummer-lijnnummer`. |
| `tafel` | nee | Tafelnummer 1 t/m 71 (getal of tekst, `"Tafel 23"` mag ook). Leeg, `null` of `0` = verkoop zonder tafel (toog); telt mee in het totaal, niet op het plan. |
| volume | ja, één van | `ml`, `cl` of `liter`: volume **per stuk**. Of `product`: een code die in de lijst `PRODUCTEN` van de server staat (zie onder). |
| `aantal` | nee, standaard 1 | Aantal stuks. Het totale volume is volume per stuk × aantal. |
| `product` | nee | Naam voor de lijst "Net getapt" op het scherm, bv. `Flesje 33 cl`. |
| `tijd` | nee | ISO 8601 of Unix-tijd (seconden of milliseconden). Zonder tijd geldt het ontvangstmoment. Een tijd meer dan 5 minuten in de toekomst wordt vervangen door de servertijd. |

Engelse sleutels werken ook (`table`, `qty`, `events`), zodat er zo weinig mogelijk omgezet moet worden.

Volumes worden intern als gehele milliliters bewaard, zodat er nooit afrondingsfouten opstapelen. Grenzen tegen tikfouten: 1 tot 5.000 ml per stuk en hoogstens 200 stuks per lijn. Max. 500 lijnen per oproep.

## Drie manieren om te koppelen

Kies wat het best past bij hoe de kassa werkt. Ze zijn combineerbaar met storno's.

**1. Per bestelling (aanbevolen).** De kassa stuurt elke afgerekende bestelling door, één per oproep of in groepjes. Geeft de beste live-ervaring: de lijst "Net getapt" en het verloop per 5 minuten kloppen exact.

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
| `GET /api/stand` | Volledige stand als JSON. Publiek, CORS open. |
| `GET /api/live` | WebSocket. Stuurt bij verbinden en na elke wijziging (hoogstens ~3 keer per seconde) de volledige stand: `{ "type": "stand", "stand": { ... } }`. Berichten van kijkers worden genegeerd. |
| `?editie=2025` | Op beide: een andere editie bekijken. Elke editie heeft een eigen, gescheiden telling. |

Er bestaat bewust geen endpoint om te wissen of te resetten. Een nieuw jaar = `EDITIE` aanpassen in `wrangler.toml`; de cijfers van vorige jaren blijven opvraagbaar.

## Testen zonder het echte feest te raken

```bash
npm install
npm run dev                         # lokale server op http://127.0.0.1:8787 (token: zie .dev.vars)
node tools/test.mjs                 # 13 controles: token, idempotentie, storno, stand, WebSocket, ...
node tools/simuleer.mjs             # verzonnen bestellingen naar editie "simulatie"
# bekijk: http://127.0.0.1:8787/?editie=simulatie
```
