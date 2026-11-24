#!/usr/bin/env python3
"""Summarise a tree inventory into tools/genus_data.json for the Stand View.

    python tools/build_genus_data.py path/to/inventory.csv
    (needs: pip install pandas numpy scipy)

Input: one row per stem, with Ecozona, PlotID, subplot_register_unit_id,
tree_num, Species, Habito, DBH (cm), Altura_total (m), Latitude, Longitude.
Lines starting with # are skipped. Only aggregated shares and medians are
written; no plot, coordinate or individual tree leaves the input file.

Rules
- One record per tree (its thickest stem); DBH >= 10 cm; trees, palms, shrubs.
- Zone: Costa (CO) plots -> SA_13 (dry forest). Every other plot -> the GEC of
  the nearest perudata.csv point, the same rule the app uses, if it is within
  MAX_KM; otherwise the plot is dropped.
- Planted genera (PLANTED) are left out of the mix, the height curves and the
  tree counts. They only get a shape, for compositions the user sets.
- Shares are by zone and DBH class; a class with fewer than MIN_N trees borrows
  from its neighbours. Genera without a shape in FORMS go to "Other".
- Heights are medians of the recorded heights (possibly visual estimates
  made in the field), smoothed with a Weibull curve per zone.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import curve_fit
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
D = np.array([12.93003, 17.28223, 22.25088, 27.31658, 32.29727, 37.24331, 42.30573,
              47.27999, 52.22731, 57.30927, 62.43174, 67.25792, 90.29815])
ZONES = ["SA_11", "SA_13", "SA_16"]
MAX_KM = 10
MIN_N = {"SA_11": 300, "SA_13": 60, "SA_16": 200}
PLANTED = ["Eucalyptus", "Pinus"]
MIN_PLANTED = 25           # fewer measured trees than this: use the zone height curve

# Shape -> genera drawn with it. Grouped by overall look, not by taxonomy.
FORMS = {
    "Eschweilera": "Eschweilera Pouteria Licania Micropholis Chrysophyllum Couratari Manilkara Hirtella Couepia Hevea Pachira Nealchornea Leonia",
    "Protium": "Protium Ocotea Guarea Trichilia Nectandra Guatteria Brosimum Sterculia Apeiba Pterocarpus Swartzia Casearia Tapirira Aniba Persea "
               "Eugenia Clarisia Perebea Naucleopsis Alchornea Neea Macrolobium Sapium Drypetes Annona Lonchocarpus Hieronyma Dendropanax Zygia",
    "Pseudolmedia": "Pseudolmedia Matisia Pseudosenefeldera Aspidosperma Oxandra Quararibea Duguetia Mabea Sorocea Unonopsis Xylopia",
    "Inga": "Inga Heliocarpus Trema Croton Vismia Jacaranda",
    "Virola": "Virola Iryanthera Otoba Osteophloeum Compsoneura",
    "Sloanea": "Sloanea Tachigali Parkia Cedrelinga Hura Ceiba Vochysia Terminalia Buchenavia Dipteryx Cedrela Schizolobium Hymenaea",
    "Ficus": "Ficus Coussapoa",
    "Cecropia": "Cecropia",
    "Pourouma": "Pourouma Schefflera Oreopanax",
    "Miconia": "Miconia Theobroma Siparuna Rinorea Palicourea Hedyosmum Solanum Urera Piper Cavendishia Psychotria",
    "Iriartea": "Iriartea",
    "Socratea": "Socratea",
    "Euterpe": "Euterpe",
    "Oenocarpus": "Oenocarpus",
    "Mauritia": "Mauritia Mauritiella",
    "Attalea": "Attalea",
    "Astrocaryum": "Astrocaryum",
    "Weinmannia": "Weinmannia Clethra Clusia Hesperomeles Symplocos Myrsine Vallea Ladenbergia Podocarpus Ilex Meliosma Morella",
    "Escallonia": "Escallonia Gynoxys Citharexylum Sessea Buddleja",
    "Alnus": "Alnus",
    "Myrcianthes": "Myrcianthes Mauria",
    "Polylepis": "Polylepis",
    "Bursera": "Bursera Cochlospermum",
    "Eriotheca": "Eriotheca",
    "Prosopis": "Prosopis Vachellia Parkinsonia Leucaena Albizia Acacia",
    "Cordia": "Cordia Capparis Cynophalla Capparidastrum Coccoloba",
    "Colicodendron": "Colicodendron Simira Geoffroea",
    "Caesalpinia": "Caesalpinia Libidibia",
    "Loxopterygium": "Loxopterygium Handroanthus Myroxylon Erythrina Gallesia",
}
FORM_OF = {g: f for f, gs in FORMS.items() for g in gs.split()} | {g: g for g in PLANTED}
# Genera that look different outside the dry forest.
ZONE_FORM = {z: {"Cordia": "Protium", "Coccoloba": "Protium", "Simira": "Protium", "Myroxylon": "Sloanea", "Albizia": "Sloanea",
                 "Erythrina": "Sloanea", "Handroanthus": "Protium", "Cynophalla": "Protium"} for z in ("SA_11", "SA_16")}


def weibull(d, a, b, c):
    return a * (1 - np.exp(-b * d ** c))


def load(path):
    x = pd.read_csv(path, comment="#", dtype=str).rename(columns={"Ecozone": "Ecozona"})
    for k in ("DBH", "Altura_total", "Latitude", "Longitude"):
        x[k] = pd.to_numeric(x[k].str.replace(",", "."), errors="coerce")
    grid = pd.read_csv(ROOT / "src-tauri/data/perudata.csv", usecols=["LAT", "LON", "GEC"])
    plots = x.groupby("PlotID").agg(lat=("Latitude", "median"), lon=("Longitude", "median")).dropna()
    dist, i = cKDTree(grid[["LAT", "LON"]].values).query(plots[["lat", "lon"]].values)
    plots["km"], plots["gec"] = dist * 111, grid.GEC.values[i]
    x = x.join(plots[["km", "gec"]], on="PlotID")
    x["genus"] = x.Species.str.strip().str.split().str[0].str.capitalize()
    x = x.sort_values(["DBH", "TreeID"], ascending=[False, True]).drop_duplicates(["PlotID", "subplot_register_unit_id", "tree_num"])
    x = x[(x.DBH >= 10) & x.Habito.isin(["Arbol", "Palmera", "Arbusto"])].copy()
    x["cls"] = np.minimum(((x.DBH - 10) // 5).astype(int), 12)
    x["zone"] = np.where(x.Ecozona == "CO", "SA_13", np.where(x.km <= MAX_KM, x.gec, None))
    x = x[x.zone.isin(ZONES)].copy()
    x["form"] = [ZONE_FORM.get(z, {}).get(g, FORM_OF.get(g, "Other")) for z, g in zip(x.zone, x.genus)]
    return x


def main():
    x = load(sys.argv[1])
    planted = x[x.genus.isin(PLANTED)].copy()
    x = x[~x.genus.isin(PLANTED)].copy()
    out = {"zones": {}, "forms": {}, "genus_form": FORM_OF, "zone_form": ZONE_FORM}
    fit, ratio = {}, {}
    for z in ZONES:
        q = x[(x.zone == z) & (x.Habito == "Arbol") & (x.Altura_total > 1.3)]
        g = q.groupby("cls").Altura_total.agg(["median", "size"])
        p, _ = curve_fit(weibull, D[g.index], g["median"], p0=(25, .06, .7), sigma=1 / np.sqrt(g["size"]),
                         bounds=([8, .001, .3], [40, .5, 1.3]), maxfev=20000)
        fit[z] = [float(v) for v in p]
    x["ratio"] = x.Altura_total / [weibull(d, *fit[z]) for d, z in zip(x.DBH.clip(upper=100), x.zone)]

    # Largest class a genus is drawn in: the class of its 99th-percentile DBH.
    cap = {}
    for g, s in x[x.form != "Other"].groupby("genus"):
        cap[g] = int(min(12, (s.DBH.quantile(.99) - 10) // 5))
    for z in ZONES:
        q = x[x.zone == z]
        classes = []
        for c in range(13):
            lo, hi = c, c
            while ((q.cls >= lo) & (q.cls <= hi)).sum() < MIN_N[z] and (lo > 0 or hi < 12):
                lo, hi = max(0, lo - 1), min(12, hi + 1)
            w = q[(q.cls >= lo) & (q.cls <= hi)]
            vc = w.genus.where(w.form != "Other", "Other").value_counts()
            vc = vc[[g == "Other" or cap[g] >= c for g in vc.index]]
            share = vc / vc.sum()
            small = share[(share < .002) & (share.index != "Other")]
            mix = share.drop(small.index).round(4).to_dict()
            mix["Other"] = round(float(mix.get("Other", 0) + small.sum()), 4)
            classes.append(mix)
        t = q[q.form != "Other"]
        out["zones"][z] = {
            "trees": int(len(q)), "plots": int(q.PlotID.nunique()), "genera": int(q.genus.nunique()),
            "weibull": [round(v, 5) for v in fit[z]], "height_m": [round(float(weibull(d, *fit[z])), 2) for d in D], "mix": classes,
            "drawn_by_genus": round(float(len(t) / len(q)), 3),
        }
    for f in FORMS:
        s = x[x.form == f]
        if not len(s):
            continue
        h = {}
        for z in ZONES:
            sz = s[(s.zone == z) & (s.Altura_total > 1.3)]
            r = sz if len(sz) >= 25 else s[s.Altura_total > 1.3]
            k = float(r.ratio.median())
            hs = []
            for c in range(13):
                m = sz[sz.cls == c].Altura_total
                hs.append(float(m.median()) if len(m) >= 20 else k * float(weibull(D[c], *fit[z])))
            top = float(r.Altura_total.quantile(.97))       # no extrapolating past what was measured
            h[z] = [round(float(v), 2) for v in np.minimum(np.maximum.accumulate(hs), top)]
        out["forms"][f] = {"trees": int(len(s)), "cap": max(cap[g] for g in s.genus.unique()), "height_m": h}
    planted["ratio"] = planted.Altura_total / [weibull(d, *fit[z]) for d, z in zip(planted.DBH.clip(upper=100), planted.zone)]
    for f in PLANTED:
        s = planted[(planted.genus == f) & (planted.Altura_total > 1.3)]
        ok, h = len(s) >= MIN_PLANTED, {}
        for z in ZONES:
            hs = []
            for c in range(13):
                m = s[(s.zone == z) & (s.cls == c)].Altura_total
                hs.append(float(m.median()) if ok and len(m) >= 20 else (float(s.ratio.median()) if ok else 1) * float(weibull(D[c], *fit[z])))
            hs = np.maximum.accumulate(hs)
            h[z] = [round(float(v), 2) for v in (np.minimum(hs, s.Altura_total.quantile(.97)) if ok else hs)]
        cap[f] = 12
        out["forms"][f] = {"trees": int(len(s)), "cap": 12, "height_m": h, "measured": ok}
    out["cap"] = cap
    (ROOT / "tools/genus_data.json").write_text(json.dumps(out, indent=1))
    for z in ZONES:
        o = out["zones"][z]
        print(z, o["trees"], "trees", o["plots"], "plots; drawn by genus", o["drawn_by_genus"], "; H", o["height_m"])
    print({f: (v["trees"], v["cap"]) for f, v in out["forms"].items()}, "missing:", set(FORMS) - set(out["forms"]))


if __name__ == "__main__":
    main()
