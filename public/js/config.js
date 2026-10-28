/* Instellingen van de live pagina.
 *   ?demo     verzonnen cijfers (nooit op de beamer tijdens het feest)
 *   ?beamer   beamerweergave: verbergt de cursor, houdt het scherm wakker
 *   ?editie=  een vorige editie of een testtelling bekijken
 */
window.BF_CONFIG = {
  /* TIJDELIJK: de site toont het live voorbeeld (verzonnen bestellingen, op de server).
   * Vóór het testmoment met de kassa en zeker vóór het feest: deze regel weghalen of op '' zetten. */
  editie: 'demo',
  bron: 'live',          // 'live' = Worker-API, 'demo' = simulatie in de browser
  api: '',               // leeg = zelfde domein; anders bv. 'https://bierfeesten.example.workers.dev'
  tussendoel_l: 250,     // elke 250 L een feestmoment op de beamer
  vorig_jaar_l: 1000,    // record van vorig jaar ("zeker 1.000 L"): apart doel met eigen feestmoment
  plan_inkorten: true,   // lege middenzone van de grote zaal smaller tekenen (met breuklijn)
  deel_url: ''           // adres in de QR-code; leeg = het adres van deze pagina
};
