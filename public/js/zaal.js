/* Plattegrond van de zaal.
 *
 * Coördinaten komen rechtstreeks uit de vectorlagen van Tafelplan_BF.pdf en
 * Tafelplan_BF_tuinzaal.pdf (eenheid: pdf-punt van het plan van de grote zaal).
 * Het tuinzaalplan is op een grotere schaal getekend; het is herschaald met
 * factor 35,3 / 69,3 zodat één tafel in beide zalen even groot is.
 *
 * Een tafel: [x, y, breedte, hoogte]. Staande tafels (12-14, 46-47, 56-58)
 * zijn gewoon hoger dan breed.
 */
window.ZAAL = {
  zalen: [
    {
      id: 'grote-zaal',
      naam: 'Grote zaal',
      breedte: 596,
      hoogte: 836,
      tafels: {
        1: [505.3, 791.8, 56.5, 35.3], 2: [505.3, 756.5, 56.5, 35.3], 3: [532.8, 717.4, 56.5, 35.3],
        4: [476.2, 672.6, 56.5, 35.3], 5: [532.8, 672.6, 56.5, 35.3], 6: [476.7, 627.5, 56.5, 35.3],
        7: [533.3, 627.5, 56.5, 35.3], 8: [478.0, 534.9, 56.5, 35.3], 9: [534.6, 534.9, 56.5, 35.3],
        10: [478.6, 492.7, 56.5, 35.3], 11: [535.1, 492.7, 56.5, 35.3],
        12: [460.9, 426.4, 35.3, 56.5], 13: [496.3, 426.4, 35.3, 56.5], 14: [531.5, 426.4, 35.3, 56.5],
        15: [419.7, 378.6, 56.5, 35.3], 16: [476.2, 378.6, 56.5, 35.3], 17: [532.8, 378.6, 56.5, 35.3],
        18: [419.7, 332.0, 56.5, 35.3], 19: [476.2, 332.0, 56.5, 35.3], 20: [532.8, 332.0, 56.5, 35.3],
        21: [419.7, 284.8, 56.5, 35.3], 22: [476.2, 284.8, 56.5, 35.3], 23: [532.8, 284.8, 56.5, 35.3],
        24: [418.5, 237.5, 56.5, 35.3], 25: [475.0, 237.5, 56.5, 35.3], 26: [531.5, 237.5, 56.5, 35.3],
        27: [418.5, 190.2, 56.5, 35.3], 28: [475.0, 190.2, 56.5, 35.3], 29: [531.5, 190.2, 56.5, 35.3],
        30: [416.9, 141.6, 56.5, 35.3], 31: [473.4, 141.6, 56.5, 35.3], 32: [529.9, 141.6, 56.5, 35.3],
        33: [416.5, 92.8, 56.5, 35.3], 34: [473.0, 92.8, 56.5, 35.3], 35: [529.5, 92.8, 56.5, 35.3],
        36: [473.4, 41.5, 56.5, 35.3], 37: [473.4, 6.2, 56.5, 35.3],
        38: [252.9, 41.5, 56.5, 35.3], 39: [252.7, 6.2, 56.5, 35.3],
        40: [35.3, 41.5, 56.5, 35.3], 41: [35.2, 6.2, 56.5, 35.3],
        42: [59.3, 102.3, 56.5, 35.3], 43: [3.2, 102.3, 56.5, 35.3],
        44: [59.5, 151.8, 56.5, 35.3], 45: [3.4, 151.8, 56.5, 35.3],
        46: [49.0, 226.7, 35.3, 56.5], 47: [49.0, 283.3, 35.3, 56.5],
        48: [62.7, 349.9, 56.5, 35.3], 49: [6.2, 349.9, 56.5, 35.3],
        50: [62.7, 400.2, 56.5, 35.3], 51: [6.2, 400.2, 56.5, 35.3],
        52: [63.9, 450.4, 56.5, 35.3], 53: [7.4, 450.4, 56.5, 35.3]
      },
      elementen: [
        { soort: 'toog', label: 'Toog', pad: 'M3.8 570.2H66.6V772H218.5V810.9H3.8Z', labelPos: [35, 690], draai: -90 },
        { soort: 'kassa', label: 'Kassa', pad: 'M66.6 772H218.5V810.9H66.6Z', labelPos: [142, 792], labelBereik: [66.6, 218.5] },
        { soort: 'scherm', label: 'Projector', pad: 'M0 266H20V331H0Z', labelPos: [10, 298], draai: -90 },
        { soort: 'muur', pad: 'M117.6 557V747.5H240.9' },
        { soort: 'muur', pad: 'M0.4 503.5L80.5 515.1' },
        { soort: 'deur', pad: 'M0 206.4A38.4 38.4 0 0 1 38.4 244.8H0' },
        { soort: 'deur', pad: 'M0 521.6A38.4 38.4 0 0 1 38.4 560H0' },
        { soort: 'deur', pad: 'M594 580.9A38.4 38.4 0 0 0 555.6 619.3H594' },
        /* Deur in de rechtermuur tussen tafel 3 en tafel 2 (draait open in de vrije ruimte naast tafel 2),
         * naar de kinderhoek. Het label staat net buiten de muur, zoals de labels van de verbindingsdeuren. */
        { soort: 'deur', pad: 'M594 755A32 32 0 0 0 562 787H594', label: 'kinderhoek', labelPos: [604, 771], draai: 90 }
      ]
    },
    {
      id: 'tuinzaal',
      naam: 'Tuinzaal',
      breedte: 304,
      hoogte: 430,
      tafels: {
        54: [185.3, 299.8, 56.5, 35.3], 55: [241.8, 299.8, 56.5, 35.3],
        56: [195.8, 228.3, 35.3, 56.5], 57: [231.2, 228.3, 35.3, 56.5], 58: [266.5, 228.3, 35.3, 56.5],
        59: [186.5, 177.6, 56.8, 35.5], 60: [243.3, 177.6, 56.8, 35.5],
        61: [186.5, 125.5, 56.8, 35.5], 62: [243.3, 125.5, 56.8, 35.5],
        63: [172.2, 9.1, 56.8, 35.5], 64: [229.0, 9.1, 56.8, 35.5],
        65: [3.5, 7.6, 56.5, 35.3], 66: [3.5, 67.1, 56.5, 35.3], 67: [3.5, 102.4, 56.5, 35.3],
        68: [21.6, 156.8, 56.5, 35.3], 69: [21.6, 192.1, 56.5, 35.3],
        70: [3.5, 246.6, 56.5, 35.3], 71: [3.5, 281.8, 56.5, 35.3]
      },
      elementen: [
        { soort: 'podium', label: 'Podiummuur', pad: 'M0 330.6L169.3 333.5V371.6L0 369.8Z', labelPos: [84, 352] },
        { soort: 'muur', pad: 'M0 55.9H48.1' },
        { soort: 'muur', pad: 'M0 148.4H48.1' },
        { soort: 'muur', pad: 'M0 241.5H48.1' },
        { soort: 'deur', pad: 'M304 54A43 43 0 0 0 261 97H304' },
        { soort: 'deur', pad: 'M304 373A43 43 0 0 0 261 416H304' },
        { soort: 'deur', pad: 'M0 154.5A40 40 0 0 1 14 194.5' },
        { soort: 'deur', pad: 'M14 195A40 40 0 0 1 0 235' },
        { soort: 'deur', pad: 'M0 380.5A43 43 0 0 1 43 423.5' },
        { soort: 'deur', pad: 'M161 380.5A43 43 0 0 0 118 423.5' }
      ]
    }
  ]
};

/* Samen vormen beide zalen één grote zaal: de tuinzaal ligt links van de grote
 * zaal. De twee deuren rechts in de tuinzaal sluiten aan op de twee deuren links
 * in de grote zaal. Op die deuren is uitgelijnd: in het plan van de grote zaal
 * liggen hun middens op y 225,6 en 540,8, in de tuinzaal op 75,5 en 394,5.
 * Beide paren liggen ~317 eenheden uit elkaar, wat de schaalfactor bevestigt.
 * Verschuiving van de tuinzaal: (150,1 + 146,3) / 2 = 148. */
window.ZAAL.samen = {
  muur: 12,                                   // dikte van de tussenmuur
  plaats: { 'tuinzaal': [0, 148], 'grote-zaal': [316, 0] },
  doorgangen: [[202, 246], [520, 563]]        // openingen in de tussenmuur (y, gemeenschappelijk)
};

/* Opzoektabel tafelnummer -> zaal-id */
window.ZAAL.zaalVan = {};
for (const z of window.ZAAL.zalen) for (const nr in z.tafels) window.ZAAL.zaalVan[nr] = z.id;
