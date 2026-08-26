# MatrixPro Peru — Tauri / Rust desktop port

A desktop port of the `MatrixPro Peru` Shiny app. The matrix forest-growth
model, the RandomForest predictions, the closest-plot lookup, and CSV export
all run in **Rust**. The UI runs in the Tauri webview (HTML/CSS/JS) and reuses
the original styling, Leaflet map, and Chart.js charts. **No R runtime is
needed to run the app** — R is used exactly once, to convert the models.

```
matrixpro-tauri/
├─ convert_models.R          # ONE-TIME: .RData randomForest -> JSON
├─ src/                      # frontend (webview)
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  └─ peru_departments.geojson   (optional, for the map badge)
└─ src-tauri/                # Rust backend
   ├─ Cargo.toml
   ├─ build.rs
   ├─ tauri.conf.json
   ├─ capabilities/default.json
   ├─ data/                  # perudata.csv + the 3 model_*.json go here
   └─ src/
      ├─ main.rs             # Tauri commands, CSV loading, file save
      ├─ random_forest.rs    # RandomForest regression predictor
      └─ simulation.rs       # the matrix model + constants + AGB tables
```

## Step 1 — Convert the models (run R once)

From the folder containing your three `.RData` files:

```bash
Rscript convert_models.R
# or with explicit paths:
# Rscript convert_models.R RF.RC.0722.CONT.SA.RData RF.UG.0330.CONT.SA.RData RF.MT.0722.CONT.SA.RData
```

This writes `model_recruitment.json`, `model_upgrowth.json`,
`model_mortality.json` (and optionally `peru_departments.geojson` if
`rnaturalearth`/`sf` are installed). The script prints each model's predictor
variable names — **sanity-check that they match the column names in
`perudata.csv`** (plus `D`, `N`, `B`, `S1`, `S2`).

## Step 2 — Place the data files

```
src-tauri/data/perudata.csv            (your CSV, unchanged)
src-tauri/data/model_recruitment.json
src-tauri/data/model_upgrowth.json
src-tauri/data/model_mortality.json
src/peru_departments.geojson           (optional)
```

## Step 3 — Prerequisites

- Rust (https://rustup.rs)
- Node.js (only for the Tauri CLI) and the Tauri v2 system deps for your OS
  (WebView2 on Windows, WebKitGTK on Linux, Xcode tools on macOS — see
  https://tauri.app/start/prerequisites/)
- Tauri CLI: `npm install -g @tauri-apps/cli` (or `cargo install tauri-cli --version "^2"`)

Generate app icons once (Tauri's bundler expects them):

```bash
npx @tauri-apps/cli icon path/to/any-logo.png   # creates src-tauri/icons/*
```

## Step 4 — Run / build

```bash
cd src-tauri
cargo tauri dev      # development run
cargo tauri build    # produces an installer/binary for your OS
```

(If you used `npm i -g @tauri-apps/cli`, run `tauri dev` / `tauri build`
from the project root instead.)

## How the port maps to the original

| Original (R/Shiny)                          | Port |
|---------------------------------------------|------|
| `predict(randomForest, …)`                  | `random_forest.rs` — tree traversal, mean over trees |
| simulation loop in `observeEvent(run_btn)`  | `simulation.rs::run_simulation` (line-for-line) |
| `read.csv("perudata.csv")` + `which.min`    | `main.rs` — `csv` crate + nearest-row search |
| `AGB_DATA`, `DBH_VEC`, `DBH_CLASSES`        | constants in `simulation.rs` |
| Leaflet map, Chart.js, tables               | `app.js` (unchanged behavior) |
| `sf` + `rnaturalearth` (department badge)   | bundled GeoJSON + JS ray-casting point-in-polygon |
| `downloadHandler`                           | native Save-As via `tauri-plugin-dialog` (+ Blob fallback) |

## Important correctness note (read this)

The simulation feeds three covariates that change every year — `N` (trees/ha),
`B` (basal area), `S1` (Shannon), `S2` (Simpson) — plus per-class `D` to the
models. The port treats the names **`N`, `B`, `S1`, `S2`, `D`** as the dynamic
inputs and pulls every *other* model variable from the matched `perudata.csv`
row by column name (exactly as the original did via `cbind`/`predict`
name-matching).

If `convert_models.R` reports that a model uses different names for those stand
variables (e.g. `BA` instead of `B`), edit the `match` arms in
`simulation.rs::build_feats` accordingly. This is the only place naming
assumptions live.

One tree-traversal convention is also worth verifying once: numeric splits send
`x <= split_point` to the **left** daughter (standard `randomForest`). If a
quick spot-check against the R app's first-year predictions is mirrored, flip
the `<=` in `random_forest.rs::predict_one`. A good check: run one year in both
the R app and this app with identical inputs and compare year-1 Total TPH.

## Offline / CDN note

`index.html` loads Leaflet and Chart.js from CDNs, so first run needs internet.
For a fully offline app, download those JS/CSS files into `src/vendor/` and
change the `<script>`/`<link>` paths in `index.html`.
