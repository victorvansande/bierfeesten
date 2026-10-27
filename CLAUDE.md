# Herentalse Bierfeesten: live bierteller

Project van Victor (KSA Herentals). Live liters bier per tafel en totaal, gevoed door het kassasysteem.

## Belangrijk om te onthouden

- **Publiek:** de bouwer van het kassasysteem organiseert de Bierfeesten al decennia en kent Claude door en door. Een mooie site alleen maakt geen indruk: alles moet technisch doordacht, getest en verantwoord zijn. Geen loze claims, geen halve oplossingen, beslissingen uitleggen met hun afweging.
- **Antwoord in het Nederlands**, kort en concreet. Geen em dashes en geen typische AI-taal, ook niet in UI-teksten, docs of commits.
- **Alleen lezen voor kijkers** is een harde eis: schrijven kan enkel via `/api/kassa` met token.
- **Nooit verzonnen cijfers op de beamer.** Demo alleen via `?demo` of `bron: 'demo'`; de live bron valt nooit stil terug op demo.
- Elke wijziging nakijken op 375 px (gsm) en 1920×1080 (beamer).

## Open punten

- Hoe het kassasysteem koppelt (push per bestelling, absolute stand of brug): navragen bij de bouwer. Contract staat in KOPPELING.md.
- Hoe Grote zaal en Tuinzaal aan elkaar hangen (welke kant, welke deur). Nu twee aparte plannen.
- Stijl: Victor koos Stempel en Scorebord (de andere vier voorstellen zijn geschrapt). Nog beslissen welke standaard op de beamer komt.
- Liters van vorig jaar voor `vorig_jaar_l` in config.js.
- Productlijst met volumes, als de kassa geen ml meestuurt.
