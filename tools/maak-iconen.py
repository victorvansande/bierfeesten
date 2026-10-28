"""Maakt alle icoontjes van de site uit de ster van het logo.

Gebruik:  python3 tools/maak-iconen.py
Bron:     tools/bron/ster-masker.png  (de ster, uitgeknipt uit het logo met tools/bron/knip-ster.py)
Uitvoer:  public/img/icoon/*

  - favicon.svg                vector, scherp op elk scherm (moderne browsers)
  - favicon-32.png, -16.png    en favicon.ico (16, 32, 48) voor oudere browsers
  - apple-touch-icon.png       180 px, iOS: "liquid glass"-stijl. iOS rondt de hoeken zelf af
                               en vult transparantie met zwart, dus dit icoon is vierkant en ondoorzichtig.
  - icoon-192.png, -512.png    Android en andere "any"-contexten: dezelfde glasstijl, met eigen afgeronde hoeken
  - maskable-192.png, -512.png Android adaptive icon (Material): vlak, inhoud binnen de veilige zone (80%-cirkel),
                               zodat elke vorm die het toestel kiest (cirkel, druppel, squircle) goed blijft
  - monochroom-512.png         Android 13+ themakleuren: enkel de vorm, transparant
  - ../delen.png               1200x630, voorbeeld bij een gedeelde link (WhatsApp, Messenger, ...): het logo
  - ../laadscherm/*.png        iOS-laadschermen per iPhone-formaat: het logo op geel
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BRON = ROOT / 'tools' / 'bron' / 'ster-masker.png'
LOGO = ROOT / 'tools' / 'bron' / 'logo-masker-groot.png'   # het volledige logo op volle resolutie, als masker
UIT = ROOT / 'public' / 'img' / 'icoon'
UIT.mkdir(parents=True, exist_ok=True)

GEEL = (253, 223, 89)
GEEL_LICHT = (255, 233, 128)
GEEL_DIEP = (240, 196, 52)
INKT = (21, 17, 16)
M = 1024  # werkgrootte


def ster_masker(grootte):
    """Ster als vloeiend masker (L) van grootte x grootte, gecentreerd, met behoud van verhouding."""
    s = Image.open(BRON).convert('L')
    w, h = s.size
    f = grootte / max(w, h)
    # 4x groter rekenen, wat vervagen en opnieuw drempelen: gladde randen zonder de handgesneden vorm te verliezen
    groot = s.resize((round(w * f * 4), round(h * f * 4)), Image.BICUBIC).filter(ImageFilter.GaussianBlur(3))
    groot = groot.point(lambda v: 255 if v > 127 else 0)
    klein = groot.resize((round(w * f), round(h * f)), Image.LANCZOS)
    uit = Image.new('L', (grootte, grootte), 0)
    uit.paste(klein, ((grootte - klein.width) // 2, (grootte - klein.height) // 2))
    return uit


def plaats(masker, canvas, schaal, dy=0.0):
    """Masker van de ster op schaal (deel van canvas) centreren, met optionele verticale verschuiving (deel van canvas)."""
    g = round(canvas * schaal)
    m = masker.resize((g, g), Image.LANCZOS)
    uit = Image.new('L', (canvas, canvas), 0)
    uit.paste(m, ((canvas - g) // 2, (canvas - g) // 2 + round(dy * canvas)))
    return uit


def verloop(grootte, boven, onder):
    a = np.linspace(0, 1, grootte)[:, None, None]
    kleur = np.array(boven) * (1 - a) + np.array(onder) * a
    return Image.fromarray(np.repeat(kleur, grootte, axis=1).astype(np.uint8), 'RGB')


def glas_icoon():
    """iOS 26-achtig: ster van donker glas met lichtrand, binnenglans en zachte schaduw, op geel affichepapier."""
    bg = verloop(M, GEEL_LICHT, GEEL_DIEP).convert('RGBA')
    # Zachte lichtval van linksboven over de achtergrond
    yy, xx = np.mgrid[0:M, 0:M] / M
    glans = np.clip(1 - np.hypot(xx - 0.25, yy - 0.15) / 0.9, 0, 1) ** 2 * 70
    bg = Image.alpha_composite(bg, Image.fromarray(np.dstack([np.full((M, M), 255)] * 3 + [glans]).astype(np.uint8), 'RGBA'))

    ster = plaats(ster_masker(M), M, 0.70, dy=0.01)
    s = np.asarray(ster).astype(float) / 255

    # Schaduw: de ster wat lager, vervaagd, in warm donker
    schaduw = plaats(ster_masker(M), M, 0.68, dy=0.06).filter(ImageFilter.GaussianBlur(38))
    sch = np.asarray(schaduw).astype(float) / 255 * 0.32
    bg = Image.alpha_composite(bg, Image.fromarray(np.dstack([np.full((M, M), v) for v in (150, 95, 0)] + [sch * 255]).astype(np.uint8), 'RGBA'))

    # Glaslichaam: donker en warm, van boven iets lichter; een fractie doorschijnend, zodat het geel er licht door schemert
    lichaam = np.dstack([np.linspace(c1, c2, M)[:, None].repeat(M, 1) for c1, c2 in ((40, 22), (33, 17), (28, 12))])
    alfa = s   # rand volledig dekkend: een half doorschijnende rand mengt met het geel tot een grijze lijn

    # Randnormaal uit het vervaagde masker: zo weet elk randpunt naar welke kant het wijst
    zacht = np.asarray(ster.filter(ImageFilter.GaussianBlur(6))).astype(float) / 255
    gy, gx = np.gradient(zacht)
    lengte = np.hypot(gx, gy) + 1e-6
    nx, ny = -gx / lengte, -gy / lengte                     # naar buiten gericht
    krimp = np.asarray(ster.filter(ImageFilter.MinFilter(7))).astype(float) / 255
    rand = np.clip(s - krimp, 0, 1)
    rand = np.asarray(Image.fromarray((rand * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(float) / 255
    # Licht van linksboven: helder waar de rand naar linksboven wijst, niets aan de andere kanten
    licht = np.clip(nx * -0.6 + ny * -0.8, 0, 1) ** 2 * 0.9
    # Aan de overkant (rechtsonder) breekt het geel van de achtergrond door het glas: warme, zwakkere rand
    breking = np.clip(nx * 0.6 + ny * 0.8, 0, 1) ** 3 * 0.22   # klein: anders leest het als een omtrek
    # Glans: de bovenste helft weerspiegelt licht (zachte overgang), plus een heldere vlek linksboven
    binnen = (np.clip((0.50 - yy) / 0.22, 0, 1) ** 1.4 * 0.09
              + np.clip(1 - np.hypot((xx - 0.40) * 1.3, (yy - 0.30) * 2.2) / 0.30, 0, 1) ** 2 * 0.20)
    # Onderaan schemert het geel door het glas
    door = np.clip((yy - 0.55) / 0.35, 0, 1) * 0.10

    rgb = lichaam * (1 - door[..., None]) + np.array(GEEL_DIEP) * door[..., None]
    rgb = rgb * (1 - binnen[..., None]) + 255 * binnen[..., None]
    wit = (rand * licht)[..., None]
    goud = (rand * breking)[..., None]
    rgb = rgb * (1 - wit) + 255 * wit
    rgb = rgb * (1 - goud) + np.array(GEEL_LICHT) * goud
    glas = Image.fromarray(np.dstack([rgb, alfa * 255]).astype(np.uint8), 'RGBA')
    bg = Image.alpha_composite(bg, glas)

    # Fijne heldere lijn langs de bovenrand van het hele icoon, zoals bij glas
    rand_icoon = Image.new('L', (M, M), 0)
    ImageDraw.Draw(rand_icoon).rounded_rectangle((6, 6, M - 7, M - 7), radius=228, outline=255, width=5)
    boven = np.clip(1 - yy * 2.2, 0, 1)
    ri = np.asarray(rand_icoon).astype(float) / 255 * boven * 0.55
    bg = Image.alpha_composite(bg, Image.fromarray(np.dstack([np.full((M, M), 255)] * 3 + [ri * 255]).astype(np.uint8), 'RGBA'))
    return bg.convert('RGB')


def afgerond(img, straal_deel=0.2237):
    """Afgeronde hoeken (transparant) voor contexten die het icoon zelf niet maskeren."""
    w = img.width
    m = Image.new('L', (w * 4, w * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 4 - 1, w * 4 - 1), radius=round(w * 4 * straal_deel), fill=255)
    uit = img.convert('RGBA')
    uit.putalpha(m.resize((w, w), Image.LANCZOS))
    return uit


def material_icoon(grootte):
    """Android adaptive icon: vlak geel, zwarte ster binnen de veilige zone, lichte Material-schaduw."""
    bg = Image.new('RGBA', (grootte, grootte), GEEL + (255,))
    schaal = 0.50   # ster past ruim binnen de veilige cirkel van 80% (diameter 0,8)
    schaduw = plaats(ster_masker(grootte), grootte, schaal, dy=0.012).filter(ImageFilter.GaussianBlur(grootte / 110))
    bg.paste(Image.new('RGBA', bg.size, (120, 80, 0, 255)), (0, 0), schaduw.point(lambda v: v * 0.30))
    bg.paste(Image.new('RGBA', bg.size, INKT + (255,)), (0, 0), plaats(ster_masker(grootte), grootte, schaal))
    return bg.convert('RGB')


def monochroom(grootte):
    uit = Image.new('RGBA', (grootte, grootte), (255, 255, 255, 0))
    uit.putalpha(plaats(ster_masker(grootte), grootte, 0.50))
    return Image.composite(Image.new('RGBA', uit.size, (255, 255, 255, 255)), uit, uit.split()[3])


def favicon_png(grootte):
    """Klein: gele afgeronde tegel met een grote, scherpe ster. Geen glaseffecten: die vallen weg op 16 px."""
    f = 8
    g = grootte * f
    tegel = Image.new('L', (g, g), 0)
    ImageDraw.Draw(tegel).rounded_rectangle((0, 0, g - 1, g - 1), radius=round(g * 0.22), fill=255)
    img = Image.new('RGBA', (g, g), (0, 0, 0, 0))
    img.paste(Image.new('RGBA', (g, g), GEEL + (255,)), (0, 0), tegel)
    img.paste(Image.new('RGBA', (g, g), INKT + (255,)), (0, 0), plaats(ster_masker(g), g, 0.80, dy=0.01))
    return img.resize((grootte, grootte), Image.LANCZOS)


def ster_pad(viewbox=100, schaal=0.80, dy=1.0):
    """De omtrek van de ster als SVG-pad (randvolging op het masker, daarna vereenvoudigd)."""
    g = 400
    m = np.asarray(ster_masker(g)) > 127
    # Moore-randvolging van de buitenrand
    ys, xs = np.nonzero(m)
    start = (ys.min(), xs[ys == ys.min()].min())
    buren = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    pad, p, richting = [start], start, 6
    for _ in range(20000):
        for k in range(8):
            d = (richting + k) % 8
            q = (p[0] + buren[d][0], p[1] + buren[d][1])
            if 0 <= q[0] < g and 0 <= q[1] < g and m[q]:
                p, richting = q, (d + 5) % 8
                break
        if p == start:
            break
        pad.append(p)

    def rdp(punten, eps):
        if len(punten) < 3:
            return punten
        a, b = np.array(punten[0], float), np.array(punten[-1], float)
        ab = b - a
        n = np.hypot(*ab) or 1
        afst = [abs(ab[0] * (a[1] - q[1]) - ab[1] * (a[0] - q[0])) / n for q in punten]
        i = int(np.argmax(afst))
        if afst[i] > eps:
            return rdp(punten[:i + 1], eps)[:-1] + rdp(punten[i:], eps)
        return [punten[0], punten[-1]]

    punten = rdp(pad, 0.8)
    f = viewbox / g * schaal
    o = viewbox * (1 - schaal) / 2
    return 'M' + 'L'.join(f'{o + x * f:.1f} {o + dy + y * f:.1f}' for y, x in punten) + 'Z'


def logo_op_geel(breedte, hoogte, logo_breedte_deel, dy=0.0):
    """Het algemene logo in inkt, gecentreerd op geel."""
    img = Image.new('RGB', (breedte, hoogte), GEEL)
    logo = Image.open(LOGO).convert('RGBA')
    lb = round(breedte * logo_breedte_deel)
    lh = round(logo.height * lb / logo.width)
    alfa = logo.split()[3].resize((lb, lh), Image.LANCZOS)
    img.paste(Image.new('RGB', (lb, lh), INKT), ((breedte - lb) // 2, (hoogte - lh) // 2 + round(dy * hoogte)), alfa)
    return img


# iPhone-formaten (CSS-pixels breed x hoog, pixeldichtheid), staand. Zonder passend beeld toont iOS een wit scherm.
IPHONES = [
    (440, 956, 3),  # 16 Pro Max, 17 Pro Max
    (402, 874, 3),  # 16 Pro, 17 Pro, 17
    (420, 912, 3),  # Air
    (430, 932, 3),  # 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    (393, 852, 3),  # 14 Pro, 15, 15 Pro, 16, 16e
    (428, 926, 3),  # 12 Pro Max, 13 Pro Max, 14 Plus
    (390, 844, 3),  # 12, 13, 14, 12 Pro, 13 Pro
    (375, 812, 3),  # X, XS, 11 Pro, 12 mini, 13 mini
    (414, 896, 3),  # XS Max, 11 Pro Max
    (414, 896, 2),  # XR, 11
    (375, 667, 2),  # SE (2e en 3e generatie), 8
]


# ---- Uitvoer ----
glas = glas_icoon()
glas.resize((180, 180), Image.LANCZOS).save(UIT / 'apple-touch-icon.png', optimize=True)
for g in (192, 512):
    afgerond(glas.resize((g, g), Image.LANCZOS)).save(UIT / f'icoon-{g}.png', optimize=True)
    material_icoon(g).save(UIT / f'maskable-{g}.png', optimize=True)
monochroom(512).save(UIT / 'monochroom-512.png', optimize=True)
for g in (16, 32):
    favicon_png(g).save(UIT / f'favicon-{g}.png', optimize=True)
favicon_png(48).save(UIT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
(UIT / 'favicon.svg').write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
    '<rect width="100" height="100" rx="22" fill="#FDDF59"/>'
    f'<path fill="#151110" d="{ster_pad()}"/></svg>\n')
glas.save(ROOT / 'tools' / 'bron' / 'icoon-1024.png', optimize=True)

logo_op_geel(1200, 630, 0.74).save(ROOT / 'public' / 'img' / 'delen.png', optimize=True)

laad = ROOT / 'public' / 'img' / 'laadscherm'
laad.mkdir(exist_ok=True)
for b, h, d in IPHONES:
    logo_op_geel(b * d, h * d, 0.78, dy=-0.04).save(laad / f'{b}x{h}@{d}x.png', optimize=True)
# De bijhorende HTML-regels, om in index.html te plakken als de lijst verandert
(ROOT / 'tools' / 'bron' / 'laadscherm-links.html').write_text(''.join(
    f'<link rel="apple-touch-startup-image" href="img/laadscherm/{b}x{h}@{d}x.png" '
    f'media="(device-width: {b}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {d}) and (orientation: portrait)">\n'
    for b, h, d in IPHONES))   # meester, voor als er ooit een native app komt
print('Iconen gemaakt in', UIT)
