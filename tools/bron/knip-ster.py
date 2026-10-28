import numpy as np, sys
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('L')).astype(np.uint8)
inkt = im < 110                                   # zwarte inkt
h, w = inkt.shape
# Zaad: het midden van de ster (rond x 995, y 480 in het logo van 2000x1000), zoek het dichtstbijzijnde inktpixel
sy, sx = int(h*0.48), int(w*0.4975)
ys, xs = np.nonzero(inkt[sy-40:sy+40, sx-40:sx+40]); sy, sx = sy-40+ys[0], sx-40+xs[0]
regio = np.zeros_like(inkt); regio[sy, sx] = True
while True:   # flood fill via herhaalde dilatie binnen het inktmasker
    d = regio.copy()
    d[1:] |= regio[:-1]; d[:-1] |= regio[1:]; d[:, 1:] |= regio[:, :-1]; d[:, :-1] |= regio[:, 1:]
    d &= inkt
    if d.sum() == regio.sum(): break
    regio = d
ys, xs = np.nonzero(regio)
print('ster bbox', xs.min(), ys.min(), xs.max(), ys.max(), 'pixels', regio.sum())
y0, y1, x0, x1 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
uit = (regio[y0:y1, x0:x1] * 255).astype(np.uint8)
Image.fromarray(uit, 'L').save(sys.argv[2])
