//! Matrix forest-growth model — faithful port of the simulation loop from the
//! original Shiny `server` function.

use crate::random_forest::RandomForest;
use serde::Serialize;
use std::collections::HashMap;
use std::f64::consts::PI;

pub const N_DBH: usize = 13;

/// DBH class labels (cm).
pub const DBH_CLASSES: [&str; N_DBH] = [
    "10-15", "15-20", "20-25", "25-30", "30-35", "35-40", "40-45", "45-50",
    "50-55", "55-60", "60-65", "65-70", ">=70",
];

/// DBH class midpoints used as the model `D` covariate and for basal area.
pub const DBH_VEC: [f64; N_DBH] = [
    12.93003, 17.28223, 22.25088, 27.31658, 32.29727, 37.24331, 42.30573,
    47.27999, 52.22731, 57.30927, 62.43174, 67.25792, 90.29815,
];

/// Above-ground biomass per tree (kg) by GEC (Global Ecological Code), from
/// AGB_by_GEZ_SA.csv. Used to convert trees/ha into Mg/ha.
pub fn agb_for_gec(gec: &str) -> Option<[f64; N_DBH]> {
    let v: [f64; N_DBH] = match gec {
        "SA_11" => [60.637, 119.044, 214.291, 345.299, 509.817, 710.282, 955.718, 1238.125, 1561.127, 1938.213, 2366.247, 2814.726, 5594.988],
        "SA_12" => [60.677, 119.040, 214.142, 344.921, 509.051, 708.948, 953.501, 1234.752, 1556.291, 1931.495, 2357.202, 2803.061, 5564.079],
        "SA_13" => [62.118, 121.803, 218.971, 352.493, 519.958, 723.799, 973.033, 1259.516, 1586.872, 1968.670, 2401.646, 2854.905, 5657.995],
        "SA_16" => [57.251, 112.436, 202.375, 326.146, 481.602, 670.497, 901.299, 1166.604, 1469.812, 1823.509, 2224.737, 2644.876, 5245.346],
        "SA_21" => [62.048, 121.689, 218.813, 352.292, 519.712, 723.501, 972.674, 1259.079, 1586.340, 1968.022, 2400.855, 2853.952, 5655.778],
        "SA_22" => [61.774, 121.155, 217.856, 350.755, 517.448, 720.354, 968.444, 1253.604, 1579.440, 1959.459, 2390.402, 2841.517, 5631.030],
        "SA_23" => [61.373, 120.370, 216.445, 348.483, 514.095, 715.686, 962.168, 1245.481, 1569.205, 1946.762, 2374.912, 2823.104, 5594.541],
        "SA_25" => [62.700, 122.972, 221.125, 356.018, 525.212, 731.161, 982.973, 1272.412, 1603.136, 1988.856, 2426.264, 2884.147, 5715.510],
        "SA_31" => [62.793, 123.153, 221.450, 356.541, 525.983, 732.235, 984.417, 1274.281, 1605.491, 1991.778, 2429.829, 2888.385, 5723.908],
        "SA_33" => [62.810, 123.187, 221.511, 356.640, 526.129, 732.439, 984.691, 1274.635, 1605.937, 1992.331, 2430.504, 2889.187, 5725.497],
        "SA_35" => [62.806, 123.180, 221.498, 356.618, 526.097, 732.394, 984.631, 1274.557, 1605.839, 1992.210, 2430.355, 2889.011, 5725.148],
        _ => return None,
    };
    Some(v)
}

/// Basal-area conversion factor per class: D^2 / 40000 * pi  (m^2 per tree).
fn ba_factor(i: usize) -> f64 {
    DBH_VEC[i] * DBH_VEC[i] / 40000.0 * PI
}

/// Stand-level covariates that change every year.
struct DynCov {
    n: f64,
    b: f64,
    s1: f64,
    s2: f64,
}

/// (N, basal area, Shannon S1, Simpson S2) for a trees/ha vector.
fn stand_metrics(pv: &[f64]) -> DynCov {
    let n: f64 = pv.iter().sum();
    let mut b = 0.0;
    for (i, &x) in pv.iter().enumerate() {
        b += x * ba_factor(i);
    }
    let denom = n.max(1e-9);
    let mut s1 = 0.0;
    let mut s2 = 0.0;
    for &x in pv {
        let p = x / denom;
        let mut lp = p.ln();
        if !lp.is_finite() {
            lp = 0.0; // matches R: ln_v[!is.finite(ln_v)] <- 0  (before multiply)
        }
        s1 -= p * lp;
        s2 += p * p;
    }
    DynCov { n, b, s1, s2 }
}

/// Build the feature vector a model needs, in its own `var_names` order.
/// `D` is supplied per DBH class for the upgrowth/mortality models; the
/// recruitment model does not use `D`.
///
/// NOTE: the dynamic covariate names are exactly N, B, S1, S2 (as in the
/// original app). Every other required name is pulled from the matched
/// perudata row. If your models were trained with different names for those
/// four stand variables, edit the match arms below.
fn build_feats(
    rf: &RandomForest,
    dynv: &DynCov,
    d: Option<f64>,
    cov: &HashMap<String, f64>,
) -> Result<Vec<f64>, String> {
    rf.var_names
        .iter()
        .map(|name| match name.as_str() {
            "D" => d.ok_or_else(|| "Model requires 'D' but none was supplied".to_string()),
            "N" => Ok(dynv.n),
            "B" => Ok(dynv.b),
            "S1" => Ok(dynv.s1),
            "S2" => Ok(dynv.s2),
            other => cov.get(other).copied().ok_or_else(|| {
                format!(
                    "Covariate '{}' is required by a model but was not found (or not numeric) \
                     in the matched perudata row.",
                    other
                )
            }),
        })
        .collect()
}

/// Full simulation output. Matrices are [year][dbh_class], year = 0..=sim_l.
#[derive(Debug, Serialize)]
pub struct SimResult {
    pub tph_mat: Vec<Vec<f64>>,
    pub ba_mat: Vec<Vec<f64>>,
    pub agb_mat: Vec<Vec<f64>>,
    pub harv_mat: Vec<Vec<f64>>,
    pub s1_vec: Vec<f64>,
    pub s2_vec: Vec<f64>,
    pub init_v: Vec<f64>,
    pub tgt_v: Vec<f64>,
    pub gec: String,
    pub sim_l: usize,
    pub harvest_years: Vec<usize>,
    pub dbh_classes: Vec<String>,
}

#[allow(clippy::too_many_arguments)]
pub fn run_simulation(
    cov: &HashMap<String, f64>,
    gec: &str,
    init_v: &[f64],
    tgt_v: &[f64],
    sim_l: usize,
    first_harvest: usize,
    cutting_cycle: usize,
    rf_rc: &RandomForest,
    rf_up: &RandomForest,
    rf_mt: &RandomForest,
) -> Result<SimResult, String> {
    let biomass = agb_for_gec(gec).ok_or_else(|| {
        format!(
            "GEC '{}' not found. Available: SA_11, SA_12, SA_13, SA_16, SA_21, \
             SA_22, SA_23, SA_25, SA_31, SA_33, SA_35",
            gec
        )
    })?;

    let cc = cutting_cycle.max(1);
    let harvest_years: Vec<usize> = if first_harvest == 0 || sim_l == 0 {
        Vec::new()
    } else {
        (first_harvest..=sim_l).step_by(cc).collect()
    };
    let is_harvest = |m: usize| harvest_years.contains(&m);

    // Initial trees/ha vector: clamp negatives, guarantee non-empty stand.
    let mut plt: Vec<f64> = init_v.iter().map(|&x| if x < 0.0 { 0.0 } else { x }).collect();
    plt.resize(N_DBH, 0.0);
    if plt.iter().sum::<f64>() == 0.0 {
        plt[0] = 1.0;
    }
    let tgt: Vec<f64> = {
        let mut t = tgt_v.to_vec();
        t.resize(N_DBH, 0.0);
        t
    };

    let rows = sim_l + 1;
    let mut tph_mat = vec![vec![0.0; N_DBH]; rows];
    let mut ba_mat = vec![vec![0.0; N_DBH]; rows];
    let mut agb_mat = vec![vec![0.0; N_DBH]; rows];
    let mut harv_mat = vec![vec![0.0; N_DBH]; rows];
    let mut s1_vec = vec![0.0; rows];
    let mut s2_vec = vec![0.0; rows];

    // Save one year's snapshot (diversity computed from that year's vector).
    let save_year =
        |yr: usize,
         pv: &[f64],
         harv: &[f64],
         tph_mat: &mut Vec<Vec<f64>>,
         ba_mat: &mut Vec<Vec<f64>>,
         agb_mat: &mut Vec<Vec<f64>>,
         harv_mat: &mut Vec<Vec<f64>>,
         s1_vec: &mut Vec<f64>,
         s2_vec: &mut Vec<f64>| {
            for i in 0..N_DBH {
                tph_mat[yr][i] = pv[i];
                ba_mat[yr][i] = pv[i] * ba_factor(i);
                agb_mat[yr][i] = pv[i] * biomass[i] / 1000.0;
                harv_mat[yr][i] = harv[i];
            }
            let m = stand_metrics(pv);
            s1_vec[yr] = m.s1;
            s2_vec[yr] = m.s2;
        };

    let zero = vec![0.0; N_DBH];
    save_year(0, &plt, &zero, &mut tph_mat, &mut ba_mat, &mut agb_mat,
              &mut harv_mat, &mut s1_vec, &mut s2_vec);

    for m in 1..=sim_l {
        let dynv = stand_metrics(&plt);

        // Recruitment: single prediction (no D).
        let rc_feats = build_feats(rf_rc, &dynv, None, cov)?;
        let rc_p = rf_rc.predict_one(&rc_feats).max(0.0);

        // Upgrowth and mortality: one prediction per DBH class.
        let mut up_r = [0.0_f64; N_DBH];
        let mut mt_r = [0.0_f64; N_DBH];
        for i in 0..N_DBH {
            let d = Some(DBH_VEC[i]);
            let uf = build_feats(rf_up, &dynv, d, cov)?;
            up_r[i] = (rf_up.predict_one(&uf).max(0.0)) / 5.0; // 5-yr -> annual
            let mf = build_feats(rf_mt, &dynv, d, cov)?;
            mt_r[i] = rf_mt.predict_one(&mf).max(0.0);
        }
        up_r[N_DBH - 1] = 0.0; // no upgrowth out of the largest class

        // Transition: arriving = trees growing up from the class below.
        let mut new_v = vec![0.0; N_DBH];
        for i in 0..N_DBH {
            let arriving = if i == 0 { 0.0 } else { plt[i - 1] * up_r[i - 1] };
            new_v[i] = plt[i] * (1.0 - up_r[i] - mt_r[i]) + arriving;
        }
        new_v[0] += rc_p;
        for v in new_v.iter_mut() {
            if *v < 0.0 {
                *v = 0.0;
            }
        }
        if new_v.iter().sum::<f64>() == 0.0 {
            new_v[0] = 1.0;
        }

        // Harvest down to target on harvest years.
        let mut harv = vec![0.0; N_DBH];
        if is_harvest(m) {
            for i in 0..N_DBH {
                harv[i] = (new_v[i] - tgt[i]).max(0.0);
                new_v[i] -= harv[i];
                if new_v[i] < 0.0 {
                    new_v[i] = 0.0;
                }
            }
        }

        save_year(m, &new_v, &harv, &mut tph_mat, &mut ba_mat, &mut agb_mat,
                  &mut harv_mat, &mut s1_vec, &mut s2_vec);
        plt = new_v;
    }

    Ok(SimResult {
        tph_mat,
        ba_mat,
        agb_mat,
        harv_mat,
        s1_vec,
        s2_vec,
        init_v: {
            let mut v = init_v.to_vec();
            v.resize(N_DBH, 0.0);
            v
        },
        tgt_v: tgt,
        gec: gec.to_string(),
        sim_l,
        harvest_years,
        dbh_classes: DBH_CLASSES.iter().map(|s| s.to_string()).collect(),
    })
}
