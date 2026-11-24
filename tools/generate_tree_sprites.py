#!/usr/bin/env python3
"""Generate the tree-sprite library used by the Stand View module.

    python tools/generate_tree_sprites.py            # everything
    python tools/generate_tree_sprites.py SA_13      # one ecozone only
    (needs: pip install pillow numpy)

WHAT THE SPRITES REPRESENT
--------------------------
perudata.csv has no species or forest-type information (FT is 999 in every row).
The only tree class it distinguishes is the ecozone (GEC), which takes three
values in Peru, so the library is  3 ecozones x 13 DBH classes:

    SA_11  tropical rainforest        tall clear bole, broad crown, buttresses
    SA_13  tropical dry forest        short, crooked, open spreading crown
    SA_16  tropical mountain system   compact, leaning, mossy

Each cell gets three crown shapes (a, b, c) so a stand is not made of clones.
Those shapes are DECORATIVE: they are assigned at random and do not stand for
species. Each cell also gets one standing-dead tree ("snag").

SCALE
-----
Sprites are drawn to scale from the DBH representative diameters used by the
simulation (DBH_VEC in simulation.rs). Height is NOT an output of the matrix
model, so it comes from the Western-Amazonia Weibull equation of Feldpausch et
al. (2012, Biogeosciences 9:3381-3403, Table 3):
        H = 46.263 * (1 - exp(-0.0876 * D^0.6072))
SA_13 and SA_16 multiply it by HEIGHT_SCALE, and crown width uses CROWN. Those
two sets of numbers are ILLUSTRATIVE ASSUMPTIONS, not published values: edit
them here and re-run if you have local allometries.
"""
import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "trees"

# Keep in step with simulation.rs
DBH_VEC = [12.93003, 17.28223, 22.25088, 27.31658, 32.29727, 37.24331, 42.30573,
           47.27999, 52.22731, 57.30927, 62.43174, 67.25792, 90.29815]
DBH_LABEL = ["10-15", "15-20", "20-25", "25-30", "30-35", "35-40", "40-45",
             "45-50", "50-55", "55-60", "60-65", "65-70", "70plus"]

HEIGHT_SCALE = {"SA_11": 1.00, "SA_13": 0.50, "SA_16": 0.72}
CROWN = {"SA_11": (0.36, 0.84), "SA_13": (0.44, 0.80), "SA_16": (0.40, 0.78)}
PX_PER_M = {"SA_11": 14, "SA_13": 24, "SA_16": 18}
NAMES = {"SA_11": "Tropical rainforest", "SA_13": "Tropical dry forest",
         "SA_16": "Tropical mountain system"}
SHAPES = "abc"
SS = 3  # supersampling

# (darkest, mid, lightest) foliage, then bark (dark, light)
PALETTE = {
    "SA_11": dict(
        leaf=[((16, 44, 24), (48, 104, 46), (136, 178, 84)),
              ((14, 48, 34), (36, 100, 60), (112, 172, 104)),
              ((26, 50, 18), (70, 116, 40), (164, 192, 88))],
        bark=((74, 64, 54), (176, 164, 146))),
    "SA_13": dict(
        leaf=[((58, 66, 28), (120, 130, 58), (196, 198, 112)),
              ((70, 70, 30), (142, 138, 62), (212, 202, 118)),
              ((48, 66, 36), (102, 126, 68), (176, 190, 120))],
        bark=((82, 66, 50), (190, 168, 138))),
    "SA_16": dict(
        leaf=[((16, 42, 36), (44, 88, 66), (116, 154, 112)),
              ((22, 46, 30), (60, 98, 56), (136, 164, 98)),
              ((26, 40, 34), (72, 92, 70), (148, 164, 124))],
        bark=((50, 44, 38), (134, 122, 102))),
}


def height_m(dbh, gec):
    return 46.263 * (1 - math.exp(-0.0876 * dbh ** 0.6072)) * HEIGHT_SCALE[gec]


def crown_m(dbh, gec):
    a, b = CROWN[gec]
    return a * dbh ** b


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(lerp(x, y, t))) for x, y in zip(c1, c2))


def ramp(pal, t):
    dark, mid, light = pal
    return mix(dark, mid, t * 2) if t < 0.5 else mix(mid, light, t * 2 - 1)


def bezier(p0, p1, p2, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return pts


def limb(draw, pts, w0, w1, bark, rng, moss=None, light=-1):
    """Tapered limb: shaded across its width, lit from the left."""
    n = len(pts)
    strips = 9
    edges = []
    for i, (x, y) in enumerate(pts):
        x2, y2 = pts[min(i + 1, n - 1)]
        x1, y1 = pts[max(i - 1, 0)]
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        if nx > 0:
            nx, ny = -nx, -ny           # normal always points left
        w = lerp(w0, w1, i / (n - 1)) / 2
        edges.append((x, y, nx, ny, max(w, 0.8)))
    for s in range(strips):
        a = 1 - 2 * s / strips          # +1 = left edge, -1 = right edge
        b = 1 - 2 * (s + 1) / strips
        c = (a + b) / 2
        shade = 0.32 + 0.62 * math.sqrt(max(0, 1 - (c - 0.35) ** 2 / 1.9)) * (0.5 + 0.5 * c) + 0.08
        left = [(x + nx * w * a, y + ny * w * a) for x, y, nx, ny, w in edges]
        right = [(x + nx * w * b, y + ny * w * b) for x, y, nx, ny, w in edges]
        draw.polygon(left + right[::-1], fill=mix(*bark, shade) + (255,))
    # bark texture
    for x, y, nx, ny, w in edges:
        if w < 4:
            continue
        for _ in range(max(1, int(w / 3))):
            o = rng.uniform(-0.9, 0.9)
            l = rng.uniform(2, 7) * SS / 2
            col = mix(*bark, 0.12 if rng.random() < 0.7 else 0.95)
            px, py = x + nx * w * o, y + rng.uniform(-6, 6)
            draw.line([(px, py), (px + rng.uniform(-1, 1), py + l)], fill=col + (110,), width=max(1, SS // 2))
        if moss and rng.random() < 0.75:
            for _ in range(int(2 + w / 2)):
                o = rng.uniform(-1.05, 0.8)
                r = rng.uniform(0.6, 1.5) * SS
                px, py = x + nx * w * -o, y + rng.uniform(-6, 6)
                draw.ellipse([px - r, py - r, px + r, py + r],
                             fill=ramp(moss, rng.uniform(0.2, 0.7)) + (230,))


def clump(draw, cx, cy, r, squash, pal, rng, base_light, density, leaf):
    """One foliage lobe: leaf dabs on a squashed sphere, lit from top-left."""
    n = int(density * (r / leaf) ** 2)
    dabs = []
    for _ in range(n):
        # random point on disc, bulging towards the viewer
        a = rng.uniform(0, 2 * math.pi)
        q = math.sqrt(rng.random())
        ox, oy = math.cos(a) * q, math.sin(a) * q
        oz = math.sqrt(max(0, 1 - q * q))
        lit = (-0.45 * ox - 0.75 * oy + 0.48 * oz)
        dabs.append((lit, ox, oy))
    dabs.sort(key=lambda d: d[0] + rng.uniform(-0.25, 0.25))   # bright on top
    for lit, ox, oy in dabs:
        jitter = rng.uniform(0.80, 1.14) if rng.random() < 0.86 else rng.uniform(1.05, 1.38)
        jitter *= 1 + 0.13 * math.sin(3 * math.atan2(oy, ox) + cx) + 0.08 * math.sin(7 * math.atan2(oy, ox) + cy)
        x = cx + ox * r * jitter
        y = cy + oy * r * squash * jitter
        t = base_light + 0.36 * lit + rng.uniform(-0.09, 0.09)
        lw = leaf * rng.uniform(0.55, 1.15)
        lh = lw * rng.uniform(0.45, 0.8)
        draw.ellipse([x - lw, y - lh, x + lw, y + lh], fill=ramp(pal, t) + (255,))


def crown_lobes(gec, shape, rng, cw, ch, size):
    """Lobe centres in crown space: x in +-1, y 0 (top) .. 1 (base), z depth."""
    k = int(lerp(26, 78, size)) if gec != "SA_13" else int(lerp(22, 58, size))
    lobes = []
    for i in range(k):
        for _ in range(40):
            x, y, z = rng.uniform(-1, 1), rng.uniform(0, 1), rng.uniform(-1, 1)
            if gec == "SA_11":
                if shape == "a":                       # rounded dome
                    lim = math.sqrt(max(0, 1 - (1.12 * (y - 0.58)) ** 2 / 0.46))
                elif shape == "b":                     # umbrella / emergent
                    lim = 1.0 if y < 0.34 else max(0, 1 - (y - 0.34) * 1.75)
                    lim *= min(1, 0.45 + y * 3.2)
                else:                                  # narrow, layered
                    lim = 0.74 * (0.5 + 0.5 * math.sin(math.pi * min(1, y * 1.05 + 0.08)))
                    lim *= 0.74 + 0.26 * math.cos(y * 15)
            elif gec == "SA_13":
                if shape == "a":                       # flat-topped
                    lim = min(1, 0.6 + y * 1.6) if y < 0.6 else max(0, 1.0 - (y - 0.6) * 1.9)
                elif shape == "b":                     # open, broken crown
                    lim = 0.95 - 0.3 * abs(y - 0.5)
                else:                                  # vase
                    lim = max(0.12, 1 - y * 0.9)
            else:
                if shape == "a":                       # compact dome
                    lim = math.sqrt(max(0, 1 - (y - 0.55) ** 2 / 0.32))
                elif shape == "b":                     # wind-sheared
                    lim = math.sqrt(max(0, 1 - (y - 0.5 - 0.25 * x) ** 2 / 0.22))
                else:                                  # tiered
                    lim = 0.85 * (0.55 + 0.45 * abs(math.cos(y * 7.5))) * min(1, 0.45 + y * 2)
            if x * x + 0.55 * z * z <= lim * lim:
                lobes.append((x, y, z))
                break
    return lobes


def draw_tree(gec, di, shape):
    dbh = DBH_VEC[di]
    size = di / 12
    rng = random.Random(f"{gec}-{di}-{shape}")
    H = height_m(dbh, gec) * {"a": 1.0, "b": 1.02, "c": 0.97}[shape]
    cw_m = crown_m(dbh, gec) * {"a": 1.0, "b": 1.12, "c": 0.86}[shape]
    k = PX_PER_M[gec] * SS
    depth = {"SA_11": {"a": 0.42, "b": 0.30, "c": 0.55},
             "SA_13": {"a": 0.50, "b": 0.60, "c": 0.62},
             "SA_16": {"a": 0.55, "b": 0.48, "c": 0.64}}[gec][shape]
    ch = H * depth * k                          # crown depth, px
    cw = cw_m * k                               # crown width, px
    h = H * k
    pad = int(0.12 * cw + 14 * SS)
    W = int(cw * 1.25 + pad * 2)
    Ht = int(h + pad * 2)
    img = Image.new("RGBA", (W, Ht), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    bx, by = W / 2, Ht - pad
    top = by - h

    pal = PALETTE[gec]["leaf"][SHAPES.index(shape)]
    bark = PALETTE[gec]["bark"]
    moss = PALETTE[gec]["leaf"][1] if gec == "SA_16" else None
    # Slender stems need a visual floor or they vanish once scaled down.
    tw = max(dbh / 100 * k, 2.6 * SS)

    lean = {"SA_11": 0.03, "SA_13": 0.13, "SA_16": 0.10}[gec] * rng.choice([-1, 1]) * rng.uniform(0.5, 1)
    fork_y = top + ch * (0.72 if gec != "SA_13" else 0.95)
    fork = (bx + lean * (by - fork_y), fork_y)
    bow = {"SA_11": 0.01, "SA_13": 0.07, "SA_16": 0.06}[gec] * h * rng.uniform(-1, 1)
    trunk = bezier((bx, by), (bx + bow, (by + fork_y) / 2), fork, 26)

    lobes = crown_lobes(gec, shape, rng, cw, ch, size)
    shear = -0.12 if (gec == "SA_16" and shape == "b") else 0
    pts = []
    for x, y, z in lobes:
        px = fork[0] + x * cw / 2 * 0.86 + shear * cw * (1 - y)
        py = top + ch * (0.10 + 0.80 * y)
        pts.append((px, py, z, x, y))
    # lobe radius
    base_r = cw * {"SA_11": 0.165, "SA_13": 0.125, "SA_16": 0.17}[gec] * lerp(1.0, 0.60, size)
    squash = {"SA_11": 0.68, "SA_13": 0.56, "SA_16": 0.74}[gec]
    dens = {"SA_11": 5.2, "SA_13": 2.1, "SA_16": 5.4}[gec]
    leaf = {"SA_11": 1.55, "SA_13": 1.7, "SA_16": 1.6}[gec] * SS

    def paint(sel):
        for px, py, z, x, y in sel:
            base = 0.36 + 0.13 * z - 0.13 * x + 0.30 * (0.5 - y) + rng.uniform(-0.05, 0.05)
            clump(d, px, py, base_r * rng.uniform(0.7, 1.35), squash * rng.uniform(0.85, 1.15), pal, rng, base, dens, leaf)

    back = sorted([p for p in pts if p[2] < -0.1], key=lambda p: (p[2], -p[4]))
    front = sorted([p for p in pts if p[2] >= -0.1], key=lambda p: (p[2], -p[4]))
    paint(back)

    # Limbs to a subset of lobes
    for px, py, z, x, y in rng.sample(pts, min(len(pts), int(lerp(9, 22, size)))):
        t = rng.uniform(0.0, 0.35) if gec != "SA_13" else rng.uniform(0, 0.5)
        sx = lerp(fork[0], trunk[-8][0], t)
        sy = lerp(fork[1], trunk[-8][1], t)
        mid = (lerp(sx, px, 0.6), lerp(sy, py, 0.25 if gec != "SA_13" else 0.45) + rng.uniform(-4, 4))
        limb(d, bezier((sx, sy), mid, (px, py), 12), max(tw * 0.42, 1.6 * SS), 0.9 * SS, bark, rng, moss)

    # Buttresses (large lowland trees only)
    if gec == "SA_11" and di >= 6:
        bh = lerp(1.2, 4.2, (di - 6) / 6) * k * rng.uniform(0.8, 1.15)
        sp = tw * lerp(0.75, 1.15, (di - 6) / 6)
        for side, shade in ((-1, 0.72), (1, 0.24), (-0.35, 0.58), (0.45, 0.38)):
            ox = side * (tw / 2 + sp)
            foot = by + (2 * SS if abs(side) < 1 else 0)
            edge = bezier((bx + side * tw * 0.40, by - bh), (bx + side * tw * 0.62, by - bh * 0.18),
                          (bx + ox, foot), 14)
            d.polygon(edge + [(bx, foot)], fill=mix(*bark, shade) + (255,))
    # Pot-bellied bole for big dry-forest trees of the vase shape
    if gec == "SA_13" and shape == "c" and di >= 7:
        limb(d, trunk, tw * 1.25, tw * 0.5, bark, rng, moss)
    else:
        limb(d, trunk, tw * 1.08, tw * 0.62, bark, rng, moss)
    # Leader carries the stem into the crown
    tipy = top + ch * 0.22
    limb(d, bezier(fork, (fork[0] + rng.uniform(-6, 6), (fork_y + tipy) / 2),
                   (fork[0] + rng.uniform(-0.06, 0.06) * cw, tipy), 12), tw * 0.6, 1.0 * SS, bark, rng, moss)
    paint(front)
    return img, (bx, by), H, cw_m, k


def draw_snag(gec, di):
    dbh = DBH_VEC[di]
    size = di / 12
    rng = random.Random(f"snag-{gec}-{di}")
    H = height_m(dbh, gec) * 0.78
    cw_m = crown_m(dbh, gec) * 0.6
    k = PX_PER_M[gec] * SS
    h, cw = H * k, cw_m * k
    pad = 14 * SS
    W, Ht = int(cw * 1.4 + pad * 2), int(h + pad * 2)
    img = Image.new("RGBA", (W, Ht), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    bx, by = W / 2, Ht - pad
    bark = ((84, 78, 72), (196, 190, 180))
    tw = max(dbh / 100 * k, 2.6 * SS)
    fork = (bx + rng.uniform(-0.03, 0.03) * h, by - h * 0.66)
    for _ in range(int(lerp(4, 9, size))):
        s = rng.choice([-1, 1])
        sy = lerp(by - h * 0.5, by - h * 0.82, rng.random())
        end = (fork[0] + s * cw * rng.uniform(0.22, 0.5), sy - h * rng.uniform(0.06, 0.16))
        limb(d, bezier((fork[0], sy), (lerp(fork[0], end[0], 0.65), sy - h * 0.01), end, 10),
             max(tw * 0.3, 1.5 * SS), 0.8 * SS, bark, rng)
    limb(d, bezier((bx, by), (bx, by - h * 0.4), fork, 24), tw * 1.05, tw * 0.66, bark, rng)
    limb(d, bezier(fork, (fork[0], by - h * 0.85), (fork[0] + rng.uniform(-0.04, 0.04) * h, by - h), 12),
         tw * 0.66, max(tw * 0.2, 1.2 * SS), bark, rng)
    return img, (bx, by), H, cw_m, k


def draw_stump():
    W, Ht = 96 * SS, 80 * SS
    img = Image.new("RGBA", (W, Ht), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    rng = random.Random("stump")
    bark = ((70, 54, 40), (150, 124, 96))
    cx, by, w = W / 2, 70 * SS, 56 * SS
    limb(d, [(cx, by), (cx, by - 14 * SS), (cx, by - 28 * SS), (cx, by - 44 * SS)], w * 1.16, w, bark, rng)
    ty = by - 44 * SS
    for f, c in ((1, (222, 186, 132)), (0.74, (204, 164, 110)), (0.66, (222, 186, 132)),
                 (0.42, (204, 164, 110)), (0.34, (218, 180, 126)), (0.12, (176, 132, 84))):
        d.ellipse([cx - w / 2 * f, ty - 9 * SS * f, cx + w / 2 * f, ty + 9 * SS * f], fill=c + (255,))
    return img, (cx, by)


def save(img, base, path):
    """Downsample, trim to content, and return (w, h, anchor x, anchor y)."""
    small = img.resize((img.width // SS, img.height // SS), Image.LANCZOS)
    ax, ay = base[0] / SS, base[1] / SS
    box = small.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    small = small.crop(box)
    small.save(path, optimize=True)
    return small.width, small.height, round(ax - box[0], 2), round(ay - box[1], 2)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[1:]
    mpath = OUT / "manifest.json"
    manifest = json.loads(mpath.read_text()) if (only and mpath.exists()) else {"zones": {}}
    manifest["dbh_cm"] = DBH_VEC
    manifest["dbh_labels"] = DBH_LABEL
    manifest["shapes"] = list(SHAPES)
    for gec in (only or list(NAMES)):
        zdir = OUT / gec
        zdir.mkdir(exist_ok=True)
        classes = []
        for di in range(13):
            entry = {"trees": []}
            for shape in list(SHAPES) + ["snag"]:
                img, base, H, cw, k = draw_snag(gec, di) if shape == "snag" else draw_tree(gec, di, shape)
                name = f"{gec}_D{di + 1:02d}_{DBH_LABEL[di]}_{shape}.png"
                w, h, ax, ay = save(img, base, zdir / name)
                rec = {"file": f"{gec}/{name}", "w": w, "h": h, "ax": ax, "ay": ay,
                       "ppm": PX_PER_M[gec], "height_m": round(H, 2), "crown_m": round(cw, 2)}
                if shape == "snag":
                    entry["snag"] = rec
                else:
                    entry["trees"].append(rec)
            entry["height_m"] = round(height_m(DBH_VEC[di], gec), 2)
            entry["crown_m"] = round(crown_m(DBH_VEC[di], gec), 2)
            classes.append(entry)
        manifest["zones"][gec] = {"name": NAMES[gec], "classes": classes}
        print(gec, "done")
    img, base = draw_stump()
    w, h, ax, ay = save(img, base, OUT / "stump.png")
    manifest["stump"] = {"file": "stump.png", "w": w, "h": h, "ax": ax, "ay": ay, "stem_px": 56}
    mpath.write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
