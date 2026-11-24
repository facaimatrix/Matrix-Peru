#!/usr/bin/env python3
"""Draw genus-shaped tree sprites for the Stand View.

    python tools/generate_genus_sprites.py      (needs: pip install pillow)

Reads tools/genus_data.json (from build_genus_data.py) and writes
src/assets/trees/genus/*.png plus src/assets/trees/genus.json.

Heights come from the inventory medians in genus_data.json. Crown shapes, crown
widths, colours, palm leaf sizes and stilt-root sizes are ILLUSTRATIVE, drawn
from general knowledge of each genus, not from photographs or measurements.
"""
import json
import math
import random
from pathlib import Path

import generate_tree_sprites as G
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "trees" / "genus"
SS, PPM = G.SS, 16
K = SS * PPM
# (dark, light) bark and (dark, mid, light) foliage
GREY, PALE = ((74, 66, 58), (178, 166, 150)), ((120, 112, 100), (222, 216, 202))
BROWN, RED = ((66, 48, 36), (158, 124, 92)), ((82, 34, 22), (206, 120, 78))
DARKB, GREENB = ((48, 40, 34), (132, 112, 92)), ((84, 92, 58), (186, 186, 138))
DEEP = ((12, 40, 22), (40, 94, 42), (120, 166, 78))
MID = ((22, 52, 20), (66, 122, 46), (160, 196, 96))
BLUE = ((14, 46, 34), (38, 100, 64), (118, 172, 112))
OLIVE = ((40, 56, 24), (94, 122, 50), (184, 196, 104))
SILVER = ((40, 58, 46), (98, 124, 98), (190, 204, 176))
GUM = ((44, 66, 56), (106, 134, 112), (190, 206, 182))
PALM = ((16, 50, 22), (52, 112, 44), (148, 194, 92))
DRY = ((62, 68, 28), (128, 136, 60), (204, 204, 118))
DRYG = ((42, 62, 30), (92, 122, 56), (172, 190, 108))
SHAFT = ((60, 84, 60), (150, 176, 130))


def canvas(H, cw):
    pad = 1.6 * K
    W, Ht = int(cw * K * 1.35 + 2 * pad), int(H * K + 2 * pad)
    im = Image.new('RGBA', (W, Ht), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im, 'RGBA'), W / 2, Ht - pad


def finish(im, bx, by):
    """Downsample and trim; returns the sprite and its stem-base anchor."""
    s = im.resize((im.width // SS, im.height // SS), Image.LANCZOS)
    box = s.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return s.crop(box), round(bx / SS - box[0], 2), round(by / SS - box[1], 2)


def buttress(d, bx, by, tw, bh, spread, bark):
    for side, shade in ((-1, .72), (1, .24), (-.35, .58), (.45, .38)):
        edge = G.bezier((bx + side * tw * .4, by - bh), (bx + side * tw * .62, by - bh * .18), (bx + side * (tw / 2 + spread), by + (2 * SS if abs(side) < 1 else 0)), 14)
        d.polygon(edge + [(bx, by)], fill=G.mix(*bark, shade) + (255,))


def broadleaf(name, dbh, H, cw, depth, profile, pal, bark, k=46, rr=.11, squash=.62, dens=5, leaf=1.55,
              tiers=0, butt=0, bow=.01, forkf=.75, limbs=16, shear=0, stems=1, moss=None, limbw=.42, swell=0):
    rng = random.Random(name)
    im, d, bx, by = canvas(H, cw)
    h, w, ch = H * K, cw * K, H * depth * K
    top = by - h
    tw = max(dbh / 100 * K, 2.6 * SS)
    fy = top + ch * forkf
    pts = []
    for i in range(k):
        for _ in range(60):
            y = rng.random() if not tiers else (rng.randrange(tiers) + .3) / tiers + rng.uniform(-.30, .30) / tiers
            x, z = rng.uniform(-1, 1), rng.uniform(-1, 1)
            lim = profile(y)
            if x * x + .55 * z * z <= lim * lim:
                pts.append((bx + x * w / 2 * .88 + shear * w * (1 - y), top + ch * (.06 + .86 * y), z, x, y)); break
    r = w * rr

    def paint(sel):
        for px, py, z, x, y in sorted(sel, key=lambda p: (p[2], -p[4])):
            base = .36 + .13 * z - .13 * x + .28 * (.5 - y) + rng.uniform(-.05, .05)
            G.clump(d, px, py, r * rng.uniform(.7, 1.3), squash * rng.uniform(.85, 1.15), pal, rng, base, dens, leaf * SS)
    trunks = []
    for s in range(stems):
        off = (s - (stems - 1) / 2) * tw * 1.1
        tx = bx + off * 4.5 + rng.uniform(-.02, .02) * h
        trunks.append(G.bezier((bx + off * .9, by), (bx + off + bow * h * rng.choice([-1, 1]) * rng.uniform(.6, 1.2), (by + fy) / 2), (tx, fy), 26))
    paint([p for p in pts if p[2] < -.1])
    for px, py, z, x, y in (pts if tiers else rng.sample(pts, min(limbs, len(pts)))):
        tr = min(trunks, key=lambda q: abs(q[-1][0] - px))
        if tiers:                                  # horizontal whorls off a straight leader
            sx, sy = tr[-1][0] + (bx - tr[-1][0]) * 0, py + abs(px - bx) * .10
            mid = ((sx + px) / 2, sy - 2)
        else:
            t = rng.uniform(0, .6)
            sx, sy = G.lerp(tr[-1][0], tr[-9][0], t), G.lerp(tr[-1][1], tr[-9][1], t)
            mid = (G.lerp(sx, px, .6), G.lerp(sy, py, .3))
        G.limb(d, G.bezier((sx, sy), mid, (px, py), 12), max(tw * limbw * (.55 if tiers else 1), 1.5 * SS), .9 * SS, bark, rng, moss)
    if butt:
        buttress(d, bx, by, tw, butt * K, tw * .95, bark)
    for tr in trunks:
        f = 1 if stems == 1 else .72
        if swell:                                  # bottle-shaped bole
            for i in range(len(tr) - 1):
                a, b = (1 + (swell - 1) * math.exp(-((j / len(tr) - .25) / .28) ** 2) for j in (i, i + 1))
                G.limb(d, [tr[i], tr[i + 1]], tw * a * (1.02 - .4 * i / len(tr)), tw * b * (1.02 - .4 * (i + 1) / len(tr)), bark, rng, moss)
        else:
            G.limb(d, tr, tw * 1.08 * f, tw * .62 * f, bark, rng, moss)
        tip = top + ch * (.04 if tiers else .22)
        G.limb(d, G.bezier(tr[-1], (tr[-1][0], (fy + tip) / 2), (tr[-1][0] + rng.uniform(-.03, .03) * w, tip), 12), tw * .6 * f, SS, bark, rng, moss)
    paint([p for p in pts if p[2] >= -.1])
    return finish(im, bx, by)


def palm(name, dbh, H, n, length, rise, droop, pinna, trunk=GREY, pal=PALM, stilt=0, belly=0, fan=False, spread=1.0, skirt=0, spines=False, shaft=None, plume=1.0, clump=1):
    rng = random.Random(name)
    im, d, bx0, by = canvas(H + length * 1.1, length * 2.2)
    stems = [(bx0, H)] if clump == 1 else [(bx0 + (i - (clump - 1) / 2) * .9 * K, H * rng.uniform(.72, 1)) for i in range(clump)]
    for bx, hh in stems:
        tw = max(dbh / 100 * K, 2.6 * SS)
        ax, ay = bx + rng.uniform(-.02, .02) * hh * K, by - hh * K
        base = by - stilt * K
        if stilt:                                  # cone of stilt roots
            m = int(9 + stilt * 5)
            for i in sorted(range(m), key=lambda i: math.sin(2 * math.pi * i / m)):
                a = 2 * math.pi * i / m
                foot = (bx + math.cos(a) * stilt * K * .42, by + math.sin(a) * stilt * K * .08)
                sy = base + rng.uniform(-.1, .25) * stilt * K
                G.limb(d, G.bezier((bx, sy), (bx + math.cos(a) * stilt * K * .22, (sy + foot[1]) / 2 - 3), foot, 8), 2.4 * SS, 1.7 * SS, BROWN, rng)
        pts = G.bezier((bx, base), (bx + (ax - bx) * .2, (base + ay) / 2), (ax, ay), 40)

        def leaf(az, el, L, back):
            ca, sa = math.cos(az), math.sin(az)
            px, py, ang, seg, N = ax, ay, el, L * K / 26, 26
            rach = [(px, py)]
            for i in range(N):
                ang -= droop * (i / N) ** 1.1 / N * 3.0
                px += math.cos(ang) * seg * ca * spread
                py -= math.sin(ang) * seg - sa * math.cos(ang) * seg * .16
                rach.append((px, py))
            tone = (.30 if back else .52) + .12 * sa - .12 * ca
            if fan:                                # costapalmate blade on a petiole
                cut = int(N * .55)
                cx, cy = rach[cut]
                ux, uy = rach[cut][0] - rach[cut - 4][0], rach[cut][1] - rach[cut - 4][1]
                a0 = math.atan2(uy, ux)
                d.line(rach[:cut + 1], fill=G.ramp(pal, tone + .15) + (255,), width=int(1.3 * SS))
                for j in range(-15, 16):
                    b = a0 + j * .135
                    R = L * K * .44 * (1 - .18 * abs(j) / 15) * rng.uniform(.93, 1.05)
                    q = (cx + math.cos(b) * R * (abs(ca) * .55 + .45), cy + math.sin(b) * R * .82 + R * .10)
                    d.line([(cx, cy), q], fill=G.ramp(pal, tone + rng.uniform(-.1, .14)) + (255,), width=int(1.7 * SS))
                return
            for i in range(3, N + 1):
                (x0, y0), (x1, y1) = rach[i - 1], rach[i]
                t = i / N
                ln = math.hypot(x1 - x0, y1 - y0) or 1
                tx, ty = (x1 - x0) / ln, (y1 - y0) / ln
                pl = pinna * K * math.sin(math.pi * min(1, .12 + t * .86)) ** .6
                for side in (-1, 1):
                    for jit in (0, .5):
                        bxp, byp = x0 + (x1 - x0) * jit, y0 + (y1 - y0) * jit
                        ox = tx * .55 + side * -ty * (.55 if not back else .5)
                        oy = ty * .55 + side * tx * .55 * plume + .42 * droop
                        q = (bxp + ox * pl * rng.uniform(.85, 1.1), byp + oy * pl * rng.uniform(.85, 1.1))
                        c = G.ramp(pal, tone - .10 * (oy > 0) + rng.uniform(-.10, .13))
                        if name.startswith(('Iriartea', 'Socratea')):   # broad ruffled wedges
                            wx, wy = -(q[1] - byp) * .28, (q[0] - bxp) * .28
                            d.polygon([(bxp, byp), (q[0] + wx, q[1] + wy), (q[0] - wx, q[1] - wy)], fill=c + (255,))
                        else:
                            d.line([(bxp, byp), q], fill=c + (255,), width=int(1.15 * SS))
            d.line(rach, fill=G.ramp(pal, tone + .2) + (255,), width=int(1.4 * SS))
        L = [(2 * math.pi * (i * .381966) % (2 * math.pi), i) for i in range(n)]
        specs = []
        for a, i in L:
            lay = i / max(1, n - 1)
            specs.append((a, rise[0] + (rise[1] - rise[0]) * lay + rng.uniform(-.06, .06), length * rng.uniform(.88, 1.06)))
        for j in range(skirt):                     # hanging dead leaves
            a = rng.uniform(0, 2 * math.pi)
            q = (ax + math.cos(a) * length * K * .28, ay + length * K * rng.uniform(.35, .6))
            d.line(G.bezier((ax, ay), (ax + math.cos(a) * length * K * .3, ay + 4), q, 8), fill=(134, 108, 70, 255), width=int(2 * SS))
        for a, e, l in sorted([s for s in specs if math.sin(s[0]) < 0], key=lambda s: -s[1]):
            leaf(a, e, l, True)
        # trunk, as bands so a belly can swell
        for i in range(40):
            t0, t1 = i / 40, (i + 1) / 40
            f = lambda t: 1 + belly * math.exp(-((t - .52) / .17) ** 2)
            G.limb(d, [pts[i], pts[i + 1]], tw * f(t0) * (1.05 - .1 * t0), tw * f(t1) * (1.05 - .1 * t1), trunk, rng)
            if i % 2 == 0:
                x, y = pts[i]; ww = tw * f(t0) / 2
                if spines:
                    for s in range(7):
                        xx = x + rng.uniform(-ww * 1.0, ww)
                        d.line([(xx, y), (xx + rng.uniform(-6, 6) + (xx - x) * .7, y + rng.uniform(2, 9))], fill=(34, 28, 24, 230), width=SS // 2)
                else:
                    d.line([(x - ww, y), (x + ww, y + 1)], fill=G.mix(*trunk, .08) + (120,), width=max(1, SS // 2))
        if shaft:
            G.limb(d, [(ax, ay + 1.1 * K), (ax, ay + .5 * K), (ax, ay)], tw * 1.15, tw * .7, shaft, rng)
        for a, e, l in sorted([s for s in specs if math.sin(s[0]) >= 0], key=lambda s: -s[1]):
            leaf(a, e, l, False)
    return finish(im, bx0, by)


def cecropia(name, dbh, H, cw, nb, R, pal, bark, petiole=.8, lobes=9):
    rng = random.Random(name)
    im, d, bx, by = canvas(H, cw)
    h, w = H * K, cw * K
    tw = max(dbh / 100 * K, 2.6 * SS)
    fy = by - h * .56
    for i in range(7):                             # short prop roots
        a = math.pi * (i + .5) / 7
        G.limb(d, G.bezier((bx, by - .7 * K), (bx + math.cos(a) * .3 * K, by - .4 * K), (bx + math.cos(a) * .55 * K, by + math.sin(a) * 2), 6), 1.8 * SS, 1.2 * SS, bark, rng)
    ends = []
    for i in range(nb):
        a = 2 * math.pi * i * .381966
        lev = i / max(1, nb - 1)
        sy = G.lerp(fy, by - h * .80, lev)
        q = w / 2 * (1 - .72 * lev) * rng.uniform(.75, 1)
        e = (bx + math.cos(a) * q, sy - h * G.lerp(.20, .14, lev) * rng.uniform(.85, 1.1) + math.sin(a) * .1 * K)
        ends.append((math.sin(a), (bx, sy), e))
    ends.append((.1, (bx, by - h * .8), (bx, by - h * .965)))

    def rosette(cx, cy, z):
        items = []
        for j in range(11):
            a = 2 * math.pi * j / 11 + rng.uniform(-.2, .2)
            items.append((math.sin(a), a, rng.uniform(.75, 1.1)))
        for sn, a, s in sorted(items):
            ex, ey = cx + math.cos(a) * petiole * K * s, cy - (.30 - .32 * sn) * petiole * K * s
            tone = .42 + .12 * z + .14 * sn - .10 * math.cos(a)
            d.line([(cx, cy), (ex, ey)], fill=G.ramp(pal, tone - .1) + (255,), width=max(1, int(.8 * SS)))
            for q in range(lobes):                 # peltate, deeply lobed leaf seen obliquely
                b = 2 * math.pi * q / lobes + a
                lx, ly = ex + math.cos(b) * R * K * s, ey + math.sin(b) * R * K * s * .42 + abs(math.cos(b)) * R * K * .22
                nx, ny = -math.sin(b) * R * K * .16, math.cos(b) * R * K * .10
                m = (G.lerp(ex, lx, .62), G.lerp(ey, ly, .62))
                d.polygon([(ex, ey), (m[0] + nx, m[1] + ny), (lx, ly), (m[0] - nx, m[1] - ny)], fill=G.ramp(pal, tone + .14 * -math.sin(b) + rng.uniform(-.06, .08)) + (255,))
    ends.sort()
    for z, s, e in [q for q in ends if q[0] < 0]:
        G.limb(d, G.bezier(s, (G.lerp(s[0], e[0], .8), G.lerp(s[1], e[1], .22)), e, 14), tw * .42, tw * .22, bark, rng); rosette(*e, z)
    G.limb(d, G.bezier((bx, by), (bx + .006 * h, by - h * .4), (bx, by - h * .95), 40), tw, tw * .34, bark, rng)
    for i in range(int(H * 2.6)):                  # ring scars
        y = by - h * .93 * i / (H * 2.6); ww = G.lerp(tw, tw * .4, i / (H * 2.6)) / 2
        d.line([(bx - ww, y), (bx + ww, y)], fill=G.mix(*bark, .12) + (110,), width=1)
    for z, s, e in [q for q in ends if q[0] >= 0]:
        G.limb(d, G.bezier(s, (G.lerp(s[0], e[0], .8), G.lerp(s[1], e[1], .22)), e, 14), tw * .42, tw * .22, bark, rng); rosette(*e, z)
    return finish(im, bx, by)


dome = lambda y: math.sqrt(max(0, 1 - ((y - .58) / .6) ** 2))
oval = lambda y: .86 * math.sqrt(max(0, 1 - ((y - .52) / .54) ** 2))
umb = lambda y: (min(1, .55 + y * 2.4) if y < .36 else max(.0, 1 - (y - .36) * 1.45))
flat = lambda y: (min(1, .72 + y * 1.6) if y < .5 else max(0, 1 - (y - .5) * 1.9))
spire = lambda y: .12 + .80 * y if y < .88 else .66
cone = lambda y: .16 + .84 * y ** .8 if y < .9 else .7
column = lambda y: .62 * math.sin(math.pi * min(1, .10 + y * .86)) ** .6
vase = lambda y: max(.12, 1 - y * .85)


def B(zone, cf, depth, profile, pal, bark, **kw):
    """Broadleaf: zone sets heights and base crown width; cf scales the crown."""
    return dict(kind="B", zone=zone, cf=cf, depth=depth, profile=profile, pal=pal, bark=bark, kw=kw)


def P(zone, n, length, rise, droop, pinna, **kw):
    return dict(kind="P", zone=zone, n=n, length=length, rise=rise, droop=droop, pinna=pinna, kw=kw)


SHAPES = {
    "Eschweilera": B("SA_11", 1.02, .46, dome, DEEP, GREY, k=62, rr=.10, butt=.9),
    "Protium": B("SA_11", 1.05, .52, oval, MID, BROWN, k=52, rr=.115),
    "Pseudolmedia": B("SA_11", .92, .58, column, DEEP, GREY, k=56, rr=.125, squash=.55),
    "Inga": B("SA_11", 1.7, .48, umb, MID, GREY, k=60, rr=.085, squash=.48, forkf=1.12, limbs=30, bow=.035, limbw=.5),
    "Virola": B("SA_11", 1.12, .52, cone, BLUE, BROWN, k=84, rr=.105, squash=.5, tiers=6, butt=.7, forkf=.95),
    "Sloanea": B("SA_11", 1.25, .40, umb, BLUE, GREY, k=88, rr=.066, butt=3.4, forkf=.95, limbs=28),
    "Ficus": B("SA_11", 1.45, .56, dome, DEEP, PALE, k=92, rr=.075, butt=2.6, forkf=.9, limbs=30),
    "Cecropia": dict(kind="C", zone="SA_11", cf=1.6, nb=12, R=.64, pal=OLIVE, bark=PALE, kw={}),
    "Pourouma": dict(kind="C", zone="SA_11", cf=1.3, nb=22, R=.56, pal=MID, bark=GREY, kw=dict(petiole=.66, lobes=5)),
    "Miconia": B("SA_11", 1.2, .6, oval, MID, BROWN, k=32, rr=.14, stems=2, bow=.03),
    "Iriartea": P("SA_11", 6, 4.0, (.1, 1.15), 1.0, .85, trunk=PALE, stilt=1.3, belly=1.1, shaft=SHAFT),
    "Socratea": P("SA_11", 7, 2.6, (.1, 1.2), 1.1, .78, trunk=PALE, stilt=2.2, shaft=SHAFT),
    "Euterpe": P("SA_11", 13, 3.4, (-.2, 1.1), 1.2, .60, trunk=PALE, shaft=((40, 90, 50), (130, 180, 96)), stilt=.35),
    "Oenocarpus": P("SA_11", 12, 5.4, (.35, 1.45), .75, 1.0, trunk=GREY),
    "Mauritia": P("SA_11", 18, 3.6, (-.6, 1.25), .5, 1, trunk=GREY, fan=True, skirt=7),
    "Attalea": P("SA_11", 15, 6.4, (.55, 1.48), .62, 1.0, trunk=BROWN),
    "Astrocaryum": P("SA_11", 12, 4.0, (.5, 1.4), .7, .7, trunk=BROWN, spines=True),
    "Weinmannia": B("SA_16", 1.1, .62, dome, BLUE, DARKB, k=50, rr=.11, squash=.6, bow=.04, moss=DEEP),
    "Escallonia": B("SA_16", 1.1, .66, dome, GUM, BROWN, k=40, rr=.12, squash=.5, tiers=3, bow=.05),
    "Alnus": B("SA_16", .9, .66, oval, MID, PALE, k=56, rr=.115, bow=.015),
    "Myrcianthes": B("SA_16", 1.25, .56, flat, DEEP, RED, k=46, rr=.095, squash=.55, stems=2, bow=.05, limbs=24),
    "Polylepis": B("SA_16", 1.25, .62, flat, SILVER, RED, k=34, rr=.10, squash=.5, stems=3, bow=.10, forkf=.62, limbs=24, leaf=1.1, limbw=.5),
    "Eucalyptus": B("SA_16", .86, .52, column, GUM, PALE, k=78, rr=.135, squash=.66, dens=4, bow=.012, forkf=.42, limbs=9, leaf=1.25, limbw=.34),
    "Pinus": B("SA_16", .95, .72, spire, BLUE, BROWN, k=92, rr=.10, squash=.42, tiers=9, dens=4.2, leaf=1.1, bow=.004, forkf=.95),
    "Bursera": B("SA_13", 1.15, .60, flat, DRY, GREY, k=26, rr=.10, squash=.5, dens=2.2, bow=.08, forkf=.95, limbs=26, limbw=.5),
    "Eriotheca": B("SA_13", 1.2, .50, umb, DRYG, GREY, k=32, rr=.085, squash=.5, dens=2.6, bow=.03, forkf=1.0, limbs=26, limbw=.55, swell=1.5),
    "Prosopis": B("SA_13", 1.55, .70, flat, DRYG, DARKB, k=50, rr=.085, squash=.55, dens=2.6, bow=.12, forkf=.8, limbs=30, limbw=.5, stems=2, leaf=1.2),
    "Cordia": B("SA_13", 1.25, .78, dome, DRYG, BROWN, k=34, rr=.12, squash=.6, dens=3, stems=4, bow=.05, forkf=.8, limbs=24),
    "Colicodendron": B("SA_13", 1.2, .66, dome, DEEP, DARKB, k=42, rr=.11, squash=.6, bow=.08),
    "Caesalpinia": B("SA_13", 1.25, .66, vase, DRYG, GREENB, k=36, rr=.10, squash=.5, dens=3, stems=2, bow=.08, forkf=.95, limbs=26),
    "Loxopterygium": B("SA_13", 1.1, .52, oval, DRYG, BROWN, k=48, rr=.105, squash=.55, dens=3.6, bow=.03),
}


def draw(form, c, cap, H):
    s, dbh = SHAPES[form], G.DBH_VEC[c]
    name = f"{form}-{c}"
    cw = G.crown_m(dbh, s["zone"]) * s.get("cf", 1)
    if s["kind"] == "B":
        kw = dict(s["kw"])
        z = min(1, cw / 9)                                # fewer, larger lobes on small crowns
        kw["k"] = max(14, int(kw.get("k", 46) * (.45 + .55 * z)))
        kw["rr"] = kw.get("rr", .11) * (1.45 - .45 * z)
        if kw.get("butt"):
            kw["butt"] = kw["butt"] * max(0, (c - 4) / 8)
        return broadleaf(name, dbh, H, cw, s["depth"], s["profile"], s["pal"], s["bark"], **kw), cw
    if s["kind"] == "C":
        return cecropia(name, dbh, H, cw, s["nb"], s["R"], s["pal"], s["bark"], **s["kw"]), cw
    f = .78 + .22 * c / max(1, cap)                       # young palms: shorter leaves and stilts
    kw = dict(s["kw"])
    if kw.get("stilt"):
        kw["stilt"] = min(kw["stilt"] * f, H * .16)
    L = min(s["length"] * f, H * .62)
    return palm(name, dbh, H - .45 * L, s["n"], L, s["rise"], s["droop"], s["pinna"], **kw), 1.7 * L


def main():
    data = json.loads((ROOT / "tools/genus_data.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.png"):
        f.unlink()
    forms = {}
    for form, d in data["forms"].items():
        zone, sizes = SHAPES[form]["zone"], []
        for c in range(d["cap"] + 1):
            H = d["height_m"][zone][c]
            (im, ax, ay), cw = draw(form, c, d["cap"], H)
            name = f"{form}_D{c + 1:02d}.png"
            im.quantize(256, method=Image.Quantize.FASTOCTREE).save(OUT / name, optimize=True)
            sizes.append({"file": f"genus/{name}", "w": im.width, "h": im.height, "ax": ax, "ay": ay,
                          "ppm": PPM, "height_m": H, "crown_m": round(cw, 2)})
        forms[form] = {"cap": d["cap"], "palm": SHAPES[form]["kind"] == "P", "sizes": sizes, "height_m": d["height_m"]}
        if not d.get("measured", True):           # too few trees: heights are the zone curve
            forms[form]["few"] = d["trees"]
    out = {"forms": forms, "genus_form": data["genus_form"], "zone_form": data["zone_form"], "cap": data["cap"],
           "zones": {z: {k: v[k] for k in ("trees", "plots", "genera", "height_m", "mix", "drawn_by_genus")} for z, v in data["zones"].items()}}
    (OUT.parent / "genus.json").write_text(json.dumps(out, separators=(",", ":")))
    print(sum(len(f["sizes"]) for f in forms.values()), "sprites")


if __name__ == "__main__":
    main()
