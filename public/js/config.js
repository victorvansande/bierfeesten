/* Instellingen van de live pagina. Alles hier kan ook via de URL:
 *   ?demo            verzonnen cijfers (nooit op de beamer tijdens het feest)
 *   ?thema=scorebord stijl kiezen (stempel of scorebord)
 *   ?kiezer          stijlkiezer tonen
 *   ?beamer          beamerweergave forceren (verbergt cursor, houdt scherm wakker)
 */
window.BF_CONFIG = {
  bron: 'live',          // 'live' = Worker-API, 'demo' = simulatie in de browser
  api: '',               // leeg = zelfde domein; anders bv. 'https://bierfeesten.example.workers.dev'
  thema: 'stempel',      // 'stempel' of 'scorebord'
  kiezer: false,
  mijlpaal_l: 500,       // feestmoment op de beamer bij elke 500 L
  bak_l: 6,              // één bak = 24 × 25 cl
  vorig_jaar_l: null     // bv. 4210: dan toont de balk de vergelijking met vorig jaar
};
