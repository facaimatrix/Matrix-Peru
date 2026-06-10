// Prevent an extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod random_forest;
mod simulation;

use random_forest::RandomForest;
use serde::Serialize;
use simulation::{run_simulation, SimResult, N_DBH};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

// ── Forest Mask ──────────────────────────────────────────────────────────────

struct ForestMask {
    data: Vec<u8>,
    width: u32,
    height: u32,
    origin_lon: f64,
    origin_lat: f64,
    scale_x: f64,
    scale_y: f64,
}

impl ForestMask {
    fn load(path: &std::path::Path) -> Result<Self, String> {
        use tiff::decoder::{Decoder, DecodingResult};

        let (origin_lon, origin_lat, scale_x, scale_y) = find_geotransform(path)?;

        let file = std::fs::File::open(path)
            .map_err(|e| format!("Cannot open forest_mask.tif: {}", e))?;
        let mut dec = Decoder::new(file)
            .map_err(|e| format!("Invalid TIFF: {}", e))?;

        let (width, height) = dec.dimensions()
            .map_err(|e| format!("Cannot read dimensions: {}", e))?;

        let image = dec.read_image()
            .map_err(|e| format!("Cannot read raster data: {}", e))?;
        let data: Vec<u8> = match image {
            DecodingResult::U8(v)  => v,
            DecodingResult::I8(v)  => v.into_iter().map(|x| x as u8).collect(),
            DecodingResult::U16(v) => v.into_iter().map(|x| x as u8).collect(),
            DecodingResult::I16(v) => v.into_iter().map(|x| x as u8).collect(),
            DecodingResult::U32(v) => v.into_iter().map(|x| x as u8).collect(),
            DecodingResult::I32(v) => v.into_iter().map(|x| x as u8).collect(),
            other => return Err(format!("Unsupported pixel type in forest_mask.tif: {:?}", other)),
        };

        println!(
            "[forest_mask] loaded {}×{} px | origin ({:.6}, {:.6}) | scale ({:.8}, {:.8})",
            width, height, origin_lon, origin_lat, scale_x, scale_y
        );
        Ok(ForestMask { data, width, height, origin_lon, origin_lat, scale_x, scale_y })
    }

    fn is_forest(&self, lat: f64, lon: f64) -> bool {
        let col = ((lon - self.origin_lon) / self.scale_x).floor() as i64;
        let row = ((self.origin_lat - lat) / self.scale_y).floor() as i64;
        if col < 0 || row < 0 || col >= self.width as i64 || row >= self.height as i64 {
            return false;
        }
        let idx = row as usize * self.width as usize + col as usize;
        self.data.get(idx).copied().unwrap_or(0) == 1
    }
}

// ── Geotransform extraction ───────────────────────────────────────────────────
// Returns (origin_lon, origin_lat, scale_x, scale_y).
// Tries three methods in order:
//   1. Raw TIFF IFD scan for GeoTIFF tags (works even when the tiff crate misses them)
//   2. Companion world file (.tfw)

fn find_geotransform(path: &std::path::Path) -> Result<(f64, f64, f64, f64), String> {
    if let Ok(gt) = raw_tiff_geotransform(path) {
        return Ok(gt);
    }
    let tfw = path.with_extension("tfw");
    if tfw.is_file() {
        return parse_world_file(&tfw);
    }
    Err(
        "forest_mask.tif has no embedded georeferencing (GeoTIFF tags 33550/33922/34264 absent) \
         and no .tfw world file. Re-export the mask from your GIS with georeferencing enabled, \
         or place a forest_mask.tfw world file in src-tauri/data/.".into()
    )
}

fn tif_u16(data: &[u8], off: usize, le: bool) -> Option<u16> {
    let b = data.get(off..off + 2)?;
    Some(if le { u16::from_le_bytes([b[0], b[1]]) } else { u16::from_be_bytes([b[0], b[1]]) })
}
fn tif_u32(data: &[u8], off: usize, le: bool) -> Option<u32> {
    let b = data.get(off..off + 4)?;
    Some(if le { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) } else { u32::from_be_bytes([b[0], b[1], b[2], b[3]]) })
}
fn tif_f64(data: &[u8], off: usize, le: bool) -> Option<f64> {
    let b = data.get(off..off + 8)?;
    let u = if le { u64::from_le_bytes(b.try_into().ok()?) } else { u64::from_be_bytes(b.try_into().ok()?) };
    Some(f64::from_bits(u))
}
fn tif_f32(data: &[u8], off: usize, le: bool) -> Option<f32> {
    let b = data.get(off..off + 4)?;
    let u = if le { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) } else { u32::from_be_bytes([b[0], b[1], b[2], b[3]]) };
    Some(f32::from_bits(u))
}

fn raw_tiff_geotransform(path: &std::path::Path) -> Result<(f64, f64, f64, f64), String> {
    let data = std::fs::read(path).map_err(|e| e.to_string())?;

    let le = match data.get(0..2) {
        Some(b"II") => true,
        Some(b"MM") => false,
        _ => return Err("not a TIFF".into()),
    };

    let magic = tif_u16(&data, 2, le).unwrap_or(0);
    if magic != 42 {
        return Err(format!("unsupported TIFF magic: {}", magic));
    }

    let mut ifd_off = tif_u32(&data, 4, le).unwrap_or(0) as usize;

    for _ in 0..32 {
        if ifd_off == 0 || ifd_off + 2 > data.len() { break; }
        let n_entries = tif_u16(&data, ifd_off, le).unwrap_or(0) as usize;

        let mut scale: Vec<f64> = Vec::new();
        let mut tp:    Vec<f64> = Vec::new();
        let mut xform: Vec<f64> = Vec::new();

        for i in 0..n_entries {
            let e = ifd_off + 2 + i * 12;
            let tag   = match tif_u16(&data, e,     le) { Some(v) => v, None => break };
            let typ   = match tif_u16(&data, e + 2, le) { Some(v) => v, None => break };
            let count = match tif_u32(&data, e + 4, le) { Some(v) => v as usize, None => break };

            if !matches!(tag, 33550 | 33922 | 34264) { continue; }

            // value_size in bytes per element; only DOUBLE (12) and FLOAT (11) make sense here
            let vsize: usize = match typ { 12 => 8, 11 => 4, _ => continue };
            let total = count.saturating_mul(vsize);
            let data_off: usize = if total <= 4 {
                e + 8
            } else {
                match tif_u32(&data, e + 8, le) { Some(v) => v as usize, None => continue }
            };

            let vals: Vec<f64> = (0..count).filter_map(|j| {
                let o = data_off + j * vsize;
                if typ == 12 { tif_f64(&data, o, le) }
                else         { tif_f32(&data, o, le).map(|f| f as f64) }
            }).collect();

            match tag { 33550 => scale = vals, 33922 => tp = vals, 34264 => xform = vals, _ => {} }
        }

        if scale.len() >= 2 && tp.len() >= 6 {
            let (sx, sy) = (scale[0], scale[1].abs());
            return Ok((tp[3] - tp[0] * sx, tp[4] + tp[1] * sy, sx, sy));
        }
        if xform.len() >= 8 {
            return Ok((xform[3], xform[7], xform[0].abs(), xform[5].abs()));
        }

        let next_loc = ifd_off + 2 + n_entries * 12;
        ifd_off = tif_u32(&data, next_loc, le).unwrap_or(0) as usize;
    }

    Err("GeoTIFF geotransform tags not found in any IFD".into())
}

fn parse_world_file(path: &std::path::Path) -> Result<(f64, f64, f64, f64), String> {
    let txt = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let v: Vec<f64> = txt.split_whitespace().filter_map(|s| s.parse().ok()).collect();
    if v.len() < 6 {
        return Err(format!("World file has only {} values, need 6", v.len()));
    }
    // [pixel_size_x, rot_x, rot_y, pixel_size_y(neg), center_ul_x, center_ul_y]
    // Adjust from pixel-center to pixel-corner origin
    let sx = v[0].abs();
    let sy = v[3].abs();
    Ok((v[4] - sx / 2.0, v[5] + sy / 2.0, sx, sy))
}

// ── App State ─────────────────────────────────────────────────────────────────

/// Everything loaded at startup, guarded behind a Mutex in Tauri state.
struct Loaded {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
    lat_idx: usize,
    lon_idx: usize,
    gec_idx: Option<usize>,
    dbh_idx: [Option<usize>; N_DBH],
    rf_rc: RandomForest,
    rf_up: RandomForest,
    rf_mt: RandomForest,
    forest_mask: Option<ForestMask>,
}

#[derive(Default)]
struct AppState(Mutex<Option<Loaded>>);

// ---------------------------------------------------------------------------
// File resolution: look in several plausible locations so the app works both
// in `cargo tauri dev` and as a bundled app with resources.
// ---------------------------------------------------------------------------
fn candidate_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(p) = app.path().resource_dir() {
        dirs.push(p.join("data"));
        dirs.push(p);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            dirs.push(d.join("data"));
            dirs.push(d.to_path_buf());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join("data"));
        dirs.push(cwd.join("src-tauri").join("data"));
        dirs.push(cwd.clone());
    }
    dirs
}

fn find_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    for d in candidate_dirs(app) {
        let p = d.join(name);
        if p.is_file() {
            return Ok(p);
        }
    }
    Err(format!(
        "Could not find '{}'. Place it in src-tauri/data/ (or next to the app).",
        name
    ))
}

fn col_index(headers: &[String], wanted: &str) -> Option<usize> {
    headers
        .iter()
        .position(|h| h.trim().eq_ignore_ascii_case(wanted))
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct InitInfo {
    plots: usize,
    columns: Vec<String>,
    vars_recruitment: Vec<String>,
    vars_upgrowth: Vec<String>,
    vars_mortality: Vec<String>,
}

#[tauri::command]
fn init_data(app: AppHandle, state: State<AppState>) -> Result<InitInfo, String> {
    let csv_path = find_file(&app, "perudata.csv")?;
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(&csv_path)
        .map_err(|e| format!("Cannot open perudata.csv: {}", e))?;

    let headers: Vec<String> = rdr
        .headers()
        .map_err(|e| format!("Cannot read CSV header: {}", e))?
        .iter()
        .map(|s| s.to_string())
        .collect();

    let rows: Vec<Vec<String>> = rdr
        .records()
        .filter_map(|r| r.ok())
        .map(|r| r.iter().map(|s| s.to_string()).collect())
        .collect();

    let lat_idx = ["LAT", "Latitude", "lat", "Y", "y_coord", "decimalLatitude"]
        .iter()
        .find_map(|w| col_index(&headers, w))
        .ok_or_else(|| {
            format!(
                "perudata.csv has no latitude column (looked for LAT/Latitude/lat/Y). \
                 Columns present: {}",
                headers.join(", ")
            )
        })?;
    let lon_idx = ["LON", "Longitude", "lon", "lng", "X", "x_coord", "decimalLongitude"]
        .iter()
        .find_map(|w| col_index(&headers, w))
        .ok_or_else(|| {
            format!(
                "perudata.csv has no longitude column (looked for LON/Longitude/lon/lng/X). \
                 Columns present: {}",
                headers.join(", ")
            )
        })?;
    let gec_idx = col_index(&headers, "GEC");

    let mut dbh_idx: [Option<usize>; N_DBH] = Default::default();
    for i in 0..N_DBH {
        dbh_idx[i] = col_index(&headers, &format!("DBH{}", i + 1));
    }

    let rf_rc = RandomForest::from_json_file(&find_file(&app, "model_recruitment.json")?)?;
    let rf_up = RandomForest::from_json_file(&find_file(&app, "model_upgrowth.json")?)?;
    let rf_mt = RandomForest::from_json_file(&find_file(&app, "model_mortality.json")?)?;

    let forest_mask = match find_file(&app, "forest_mask.tif") {
        Ok(p) => match ForestMask::load(&p) {
            Ok(m)  => { Some(m) }
            Err(e) => { println!("[forest_mask] load ERROR: {}", e); None }
        },
        Err(_) => { println!("[forest_mask] file not found — mask disabled"); None }
    };

    let info = InitInfo {
        plots: rows.len(),
        columns: headers.clone(),
        vars_recruitment: rf_rc.var_names.clone(),
        vars_upgrowth: rf_up.var_names.clone(),
        vars_mortality: rf_mt.var_names.clone(),
    };

    *state.0.lock().unwrap() = Some(Loaded {
        headers,
        rows,
        lat_idx,
        lon_idx,
        gec_idx,
        dbh_idx,
        rf_rc,
        rf_up,
        rf_mt,
        forest_mask,
    });

    Ok(info)
}

fn parse_f64(s: &str) -> Option<f64> {
    let t = s.trim();
    if t.is_empty() || t.eq_ignore_ascii_case("NA") {
        return None;
    }
    // R logical columns (e.g. the GEZ_labelSA_* one-hot dummies) are written as
    // TRUE/FALSE by write.csv; the models trained on them as numeric 1/0.
    if t.eq_ignore_ascii_case("TRUE") || t.eq_ignore_ascii_case("T") {
        return Some(1.0);
    }
    if t.eq_ignore_ascii_case("FALSE") || t.eq_ignore_ascii_case("F") {
        return Some(0.0);
    }
    t.parse::<f64>().ok()
}

/// Find the index of the row whose (LAT, LON) is closest (Euclidean) to the
/// query point. Mirrors `which.min` (first minimum wins).
fn nearest_row(d: &Loaded, lat: f64, lon: f64) -> Option<(usize, f64)> {
    let mut best: Option<(usize, f64)> = None;
    for (i, row) in d.rows.iter().enumerate() {
        let rlat = row.get(d.lat_idx).and_then(|s| parse_f64(s));
        let rlon = row.get(d.lon_idx).and_then(|s| parse_f64(s));
        if let (Some(rlat), Some(rlon)) = (rlat, rlon) {
            let dist2 = (rlat - lat).powi(2) + (rlon - lon).powi(2);
            match best {
                Some((_, b)) if dist2 >= b => {}
                _ => best = Some((i, dist2)),
            }
        }
    }
    best
}

/// Build the numeric covariate map for a matched row (column name -> value),
/// keeping the original header casing so model var_names match exactly.
fn cov_map(d: &Loaded, row_idx: usize) -> HashMap<String, f64> {
    let mut m = HashMap::new();
    let row = &d.rows[row_idx];
    for (j, h) in d.headers.iter().enumerate() {
        if let Some(v) = row.get(j).and_then(|s| parse_f64(s)) {
            m.insert(h.clone(), v);
        }
    }
    m
}

#[derive(Serialize)]
struct NearestInfo {
    found: bool,
    dist_km: f64,
    gec: String,
    dbh: Vec<f64>,                  // DBH1..DBH13 (0.0 where missing)
    matched_headers: Vec<String>,  // full matched row, for "Get Input Data"
    matched_values: Vec<String>,
}

#[tauri::command]
fn find_nearest(state: State<AppState>, lat: f64, lon: f64) -> Result<NearestInfo, String> {
    let guard = state.0.lock().unwrap();
    let d = guard.as_ref().ok_or("Data not loaded yet")?;

    let (idx, dist2) = nearest_row(d, lat, lon).ok_or("No valid LAT/LON rows in perudata.csv")?;
    let row = &d.rows[idx];

    let gec = d
        .gec_idx
        .and_then(|gi| row.get(gi).cloned())
        .unwrap_or_default();

    let mut dbh = vec![0.0; N_DBH];
    for i in 0..N_DBH {
        if let Some(ci) = d.dbh_idx[i] {
            if let Some(v) = row.get(ci).and_then(|s| parse_f64(s)) {
                dbh[i] = (v * 10000.0).round() / 10000.0; // round to 4 dp
            }
        }
    }

    Ok(NearestInfo {
        found: true,
        dist_km: (dist2.sqrt() * 111.0 * 100.0).round() / 100.0,
        gec,
        dbh,
        matched_headers: d.headers.clone(),
        matched_values: row.clone(),
    })
}

#[derive(serde::Deserialize)]
struct SimParams {
    lat: f64,
    lon: f64,
    init_v: Vec<f64>,
    tgt_v: Vec<f64>,
    sim_length: usize,
    first_harvest: usize,
    cutting_cycle: usize,
}

#[tauri::command]
fn run_sim(state: State<AppState>, params: SimParams) -> Result<SimResult, String> {
    let guard = state.0.lock().unwrap();
    let d = guard.as_ref().ok_or("Data not loaded yet")?;

    let (idx, _) =
        nearest_row(d, params.lat, params.lon).ok_or("No valid LAT/LON rows in perudata.csv")?;
    let cov = cov_map(d, idx);

    let gec = d
        .gec_idx
        .and_then(|gi| d.rows[idx].get(gi).cloned())
        .ok_or("Matched plot has no GEC value")?;

    run_simulation(
        &cov,
        &gec,
        &params.init_v,
        &params.tgt_v,
        params.sim_length,
        params.first_harvest,
        params.cutting_cycle,
        &d.rf_rc,
        &d.rf_up,
        &d.rf_mt,
    )
}

/// Returns true if (lat, lon) falls on a forest pixel, false otherwise.
/// Fails open: returns true when no mask is loaded so the app works without the file.
#[tauri::command]
fn check_forest(state: State<AppState>, lat: f64, lon: f64) -> bool {
    let guard = state.0.lock().unwrap();
    match guard.as_ref().and_then(|d| d.forest_mask.as_ref()) {
        Some(mask) => {
            let result = mask.is_forest(lat, lon);
            println!("[check_forest] ({:.4}, {:.4}) → pixel={} forest={}", lat, lon,
                {
                    let col = ((lon - mask.origin_lon) / mask.scale_x).floor() as i64;
                    let row = ((mask.origin_lat - lat) / mask.scale_y).floor() as i64;
                    let idx = row as usize * mask.width as usize + col as usize;
                    mask.data.get(idx).copied().unwrap_or(255)
                },
                result);
            result
        }
        None => { println!("[check_forest] no mask loaded → true"); true }
    }
}

/// Open a native "Save As" dialog and write `contents` to the chosen path.
/// Returns the saved path, or an empty string if the user cancelled.
#[tauri::command]
fn save_text_file(app: AppHandle, default_name: String, contents: String) -> Result<String, String> {
    let file = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();

    match file {
        Some(fp) => {
            // FilePath -> PathBuf (desktop save dialogs yield a Path variant).
            let path = fp
                .into_path()
                .map_err(|e| format!("Invalid save path: {}", e))?;
            std::fs::write(&path, contents).map_err(|e| format!("Write failed: {}", e))?;
            Ok(path.display().to_string())
        }
        None => Ok(String::new()), // cancelled
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            init_data,
            find_nearest,
            run_sim,
            save_text_file,
            check_forest
        ])
        .run(tauri::generate_context!())
        .expect("error while running MatrixPro Peru");
}
