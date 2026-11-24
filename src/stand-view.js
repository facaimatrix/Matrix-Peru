// ============================================================================
// Stand View — animated picture of the simulated stand.
// Uses stand-model.js (which trees exist when), assets/trees (PNG sprites) and
// gif-encoder.js. Text comes from the T table in app.js.
// Public API: StandView.load(simResult), StandView.clear(), StandView.relabel().
// ============================================================================
const StandView = (() => {
  // Text in the active language; entries that take arguments are functions.
  const tx = (key, ...args) => {
    const e = T[LANG][key];
    return typeof e === "function" ? e(...args) : e === undefined ? key : e;
  };
  // Panel colours (exports carry them too), from the app's dark theme.
  const C = { bg: "#112527", head: "#091214", band: "#004643", plot: "#0A1416", text: "#FAF4D3",
    soft: "rgba(250,244,211,0.78)", faint: "rgba(250,244,211,0.58)", gold: "#D1AC00", peach: "#F6BE9A",
    cut: "#E08F2E", tag: "rgba(9,18,20,0.78)" };
  const W = 1200, H = 640, SW = 862;          // logical canvas; scene width
  const ASSETS = "assets/trees/";
  const SNAG_YEARS = 4, STUMP_YEARS = 8;      // how long they stay visible
  // Ecozones the backend knows but that have no sprites of their own.
  const ZONE_FALLBACK = { SA_12: "SA_11", SA_21: "SA_16", SA_22: "SA_13", SA_23: "SA_13",
    SA_25: "SA_16", SA_31: "SA_16", SA_33: "SA_13", SA_35: "SA_16" };
  const LOOK = {
    SA_11: { sky: ["#9cc4dc", "#e6f0ec"], haze: "#cfe0dc", hill: "#8fb3a4", out: ["#8ea98b", "#59774f"], ground: "#6d7a4c", litter: ["#5a5a34", "#7d8a55", "#48562f"] },
    SA_13: { sky: ["#8fc0e0", "#f4ecd8"], haze: "#e9e2cc", hill: "#c2b48c", out: ["#cabb8e", "#a8935f"], ground: "#b59c68", litter: ["#96804f", "#cbb684", "#8c8550"] },
    SA_16: { sky: ["#a9bfcc", "#e9eef0"], haze: "#d5dfe2", hill: "#8ea5aa", out: ["#93a793", "#5c7459"], ground: "#66754f", litter: ["#4f5a38", "#7d8c62", "#42522f"] },
  };
  const CLASS_COL = ["#d7f0b5", "#bfe6a2", "#a4da92", "#88cd86", "#6bbf7e", "#52b07a", "#42a37a",
    "#389474", "#2f866f", "#d1ac00", "#e08f2e", "#dd6f3c", "#d14f45"];

  let manifest = null, manifestP = null;
  let sim = null, stand = null, zone = null, zoneKey = null, loadToken = 0;
  let clock = 0, playing = false, hold = 0, raf = 0, lastTs = 0, busy = false, loading = false, relabelLater = false;
  let dirty = true;
  const defaults = { areaHa: 1, seed: 1, view: "persp", speed: 2, loop: true, snags: true, stumps: true,
    az: 0.5, pitch: 0.21, zoom: 1, gifw: 1000, gifn: 120 };
  const opt = { ...defaults };
  const images = new Map(), derived = new Map();

  // ── Sprites ───────────────────────────────────────────────────────────────
  function getManifest() {
    return manifestP || (manifestP = fetch(ASSETS + "manifest.json").then(r => {
      if (!r.ok) throw new Error(tx("sv_err_manifest"));
      return r.json();
    }).catch(e => { manifestP = null; throw e; }));
  }
  function loadImage(file) {
    if (images.has(file)) return Promise.resolve();
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { images.set(file, im); res(); };
      im.onerror = () => rej(new Error(tx("sv_err_sprite", file)));
      im.src = ASSETS + file;
    });
  }
  // Half-size copies (smooth minification) tinted towards the horizon colour.
  function sprite(file, mip, fog) {
    const k = file + "|" + mip + "|" + fog;
    let c = derived.get(k);
    if (c) return c;
    const im = images.get(file), f = 1 << mip;
    c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(im.width / f)); c.height = Math.max(1, Math.ceil(im.height / f));
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(im, 0, 0, im.width / f, im.height / f);
    if (fog) {
      x.globalCompositeOperation = "source-atop";
      x.globalAlpha = fog * 0.11; x.fillStyle = LOOK[zoneKey].haze;
      x.fillRect(0, 0, c.width, c.height);
    }
    derived.set(k, c);
    return c;
  }
  let drawScale = 1;                          // output pixels per logical pixel
  // Draw a sprite with its stem base at (sx, sy); s = screen px per metre.
  function put(g, rec, sx, sy, s, o = {}) {
    const k = s / rec.ppm, q = k * drawScale, mip = q < 0.22 ? 2 : q < 0.5 ? 1 : 0, f = 1 << mip;
    const im = sprite(rec.file, mip, o.fog || 0);
    g.save();
    if (o.alpha !== undefined) g.globalAlpha = Math.max(0, o.alpha);
    g.translate(sx, sy);
    if (o.rot) g.rotate(o.rot);
    g.scale((o.flip ? -1 : 1) * k * f, (o.vs || 1) * k * f);
    g.drawImage(im, -rec.ax / f, -rec.ay / f);
    g.restore();
  }

  // ── State of every visible tree at time t ─────────────────────────────────
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
  // Within one year: growth, deaths and recruits first, then cutting.
  const GROW_END = 0.55;

  function visible(time) {
    const y0 = Math.floor(time), fr = time - y0, y1 = fr > 0 ? y0 + 1 : y0;
    const grow = ease(fr / GROW_END), fell = clamp01((fr - GROW_END) / (1 - GROW_END));
    const out = [];
    for (const tr of stand.trees) {
      if (tr.born > y1) continue;
      if (tr.end <= tr.born && tr.fate === "dead") continue;   // never a living year-end tree
      if (tr.end <= y0) {                                      // gone: snag or stump
        const age = time - tr.end;
        if (tr.fate === "dead" && opt.snags && age < SNAG_YEARS)
          out.push({ tr, kind: "snag", c: StandModel.classAt(tr, tr.end), alpha: 1 - 0.9 * age / SNAG_YEARS });
        else if (tr.fate === "cut" && opt.stumps && age < STUMP_YEARS)
          out.push({ tr, kind: "stump", c: StandModel.classAt(tr, tr.end), alpha: 1 - 0.9 * age / STUMP_YEARS });
        continue;
      }
      const c1 = StandModel.classAt(tr, y1), c0 = tr.born <= y0 ? StandModel.classAt(tr, y0) : c1;
      const h0 = tr.born <= y0 ? zone.classes[c0].height_m : 0;
      const size = (h0 + (zone.classes[c1].height_m - h0) * grow) / zone.classes[c1].height_m;
      const o = { tr, kind: "tree", c: c1, size, alpha: 1 };
      if (tr.end === y1 && fr > 0) {
        if (tr.fate === "dead") { o.dying = grow; } else { o.fell = fell; }
      }
      if (o.size > 0.01) out.push(o);
    }
    return out;
  }

  // ── Perspective scene ─────────────────────────────────────────────────────
  function camera() {
    const S = stand.side, f = 720, D = Math.max(S * 1.42, 98) / opt.zoom, hTop = zone.classes[12].height_m;
    const ca = Math.cos(opt.az), sa = Math.sin(opt.az), cp = Math.cos(opt.pitch), sp = Math.sin(opt.pitch);
    const h0 = hTop * 0.36, cx = SW / 2, cy = H * 0.54;
    return {
      horizon: cy - f * Math.tan(opt.pitch), vs: cp, sp,
      near: D - S * 0.7, far: D + S * 0.7,
      project(x, y, h = 0) {
        const X = x * ca - y * sa, Z = x * sa + y * ca;
        const dz = Z + D * cp, dh = h - (h0 + D * sp);
        const depth = dz * cp - dh * sp, up = dz * sp + dh * cp;
        return { x: cx + f * X / depth, y: cy - f * up / depth, d: depth, s: f / depth };
      },
    };
  }
  const path = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); };

  function backdrop(g, horizon) {
    const L = LOOK[zoneKey];
    let gr = g.createLinearGradient(0, 0, 0, Math.max(10, horizon));
    gr.addColorStop(0, L.sky[0]); gr.addColorStop(1, L.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, SW, H);
    // distant ridge (scenery only); it turns with the camera
    const amp = zoneKey === "SA_16" ? 90 : zoneKey === "SA_13" ? 26 : 12;
    for (let k = 0; k < 2; k++) {
      g.fillStyle = L.hill; g.globalAlpha = 0.32 + 0.3 * k;
      g.beginPath(); g.moveTo(0, horizon + 2);
      for (let x = 0; x <= SW; x += 6) {
        const u = x / 150 + opt.az * 5 + k * 9;
        const v = 0.5 + 0.25 * Math.sin(u) + 0.15 * Math.sin(u * 2.3 + 1) + 0.06 * Math.sin(u * 7) + 0.04 * Math.sin(u * 17);
        g.lineTo(x, horizon - amp * v * (1 - 0.4 * k) - 4);
      }
      g.lineTo(SW, horizon + 2); g.fill();
    }
    g.globalAlpha = 1;
    gr = g.createLinearGradient(0, horizon, 0, H);
    gr.addColorStop(0, L.haze); gr.addColorStop(0.18, L.out[0]); gr.addColorStop(1, L.out[1]);
    g.fillStyle = gr; g.fillRect(0, horizon, SW, H - horizon);
  }

  let litter = null;
  const scenery = { key: "", canvas: document.createElement("canvas") };
  function ground(g, cam) {
    const L = LOOK[zoneKey], h = stand.side / 2;
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
    path(g, corners.map(([x, y]) => cam.project(x, y))); g.closePath();
    g.fillStyle = L.ground; g.fill();
    if (!litter || litter.side !== stand.side) {
      const R = StandModel.rng(77);
      litter = { side: stand.side, p: Array.from({ length: 1400 }, () =>
        [(R() - 0.5) * stand.side, (R() - 0.5) * stand.side, Math.floor(R() * 3), 0.25 + R() * 0.7]) };
    }
    g.globalAlpha = 0.5;
    for (const [x, y, k, r] of litter.p) {
      const p = cam.project(x, y);
      g.fillStyle = L.litter[k];
      g.beginPath(); g.ellipse(p.x, p.y, r * p.s, Math.max(0.6, r * p.s * cam.sp * 1.2), 0, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1.5;
    path(g, corners.map(([x, y]) => cam.project(x, y))); g.closePath(); g.stroke();
  }
  // Corner range poles, banded every 10 m, for scale.
  function pole(g, cam, x, y) {
    for (let h = 0; h < 40; h += 10) {
      const a = cam.project(x, y, h), b = cam.project(x, y, h + 10);
      g.strokeStyle = (h / 10) % 2 ? "#c0392b" : "#ffffff"; g.lineWidth = Math.max(1.5, 0.28 * a.s);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  }

  function drawTree(g, o, sx, sy, s, vs, fog) {
    const tr = o.tr, cl = zone.classes[o.c], k = s * tr.vig;
    if (o.kind === "stump") {
      const st = manifest.stump, dia = manifest.dbh_cm[o.c] / 100;
      put(g, { ...st, ppm: st.stem_px / Math.max(dia, 0.3) }, sx, sy, s, { alpha: o.alpha, fog });
      return;
    }
    if (o.kind === "snag") {
      put(g, cl.snag, sx, sy, k, { alpha: o.alpha, flip: tr.flip, vs, fog });
      return;
    }
    const rec = cl.trees[tr.shape];
    if (o.dying !== undefined) {
      put(g, cl.snag, sx, sy, k, { alpha: o.dying, flip: tr.flip, vs, fog });
      put(g, rec, sx, sy, k * o.size, { alpha: 1 - o.dying, flip: tr.flip, vs, fog });
    } else if (o.fell > 0) {
      const drop = clamp01(o.fell / 0.75);
      if (opt.stumps) drawTree(g, { tr, kind: "stump", c: o.c, alpha: 1 }, sx, sy, s, vs, fog);
      put(g, rec, sx, sy, k * o.size, { alpha: 1 - clamp01((o.fell - 0.7) / 0.3), flip: tr.flip, vs, fog,
        rot: tr.fall * 1.5 * drop * drop });
    } else {
      put(g, rec, sx, sy, k * o.size, { flip: tr.flip, vs, fog });
    }
  }

  function drawPerspective(g, time) {
    const cam = camera(), h = stand.side / 2;
    // Sky and ground only change with the camera: keep them on their own layer.
    const k = g.getTransform().a, key = [opt.az, opt.pitch, opt.zoom, stand.side, zoneKey, k].join();
    if (scenery.key !== key) {
      const c = scenery.canvas;
      c.width = Math.ceil(SW * k); c.height = Math.ceil(H * k);
      const sg = c.getContext("2d");
      sg.setTransform(k, 0, 0, k, 0, 0);
      backdrop(sg, cam.horizon); ground(sg, cam);
      scenery.key = key;
    }
    g.drawImage(scenery.canvas, 0, 0, scenery.canvas.width / k, scenery.canvas.height / k);
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
    const items = visible(time).map(o => ({ o, p: cam.project(o.tr.x, o.tr.y) })).filter(i => i.p.d > 4);
    // shadows first so they never cover a stem
    g.fillStyle = "rgba(20,28,12,0.17)";
    for (const { o, p } of items) if (o.kind === "tree") {
      const r = zone.classes[o.c].crown_m / 2 * o.size * p.s * (1 - (o.fell || 0));
      g.beginPath(); g.ellipse(p.x + r * 0.3, p.y, r, r * (0.12 + cam.sp * 0.7), 0, 0, 7); g.fill();
    }
    for (const [x, y] of corners) items.push({ pole: [x, y], p: cam.project(x, y) });
    items.sort((a, b) => b.p.d - a.p.d);
    for (const i of items) {
      if (i.pole) { pole(g, cam, ...i.pole); continue; }
      const fog = Math.round(4 * clamp01((i.p.d - cam.near) / (cam.far - cam.near)));
      drawTree(g, i.o, i.p.x, i.p.y, i.p.s, cam.vs, fog);
    }
    caption(g, tx("sv_cap_persp", stand.side.toFixed(0)));
  }

  // ── Profile: side view of a strip through the plot ────────────────────────
  function drawProfile(g, time) {
    const base = H - 74, s = Math.min((SW - 90) / stand.side, (H - 150) / (zone.classes[12].height_m * 1.12));
    const x0 = SW / 2 - s * stand.side / 2, depth = stand.side / 5;
    backdrop(g, base - 40);
    g.fillStyle = LOOK[zoneKey].ground; g.fillRect(0, base - 12, SW, H);
    g.font = "11px Segoe UI, sans-serif"; g.lineWidth = 1;
    for (let h = 0; h <= zone.classes[12].height_m + 5; h += 5) {
      g.strokeStyle = "rgba(13,33,55,0.16)"; g.beginPath(); g.moveTo(x0 - 8, base - h * s); g.lineTo(x0 + s * stand.side + 8, base - h * s); g.stroke();
      g.fillStyle = "#0d2137"; g.textAlign = "right"; g.fillText(h + " m", x0 - 12, base - h * s + 4);
    }
    const items = visible(time).filter(o => Math.abs(o.tr.y) <= depth / 2).sort((a, b) => b.tr.y - a.tr.y);
    for (const o of items) {
      const z = (o.tr.y + depth / 2) / depth;                  // 1 = far side
      drawTree(g, o, x0 + (o.tr.x + stand.side / 2) * s, base - z * 12 + 6, s, 1, Math.round(3 * z));
    }
    caption(g, tx("sv_cap_profile", stand.side.toFixed(0), depth.toFixed(0)));
  }

  // ── Overhead: crowns from above ───────────────────────────────────────────
  function crowns(g, items, cx, cy, s, small) {
    items = items.slice().sort((a, b) => a.c - b.c);
    for (const o of items) {
      const x = cx + o.tr.x * s, y = cy - o.tr.y * s;
      if (o.kind !== "tree") {
        g.globalAlpha = o.alpha; g.fillStyle = o.kind === "stump" ? "#d98032" : "#8d8d8d";
        g.beginPath(); g.arc(x, y, small ? 1.3 : 3, 0, 7); g.fill(); g.globalAlpha = 1;
        continue;
      }
      const r = Math.max(1, zone.classes[o.c].crown_m / 2 * o.tr.vig * o.size * s);
      g.globalAlpha = 0.86 * (1 - (o.fell || 0)) * (1 - 0.8 * (o.dying || 0));
      if (small) g.fillStyle = CLASS_COL[o.c];
      else {
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        gr.addColorStop(0, CLASS_COL[o.c] + "99"); gr.addColorStop(0.7, CLASS_COL[o.c]); gr.addColorStop(1, CLASS_COL[o.c]);
        g.fillStyle = gr;
      }
      g.beginPath();
      if (small) g.arc(x, y, r, 0, 7);
      else for (let k = 0; k <= 20; k++) {
        const a = k / 20 * 2 * Math.PI, q = r * (1 + 0.07 * Math.sin(5 * a + o.tr.id) + 0.04 * Math.sin(9 * a + o.tr.id * 2));
        g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
      }
      g.fill();
      if (!small) {
        g.strokeStyle = "rgba(10,30,10,0.35)"; g.lineWidth = 0.8; g.stroke();
        g.fillStyle = "#3b2a18"; g.beginPath(); g.arc(x, y, Math.max(0.8, manifest.dbh_cm[o.c] / 200 * s), 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
  }
  function drawOverhead(g, time) {
    g.fillStyle = LOOK[zoneKey].out[0]; g.fillRect(0, 0, SW, H);
    const s = (H - 92) / stand.side, cx = SW / 2, cy = H / 2 - 12, half = stand.side * s / 2;
    g.fillStyle = LOOK[zoneKey].ground; g.fillRect(cx - half, cy - half, 2 * half, 2 * half);
    g.save(); g.beginPath(); g.rect(cx - half, cy - half, 2 * half, 2 * half); g.clip();
    crowns(g, visible(time), cx, cy, s, false);
    g.restore();
    g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.strokeRect(cx - half, cy - half, 2 * half, 2 * half);
    caption(g, tx("sv_cap_overhead"));
  }

  function caption(g, txt) {
    g.font = "12px Segoe UI, sans-serif"; g.textAlign = "left";
    const w = g.measureText(txt).width;
    g.fillStyle = C.tag; g.fillRect(10, H - 32, w + 16, 22);
    g.fillStyle = C.text; g.fillText(txt, 18, H - 17);
  }

  // ── Information panel (part of the picture, so exports carry it) ──────────
  const total = (m, y) => m[y].reduce((a, b) => a + b, 0);
  let series = null;
  function drawPanel(g, time) {
    const y0 = Math.floor(time), y = time - y0 > GROW_END ? y0 + 1 : y0, x = SW + 18, w = W - SW - 36;
    const cutYear = sim.harvest_years.includes(y) && total(sim.harv_mat, y) > 0;
    g.fillStyle = C.bg; g.fillRect(SW, 0, W - SW, H);
    g.fillStyle = C.head; g.fillRect(SW, 0, W - SW, 66);
    g.fillStyle = C.gold; g.fillRect(SW, 0, W - SW, 2);
    g.textAlign = "left"; g.fillStyle = C.text; g.font = "700 30px Segoe UI, sans-serif";
    g.fillText(tx("sv_year", y), x, 44);
    g.font = "12px Segoe UI, sans-serif"; g.fillStyle = C.peach; g.textAlign = "right";
    g.fillText(tx("sv_of", sim.sim_l), x + w, 28); g.fillText(sim.gec, x + w, 46);
    g.textAlign = "left";
    g.fillStyle = cutYear ? C.cut : C.band; g.fillRect(SW, 66, W - SW, 24);
    g.font = "600 12px Segoe UI, sans-serif"; g.fillStyle = cutYear ? C.head : C.text;
    g.fillText(cutYear ? tx("sv_harvest", total(sim.harv_mat, y).toFixed(1)) : zoneLabel(), x, 82);

    const died = sim.mort_mat ? total(sim.mort_mat, y) : null, rec = sim.rec_vec ? sim.rec_vec[y] : null;
    const rows = [[tx("sv_trees"), total(sim.tph_mat, y).toFixed(1), "/ha"], [tx("sv_ba"), total(sim.ba_mat, y).toFixed(2), "m²/ha"],
      [tx("sv_agb"), total(sim.agb_mat, y).toFixed(1), "Mg/ha"],
      [tx("sv_recruited"), rec === null ? "–" : rec.toFixed(1), "/ha"], [tx("sv_died"), died === null ? "–" : died.toFixed(1), "/ha"]];
    rows.forEach((r, i) => {
      const yy = 110 + i * 19;
      g.font = "12px Segoe UI, sans-serif"; g.fillStyle = C.soft; g.textAlign = "left"; g.fillText(r[0], x, yy);
      g.font = "700 13px Segoe UI, sans-serif"; g.fillStyle = C.text; g.textAlign = "right"; g.fillText(r[1], x + w - 42, yy);
      g.font = "11px Segoe UI, sans-serif"; g.fillStyle = C.faint; g.textAlign = "left"; g.fillText(r[2], x + w - 38, yy);
    });

    // diameter distribution
    let by = 216;
    g.font = "600 12px Segoe UI, sans-serif"; g.fillStyle = C.gold; g.fillText(tx("sv_dist"), x, by);
    g.font = "10px Segoe UI, sans-serif"; g.fillStyle = C.faint; g.textAlign = "right"; g.fillText(tx("sv_sqrt"), x + w, by); g.textAlign = "left";
    by += 8;
    const maxV = Math.sqrt(series.maxClass), bx = x + 42, bw = w - 42 - 44;
    for (let c = 0; c < 13; c++) {
      const v = sim.tph_mat[y][c], yy = by + c * 16, hh = 12;
      g.font = "11px Segoe UI, sans-serif"; g.fillStyle = C.soft; g.textAlign = "right";
      g.fillText(sim.dbh_classes[c].replace(">=", "≥"), bx - 6, yy + 10);
      g.fillStyle = CLASS_COL[c]; g.fillRect(bx, yy, bw * Math.sqrt(v) / maxV, hh);
      const hv = sim.harv_mat[y][c];
      if (hv > 0) {                                           // cut this year, stacked
        const a = bw * Math.sqrt(v) / maxV, b = bw * Math.sqrt(v + hv) / maxV;
        g.fillStyle = "rgba(224,143,46,0.6)"; g.fillRect(bx + a, yy, Math.max(1, b - a), hh);
      }
      if (sim.harvest_years.length) {                          // harvest target
        const tx0 = bx + bw * Math.min(1.02, Math.sqrt(sim.tgt_v[c]) / maxV);
        g.fillStyle = C.bg; g.fillRect(tx0 - 2, yy - 1, 4, hh + 2);
        g.fillStyle = "#ffffff"; g.fillRect(tx0 - 1, yy - 1, 2, hh + 2);
      }
      g.fillStyle = C.text; g.textAlign = "left"; g.fillText(v >= 10 ? v.toFixed(0) : v.toFixed(1), x + w - 38, yy + 10);
    }
    if (sim.harvest_years.length) {
      g.font = "10px Segoe UI, sans-serif"; g.fillStyle = C.faint; g.textAlign = "left";
      g.fillText(tx("sv_legend"), x, by + 13 * 16 + 10);
    }

    // overhead mini-map + basal-area trace
    const my = 468, ms = 140;
    g.font = "600 12px Segoe UI, sans-serif"; g.fillStyle = C.gold; g.textAlign = "left";
    g.fillText(tx("sv_map"), x, my - 8); g.fillText(tx("sv_trace"), x + ms + 20, my - 8);
    g.fillStyle = LOOK[zoneKey].ground; g.fillRect(x, my, ms, ms);
    g.save(); g.beginPath(); g.rect(x, my, ms, ms); g.clip();
    crowns(g, visible(time), x + ms / 2, my + ms / 2, ms / stand.side, true);
    g.restore();
    const gx = x + ms + 20, gw = w - ms - 20, L = Math.max(1, sim.sim_l);
    const px = (yr) => gx + gw * yr / L, py = (v) => my + ms - ms * v / (series.maxBa * 1.08);
    g.fillStyle = C.plot; g.fillRect(gx, my, gw, ms);
    g.fillStyle = "rgba(246,190,154,0.4)";
    for (const hy of sim.harvest_years) g.fillRect(px(hy) - 0.5, my, 1, ms);
    g.strokeStyle = C.peach; g.lineWidth = 1.8; g.beginPath();
    series.ba.forEach((v, i) => i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))); g.stroke();
    g.fillStyle = C.text; g.fillRect(px(y) - 0.75, my, 1.5, ms);
    g.beginPath(); g.arc(px(y), py(series.ba[y]), 3.5, 0, 7); g.fill();
    g.font = "10px Segoe UI, sans-serif"; g.fillStyle = C.faint; g.textAlign = "right";
    g.fillText(series.maxBa.toFixed(0), gx + gw - 3, my + 10); g.fillText("0", gx + gw - 3, my + ms - 3);
    g.textAlign = "left";
    g.fillText(tx("sv_illustrative"), x, H - 10);
  }
  function zoneLabel() {
    return (tx("sv_zones")[zoneKey] || zone.name) + (zoneKey === sim.gec ? "" : tx("sv_sprites_for", zoneKey));
  }

  function draw(g, time, k) {
    drawScale = k;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.globalAlpha = 1;
    g.save(); g.beginPath(); g.rect(0, 0, SW, H); g.clip();
    ({ persp: drawPerspective, profile: drawProfile, overhead: drawOverhead })[opt.view](g, time);
    g.restore();
    drawPanel(g, time);
  }

  // Keep one canvas pixel per screen pixel at any window size or display
  // scaling, so text and trees are drawn sharp instead of being stretched.
  const MAX_W = 3000;
  function fitCanvas(cv) {
    const border = cv.offsetWidth - cv.clientWidth;
    const css = cv.getBoundingClientRect().width - border;
    if (cv.width !== W && css < 1) return;      // tab hidden: keep what we have
    const px = css < 1 ? W : Math.max(300, Math.min(MAX_W, Math.round(css * (window.devicePixelRatio || 1))));
    if (cv.width === px) return;
    cv.width = px; cv.height = Math.round(px * H / W);
    dirty = true;
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  function message(html) { $("sub-stand").innerHTML = html; }

  function buildUi() {
    const sel = (id, label, opts, val) => `<label class="sv-opt">${label}<select id="${id}">` +
      opts.map(([v, n]) => `<option value="${v}"${String(v) === String(val) ? " selected" : ""}>${n}</option>`).join("") + `</select></label>`;
    const chk = (id, label, on) => `<label class="sv-chk"><input type="checkbox" id="${id}" ${on ? "checked" : ""}> ${label}</label>`;
    message(`
    <div class="card card-accent-green">
      <div class="sec-hdr"><span class="hdr-icon">🎬</span> ${tx("sv_title")}
        <span class="sv-actions">
          <button class="btn-dl" id="sv_png">${tx("sv_png")}</button>
          <button class="btn-dl" id="sv_gif">${tx("sv_gif")}</button></span></div>
      <canvas id="sv_canvas" tabindex="0" aria-label="${tx("sv_aria")}"></canvas>
      <div class="sv-bar">
        <button id="sv_first" title="${tx("sv_first")}">⏮</button>
        <button id="sv_prev" title="${tx("sv_prev")}">◀</button>
        <button id="sv_play" class="sv-play" title="${tx("sv_play_tip")}">${tx(playing ? "sv_pause" : "sv_play")}</button>
        <button id="sv_next" title="${tx("sv_next")}">▶</button>
        <input type="range" id="sv_year" min="0" max="${sim.sim_l}" step="1" value="${Math.floor(clock)}" aria-label="${tx("chart_year")}">
        <span id="sv_lbl">${tx("sv_year", Math.floor(clock))}</span>
      </div>
      <div class="sv-bar">
        ${sel("sv_view", tx("sv_view"), [["persp", tx("sv_persp")], ["profile", tx("sv_profile")], ["overhead", tx("sv_overhead")]], opt.view)}
        ${sel("sv_area", tx("sv_plot"), [[1, "1 ha (100 × 100 m)"], [0.25, "¼ ha (50 × 50 m)"]], opt.areaHa)}
        ${sel("sv_speed", tx("sv_speed"), [0.5, 1, 2, 5, 10].map(s => [s, tx("sv_rate", s)]), opt.speed)}
        ${sel("sv_gifw", tx("sv_gifw"), [800, 1000, 1200].map(n => [n, n + " px"]), opt.gifw)}
        ${sel("sv_gifn", tx("sv_gifn"), [[60, tx("sv_upto", 60)], [120, tx("sv_upto", 120)], [600, tx("sv_every")]], opt.gifn)}
        ${chk("sv_loop", tx("sv_loop"), opt.loop)}
        ${chk("sv_snags", tx("sv_snags"), opt.snags)}
        ${chk("sv_stumps", tx("sv_stumps"), opt.stumps)}
        <button id="sv_seed" title="${tx("sv_layout_tip")}">${tx("sv_layout")}</button>
        <button id="sv_cam">${tx("sv_reset")}</button>
      </div>
      <div id="sv_status" class="sv-status"></div>
      <div class="sv-note">${tx("sv_note")}</div>
    </div>`);

    const cv = $("sv_canvas");
    fitCanvas(cv);

    $("sv_play").onclick = () => setPlaying(!playing);
    $("sv_first").onclick = () => seek(0);
    $("sv_prev").onclick = () => seek(Math.ceil(clock) - 1);
    $("sv_next").onclick = () => seek(Math.floor(clock) + 1);
    $("sv_year").oninput = (e) => seek(+e.target.value);
    const on = (id, key, conv, rebuildToo) => $(id).addEventListener("change", (e) => {
      opt[key] = conv(e.target); if (rebuildToo) rebuild(); dirty = true;
    });
    on("sv_view", "view", e => e.value); on("sv_area", "areaHa", e => +e.value, true); on("sv_speed", "speed", e => +e.value);
    on("sv_gifw", "gifw", e => +e.value); on("sv_gifn", "gifn", e => +e.value);
    on("sv_loop", "loop", e => e.checked); on("sv_snags", "snags", e => e.checked); on("sv_stumps", "stumps", e => e.checked);
    $("sv_seed").onclick = () => { opt.seed = 1 + Math.floor(Math.random() * 1e9); rebuild(); };
    $("sv_cam").onclick = () => { opt.az = defaults.az; opt.pitch = defaults.pitch; opt.zoom = 1; dirty = true; };
    $("sv_png").onclick = exportPng;
    $("sv_gif").onclick = exportGif;

    let drag = null;
    cv.onpointerdown = (e) => { if (opt.view !== "persp" || busy) return; drag = [e.clientX, e.clientY, opt.az, opt.pitch]; cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = (e) => {
      if (!drag) return;
      opt.az = drag[2] + (e.clientX - drag[0]) * 0.006;
      opt.pitch = Math.max(0.06, Math.min(0.75, drag[3] + (e.clientY - drag[1]) * 0.004));
      dirty = true;
    };
    cv.onpointerup = cv.onpointercancel = () => { drag = null; };
    cv.addEventListener("wheel", (e) => {
      if (opt.view !== "persp" || busy) return;
      e.preventDefault();
      opt.zoom = Math.max(0.7, Math.min(1.5, opt.zoom * Math.exp(-e.deltaY * 0.0012))); dirty = true;
    }, { passive: false });
    cv.onkeydown = (e) => {
      if (e.key === " ") { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seek(Math.floor(clock) + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); seek(Math.ceil(clock) - 1); }
    };
  }
  function status(s) { const el = $("sv_status"); if (el) el.textContent = s; }
  function setPlaying(p) {
    if (busy) return;
    if (p && clock >= sim.sim_l) clock = 0;
    playing = p; hold = 0; dirty = true;
    const b = $("sv_play"); if (b) b.textContent = tx(p ? "sv_pause" : "sv_play");
  }
  function seek(y) { if (busy) return; setPlaying(false); clock = Math.max(0, Math.min(sim.sim_l, y)); dirty = true; }
  function rebuild() {
    stand = StandModel.buildStand(sim, { areaHa: opt.areaHa, seed: opt.seed, crown: zone.classes.map(c => c.crown_m) });
    dirty = true;
  }

  function tick(ts) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
    const cv = $("sv_canvas");
    if (!cv || !stand || busy || cv.offsetParent === null) return;   // hidden tab: idle
    if (playing) {
      dirty = true;
      if (hold > 0) { hold -= dt; if (hold <= 0) { if (opt.loop) clock = 0; else setPlaying(false); } }
      else if (sim.sim_l > 0) {
        clock += dt * opt.speed;
        if (clock >= sim.sim_l) { clock = sim.sim_l; hold = 1.5; }
      }
    }
    fitCanvas(cv);
    if (!dirty) return;
    dirty = false;
    draw(cv.getContext("2d"), clock, cv.width / W);
    $("sv_year").value = Math.floor(clock);
    $("sv_lbl").textContent = tx("sv_year", Math.floor(clock));
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function saveBinary(name, bytes, mime) {
    let path;
    try {
      let s = "";
      for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      path = await window.__TAURI__.core.invoke("save_binary_file", { defaultName: name, dataBase64: btoa(s) });
    } catch (e) {                              // same fallback as the CSV export
      console.warn("Native save failed, using browser download:", e);
      const a = document.createElement("a"), url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return "Downloads/" + name;
    }
    return path;
  }
  const mb = (n) => (n / 1048576).toFixed(1) + " MB";

  async function exportPng() {
    if (busy) return;
    const c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2;
    draw(c.getContext("2d"), clock, 2);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const p = await saveBinary(`${tx("sv_file_png")}${Math.floor(clock)}_${stamp()}.png`, new Uint8Array(await blob.arrayBuffer()), "image/png");
    status(p ? tx("sv_saved", p) : tx("sv_cancelled"));
  }

  // Years to put in the GIF: evenly spaced, plus first, last and every harvest.
  function gifYears(maxFrames) {
    const L = sim.sim_l, step = Math.max(1, Math.ceil(L / maxFrames)), set = new Set([0, L]);
    for (let y = 0; y <= L; y += step) set.add(y);
    for (const y of sim.harvest_years) set.add(y);
    return [...set].sort((a, b) => a - b);
  }

  async function makeGif(width, maxFrames, onProgress) {
    const k = width / W, w = width, h = Math.round(H * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    const grab = (y) => { draw(g, y, k); return g.getImageData(0, 0, w, h).data; };
    const years = gifYears(maxFrames), pick = new Set([0, years.length - 1]);
    for (let i = 1; i < 6; i++) pick.add(Math.floor(i * years.length / 6));
    const firstCut = years.findIndex(y => sim.harvest_years.includes(y));
    if (firstCut >= 0) pick.add(firstCut);
    const enc = GifEncoder(w, h, GifEncoder.palette([...pick].map(i => grab(years[i]))));
    for (let i = 0; i < years.length; i++) {
      const y = years[i], gap = i + 1 < years.length ? years[i + 1] - y : 0;
      let delay = gap ? Math.min(1500, Math.max(60, 1000 * gap / opt.speed)) : 2500;
      if (sim.harvest_years.includes(y)) delay = Math.min(2500, delay * 1.6);
      enc.add(grab(y), delay);
      if (onProgress) onProgress(i + 1, years.length);
      await new Promise(r => setTimeout(r));   // keep the window responsive
    }
    return { bytes: enc.finish(), frames: years.length };
  }

  async function exportGif() {
    if (busy) return;
    setPlaying(false);
    busy = true;
    const btn = $("sv_gif"), controls = document.querySelectorAll("#sub-stand button, #sub-stand select, #sub-stand input");
    controls.forEach(e => { e.disabled = true; });
    const token = loadToken;
    try {
      const { bytes, frames } = await makeGif(opt.gifw, opt.gifn, (i, n) => {
        if (token !== loadToken) throw new Error(tx("sv_restarted"));
        btn.textContent = tx("sv_encoding", i, n);
      });
      status(tx("sv_ready", frames, mb(bytes.length)));
      const p = await saveBinary(`${tx("sv_file_gif")}_${stamp()}.gif`, bytes, "image/gif");
      status(p ? tx("sv_saved_gif", p, frames, mb(bytes.length)) : tx("sv_cancelled"));
    } catch (e) {
      status(tx("sv_failed", e.message || e));
    } finally {
      busy = false; dirty = true;
      btn.textContent = tx("sv_gif");
      controls.forEach(e => { e.disabled = false; });
      if (relabelLater) { const s = $("sv_status") ? $("sv_status").textContent : ""; relabel(); status(s); }
    }
  }

  // ── Public ────────────────────────────────────────────────────────────────
  async function load(result) {
    const token = ++loadToken;
    stand = null;
    playing = false; clock = 0; loading = true;
    relabel();
    try {
      const m = await getManifest();
      const key = m.zones[result.gec] ? result.gec : ZONE_FALLBACK[result.gec];
      if (!key) throw new Error(tx("sv_err_zone", result.gec));
      const z = m.zones[key];
      const files = z.classes.flatMap(c => [...c.trees.map(x => x.file), c.snag.file]).concat(m.stump.file);
      await Promise.all(files.map(loadImage));
      if (token !== loadToken) return;         // a newer run replaced this one
      if (zoneKey !== key) derived.clear();
      manifest = m; zone = z; zoneKey = key; sim = result;
      const ba = sim.ba_mat.map((_, y) => total(sim.ba_mat, y));
      series = { ba, maxBa: Math.max(0.1, ...ba), maxClass: Math.max(1, ...sim.tph_mat.flat(), ...sim.init_v) };
      loading = false;
      rebuild(); buildUi();
      if (!raf) raf = requestAnimationFrame(tick);
    } catch (e) {
      if (token !== loadToken) return;
      loading = false;
      message(`<div class="card" style="border-left:3px solid #f87171;">
        <div class="sec-hdr" style="color:#f87171;">⚠ ${tx("sv_title")}</div><div class="sim-error-box">${e.message || e}</div></div>`);
    }
  }
  function clear() {
    loadToken++; playing = false; stand = null; loading = false;
    relabel();
  }
  // Redo all text in the active language, keeping year, view and settings.
  function relabel() {
    if (busy && stand) { relabelLater = true; return; }        // after the export
    relabelLater = false;
    if (loading || !stand) message(`<div class="out-empty"><p>${tx(loading ? "sv_loading" : "sv_empty")}</p></div>`);
    else { buildUi(); dirty = true; }
  }
  return { load, clear, relabel, makeGif,
    debug: () => ({ stand, zone, sim, opt, draw, set: (time, o) => { Object.assign(opt, o || {}); clock = time; dirty = true; } }) };
})();
