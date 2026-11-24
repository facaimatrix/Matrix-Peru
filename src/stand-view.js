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

  let manifest = null, manifestP = null, genera = null;
  let sim = null, stand = null, zone = null, zoneKey = null, loadToken = 0;
  let clock = 0, playing = false, hold = 0, raf = 0, lastTs = 0, busy = false, loading = false, relabelLater = false;
  let dirty = true;
  const defaults = { areaHa: 1, seed: 1, view: "persp", speed: 2, loop: true, snags: true, stumps: true,
    az: 0.5, pitch: 0.21, zoom: 1, gifw: 1000, gifn: 120, vidw: 1920, shapes: "genus",
    compMode: "mix", comp: null, domGenus: null, domPct: 80, listText: "" };
  const opt = { ...defaults };
  const images = new Map(), derived = new Map();

  // ── Sprites ───────────────────────────────────────────────────────────────
  // manifest.json: the generic shapes. genus.json: genus shapes, the genus mix
  // and measured heights by zone; without it only generic shapes are offered.
  function getManifest() {
    return manifestP || (manifestP = Promise.all([
      fetch(ASSETS + "manifest.json").then(r => {
        if (!r.ok) throw new Error(tx("sv_err_manifest"));
        return r.json();
      }),
      fetch(ASSETS + "genus.json").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).catch(e => { manifestP = null; throw e; }));
  }
  const formName = (data, key, genus) => ((data.zone_form || {})[key] || {})[genus] || data.genus_form[genus];
  // Sprite, height (m) and vertical stretch for a tree in DBH class c.
  function lookOf(tr, c) {
    const zg = genera && genera.zones[zoneKey];
    if (zg && opt.shapes === "genus" && tr.genus && tr.genus !== "Other") {
      const f = genera.forms[formName(genera, zoneKey, tr.genus)];
      if (f) {
        const i = Math.min(c, f.cap), rec = f.sizes[i], h = f.height_m[zoneKey][i];
        return { rec, h, vy: h / rec.height_m, palm: f.palm };
      }
    }
    const rec = zone.classes[c].trees[tr.shape], vy = stretch(c);
    return { rec, h: rec.height_m * vy, vy };
  }
  // Generic sprites were drawn to assumed heights; stretch them to measured ones.
  function stretch(c) {
    const zg = genera && genera.zones[zoneKey];
    return zg ? zg.height_m[c] / zone.classes[c].height_m : 1;
  }
  const topHeight = () => zone.classes[12].height_m * stretch(12) * (genera ? 1.15 : 1);
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
      const look = lookOf(tr, c1), h1 = look.h;
      const h0 = tr.born <= y0 ? (c0 === c1 ? h1 : lookOf(tr, c0).h) : 0;
      const size = (h0 + (h1 - h0) * grow) / h1;
      const o = { tr, kind: "tree", c: c1, size, alpha: 1, look };
      if (tr.end === y1 && fr > 0) {
        if (tr.fate === "dead") { o.dying = grow; } else { o.fell = fell; }
      }
      if (o.size > 0.01) out.push(o);
    }
    return out;
  }

  // ── Perspective scene ─────────────────────────────────────────────────────
  function camera() {
    const S = stand.side, f = 720, D = Math.max(S * 1.42, 98) / opt.zoom, hTop = topHeight();
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
      put(g, cl.snag, sx, sy, k, { alpha: o.alpha, flip: tr.flip, vs: vs * stretch(o.c), fog });
      return;
    }
    const { rec, vy } = o.look;
    if (o.dying !== undefined) {
      put(g, cl.snag, sx, sy, k, { alpha: o.dying, flip: tr.flip, vs: vs * stretch(o.c), fog });
      put(g, rec, sx, sy, k * o.size, { alpha: 1 - o.dying, flip: tr.flip, vs: vs * vy, fog });
    } else if (o.fell > 0) {
      const drop = clamp01(o.fell / 0.75);
      if (opt.stumps) drawTree(g, { tr, kind: "stump", c: o.c, alpha: 1 }, sx, sy, s, vs, fog);
      put(g, rec, sx, sy, k * o.size, { alpha: 1 - clamp01((o.fell - 0.7) / 0.3), flip: tr.flip, vs: vs * vy, fog,
        rot: tr.fall * 1.5 * drop * drop });
    } else {
      put(g, rec, sx, sy, k * o.size, { flip: tr.flip, vs: vs * vy, fog });
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
      const r = o.look.rec.crown_m / 2 * o.size * p.s * (1 - (o.fell || 0));
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
    const base = H - 74, s = Math.min((SW - 90) / stand.side, (H - 150) / (topHeight() * 1.12));
    const x0 = SW / 2 - s * stand.side / 2, depth = stand.side / 5;
    backdrop(g, base - 40);
    g.fillStyle = LOOK[zoneKey].ground; g.fillRect(0, base - 12, SW, H);
    g.font = "11px Segoe UI, sans-serif"; g.lineWidth = 1;
    for (let h = 0; h <= topHeight() + 3; h += 5) {
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
      const r = Math.max(1, o.look.rec.crown_m / 2 * o.tr.vig * o.size * s);
      g.globalAlpha = 0.86 * (1 - (o.fell || 0)) * (1 - 0.8 * (o.dying || 0));
      if (small) g.fillStyle = CLASS_COL[o.c];
      else {
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        gr.addColorStop(0, CLASS_COL[o.c] + "99"); gr.addColorStop(0.7, CLASS_COL[o.c]); gr.addColorStop(1, CLASS_COL[o.c]);
        g.fillStyle = gr;
      }
      g.beginPath();
      if (small) g.arc(x, y, r, 0, 7);
      else for (let k = 0, n = o.look.palm ? 54 : 20; k <= n; k++) {
        const a = k / n * 2 * Math.PI, q = r * (o.look.palm ? 0.42 + 0.58 * Math.abs(Math.cos(4.5 * a + o.tr.id))
          : 1 + 0.07 * Math.sin(5 * a + o.tr.id) + 0.04 * Math.sin(9 * a + o.tr.id * 2));
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
    const comp = activeComp();
    if (comp) {                                                // set by the user: say so on exports too
      g.fillStyle = C.gold;
      let s = tx("sv_comp_tag", compText(comp));
      if (g.measureText(s).width > w) { while (g.measureText(s + "…").width > w) s = s.slice(0, -1); s += "…"; }
      g.fillText(s, x, H - 20);
      g.fillStyle = C.faint;
    }
    g.fillText(tx(comp ? "sv_illustrative_comp" : genera && genera.zones[zoneKey] ? "sv_illustrative_genus" : "sv_illustrative"), x, H - 7);
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

  // ── Species composition (picture only) ────────────────────────────────────
  // opt.comp is the composition in use, [{genus, pct}], or null for the ecozone
  // mix. It is replaced only by valid input.
  const activeComp = () => opt.shapes === "genus" && genera && genera.zones[zoneKey] ? opt.comp : null;
  const pctText = (v) => (+v.toFixed(1)).toLocaleString(LANG === "es" ? "es-PE" : "en-US") + "%";
  const compRest = (comp) => Math.max(0, 100 - comp.reduce((a, e) => a + e.pct, 0));
  function compText(comp) {
    const parts = [...comp].sort((a, b) => b.pct - a.pct).map(e => `${pctText(e.pct)} ${e.genus}`);
    if (compRest(comp) > 0.05) parts.push(`${pctText(compRest(comp))} ${tx("sv_comp_rest")}`);
    return parts.join(" + ");
  }
  const genusName = (s) => {
    const w = s.trim().split(/[\s_]+/)[0].replace(/[^\p{L}-]/gu, "").toLowerCase();
    return w && w[0].toUpperCase() + w.slice(1);
  };
  // "Eucalyptus 80", one per line or separated by ; or , — a species name counts
  // for its genus. Throws a message for the user.
  function parseList(text) {
    const sum = new Map();
    for (const part of text.split(/[\n;]+|,(?!\s*\d)/)) {
      if (!part.trim()) continue;
      const m = part.trim().match(/^(.*?)[\s:=|,]+(\d+(?:[.,]\d+)?)\s*%?$/), g = m && genusName(m[1]);
      if (!g) throw new Error(tx("sv_comp_bad", part.trim().slice(0, 40)));
      if (/^(otr[oa]s?|others?|rest[oe]?)$/i.test(g)) continue;   // the remainder
      sum.set(g, (sum.get(g) || 0) + parseFloat(m[2].replace(",", ".")));
    }
    const comp = [...sum].map(([genus, pct]) => ({ genus, pct })).filter(e => e.pct > 0);
    const tot = comp.reduce((a, e) => a + e.pct, 0);
    if (!comp.length) throw new Error(tx("sv_comp_none"));
    if (tot > 100.5) throw new Error(tx("sv_comp_over", pctText(tot)));
    if (tot > 100) comp.forEach(e => { e.pct *= 100 / tot; });      // rounding in the source
    return comp;
  }
  const compFiles = (gd, key, comp) => (comp || []).flatMap(e => {
    const f = gd.forms[formName(gd, key, e.genus)];
    return f ? f.sizes.map(x => x.file) : [];
  });
  let compToken = 0;
  async function applyComp() {
    const token = ++compToken, run = loadToken;
    try {
      let comp = null;
      if (opt.compMode === "dom") {
        const p = opt.domPct;
        if (!(p > 0 && p <= 100)) throw new Error(tx("sv_comp_pct"));
        comp = [{ genus: opt.domGenus, pct: p }];
      } else if (opt.compMode === "list") {
        if (!opt.listText.trim()) { compMessage(""); return; }       // nothing typed yet
        comp = parseList(opt.listText);
      }
      await Promise.all(compFiles(genera, zoneKey, comp).map(loadImage));
      if (token !== compToken || run !== loadToken) return;          // replaced meanwhile
      opt.comp = comp;
      rebuild();
      compMessage(compSummary());
    } catch (e) { if (token === compToken) compMessage("⚠ " + (e.message || e), true); }
  }
  // What was drawn in year 0, and what does not fit the genus.
  function compSummary() {
    const comp = opt.comp;
    if (!comp || !stand) return "";
    const n = new Map(), first = stand.trees.filter(t => t.born === 0);
    for (const t of first) n.set(t.genus, (n.get(t.genus) || 0) + 1);
    const rows = [...comp].sort((a, b) => b.pct - a.pct), cnt = (e) => n.get(e.genus) || 0;
    const parts = rows.map(e => `${e.genus} ${pctText(e.pct)} (${cnt(e)})`);
    const left = first.length - rows.reduce((a, e) => a + cnt(e), 0);
    if (compRest(comp) > 0.05) parts.push(`${tx("sv_comp_rest")} ${pctText(compRest(comp))} (${left})`);
    let s = tx("sv_comp_drawn", parts.join(", "));
    const noShape = rows.filter(e => !genera.forms[formName(genera, zoneKey, e.genus)]).map(e => e.genus);
    if (noShape.length) s += " " + tx("sv_comp_noshape", noShape.join(", "));
    for (const e of rows) {
      const f = genera.forms[formName(genera, zoneKey, e.genus)];
      if (f && f.few) s += " " + tx("sv_comp_few", e.genus, f.few);
    }
    const big = stand.trees.filter(t => comp.some(e => e.genus === t.genus) && genera.cap[t.genus] < StandModel.topClass(t)).length;
    if (big) s += " " + tx("sv_comp_big", big);
    return s;
  }
  function compMessage(s, bad) {
    const el = $("sv_compmsg");
    if (el) { el.textContent = s; el.classList.toggle("sv-bad", !!bad); }
  }
  // Genera offered for "one dominant genus": this ecozone's, then the others.
  function genusGroups(zg) {
    const here = new Set(zg.mix.flatMap(x => Object.keys(x)).filter(n => n !== "Other"));
    const all = Object.keys(genera.genus_form).filter(n => genera.forms[formName(genera, zoneKey, n)]).sort();
    return [[tx("sv_comp_here"), all.filter(n => here.has(n))], [tx("sv_comp_else"), all.filter(n => !here.has(n))]];
  }
  function topGenus(zg) {
    const t = {};
    for (const x of zg.mix.slice(0, 4)) for (const [n, v] of Object.entries(x)) if (n !== "Other") t[n] = (t[n] || 0) + v;
    return Object.keys(t).sort((a, b) => t[b] - t[a])[0];
  }
  function compUi(zg) {
    if (!opt.domGenus) opt.domGenus = topGenus(zg);
    const o = (v, n, val) => `<option value="${v}"${v === val ? " selected" : ""}>${n}</option>`;
    return `<div class="sv-bar" id="sv_comprow">
        <label class="sv-opt">${tx("sv_comp")}<select id="sv_comp">${[["mix", "sv_comp_mix"], ["dom", "sv_comp_dom"], ["list", "sv_comp_list"]].map(([v, k]) => o(v, tx(k), opt.compMode)).join("")}</select></label>
        <span class="sv-opt" id="sv_domrow"><select id="sv_dom" aria-label="${tx("sv_comp_dom")}">${genusGroups(zg).map(([l, ns]) =>
          `<optgroup label="${l}">${ns.map(n => o(n, n, opt.domGenus)).join("")}</optgroup>`).join("")}</select>
          <input type="number" id="sv_dompct" min="1" max="100" step="1" value="${opt.domPct}" aria-label="${tx("sv_comp_pct")}"> %</span>
        <span class="sv-opt" id="sv_listrow"><textarea id="sv_list" rows="3" spellcheck="false" placeholder="${tx("sv_comp_hint")}" aria-label="${tx("sv_comp_list")}"></textarea>
          <button id="sv_listgo">${tx("sv_comp_apply")}</button></span>
        <div id="sv_compmsg" class="sv-compmsg"></div>
        <div class="sv-note">${tx("sv_comp_note")}</div>
      </div>`;
  }
  function showComp() {
    $("sv_comprow").style.display = opt.shapes === "genus" ? "" : "none";
    $("sv_domrow").style.display = opt.compMode === "dom" ? "" : "none";
    $("sv_listrow").style.display = opt.compMode === "list" ? "" : "none";
  }
  function wireComp() {
    $("sv_list").value = opt.listText;
    $("sv_comp").onchange = (e) => { opt.compMode = e.target.value; showComp(); applyComp(); };
    $("sv_dom").onchange = (e) => { opt.domGenus = e.target.value; applyComp(); };
    $("sv_dompct").onchange = (e) => { opt.domPct = +e.target.value; applyComp(); };
    $("sv_list").oninput = (e) => { opt.listText = e.target.value; };
    $("sv_listgo").onclick = applyComp;
    showComp();
    compMessage(compSummary());
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  function message(html) { $("sub-stand").innerHTML = html; }

  function buildUi() {
    const sel = (id, label, opts, val) => `<label class="sv-opt">${label}<select id="${id}">` +
      opts.map(([v, n]) => `<option value="${v}"${String(v) === String(val) ? " selected" : ""}>${n}</option>`).join("") + `</select></label>`;
    const zg = genera && genera.zones[zoneKey];
    const chk = (id, label, on) => `<label class="sv-chk"><input type="checkbox" id="${id}" ${on ? "checked" : ""}> ${label}</label>`;
    message(`
    <div class="card card-accent-green">
      <div class="sec-hdr"><span class="hdr-icon">🎬</span> ${tx("sv_title")}
        <span class="sv-actions">
          <button class="btn-dl" id="sv_png">${tx("sv_png")}</button>
          <button class="btn-dl" id="sv_gif">${tx("sv_gif")}</button>
          <button class="btn-dl" id="sv_mp4">${tx("sv_mp4")}</button></span></div>
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
        ${zg ? sel("sv_shapes", tx("sv_shapes"), [["genus", tx("sv_by_genus")], ["generic", tx("sv_generic")]], opt.shapes) : ""}
        ${sel("sv_speed", tx("sv_speed"), [0.5, 1, 2, 5, 10].map(s => [s, tx("sv_rate", s)]), opt.speed)}
        ${sel("sv_gifw", tx("sv_gifw"), [800, 1000, 1200].map(n => [n, n + " px"]), opt.gifw)}
        ${sel("sv_gifn", tx("sv_gifn"), [[60, tx("sv_upto", 60)], [120, tx("sv_upto", 120)], [600, tx("sv_every")]], opt.gifn)}
        ${sel("sv_vidw", tx("sv_vidw"), [[1200, "1200 × 640"], [1920, "1920 × 1024"]], opt.vidw)}
        ${chk("sv_loop", tx("sv_loop"), opt.loop)}
        ${chk("sv_snags", tx("sv_snags"), opt.snags)}
        ${chk("sv_stumps", tx("sv_stumps"), opt.stumps)}
        <button id="sv_seed" title="${tx("sv_layout_tip")}">${tx("sv_layout")}</button>
        <button id="sv_cam">${tx("sv_reset")}</button>
      </div>
      ${zg ? compUi(zg) : ""}
      <div id="sv_status" class="sv-status"></div>
      <div class="sv-note">${tx("sv_note")} ${zg ? tx("sv_note_genus", zg.trees, zg.plots, Math.round(100 * zg.drawn_by_genus)) : tx("sv_note_generic")}</div>
    </div>`);

    const cv = $("sv_canvas");
    fitCanvas(cv);

    $("sv_play").onclick = () => setPlaying(!playing);
    $("sv_first").onclick = () => seek(0);
    $("sv_prev").onclick = () => seek(Math.ceil(clock) - 1);
    $("sv_next").onclick = () => seek(Math.floor(clock) + 1);
    $("sv_year").oninput = (e) => seek(+e.target.value);
    const on = (id, key, conv, rebuildToo) => $(id).addEventListener("change", (e) => {
      opt[key] = conv(e.target); if (rebuildToo) { rebuild(); if (zg) compMessage(compSummary()); } dirty = true;
    });
    on("sv_view", "view", e => e.value); on("sv_area", "areaHa", e => +e.value, true); on("sv_speed", "speed", e => +e.value);
    if (zg) { on("sv_shapes", "shapes", e => e.value); $("sv_shapes").addEventListener("change", showComp); wireComp(); }
    on("sv_gifw", "gifw", e => +e.value); on("sv_gifn", "gifn", e => +e.value);
    on("sv_vidw", "vidw", e => +e.value);
    on("sv_loop", "loop", e => e.checked); on("sv_snags", "snags", e => e.checked); on("sv_stumps", "stumps", e => e.checked);
    $("sv_seed").onclick = () => { opt.seed = 1 + Math.floor(Math.random() * 1e9); rebuild(); if (zg) compMessage(compSummary()); };
    $("sv_cam").onclick = () => { opt.az = defaults.az; opt.pitch = defaults.pitch; opt.zoom = 1; dirty = true; };
    $("sv_png").onclick = exportPng;
    $("sv_gif").onclick = exportGif;
    $("sv_mp4").onclick = exportVideo;

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
    const zg = genera && genera.zones[zoneKey];
    if (zg && opt.comp) StandModel.assignComposition(stand, zg.mix, genera.cap, opt.seed, opt.comp);
    else if (zg) StandModel.assignGenera(stand, zg.mix, genera.cap, opt.seed);
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

  // ── Video ─────────────────────────────────────────────────────────────────
  // Every frame is drawn in turn (not recorded from the screen), so the result
  // does not depend on how fast this computer is.
  const FPS = 30, VIDEO_MAX_S = 180, HOLD_START = 1, HOLD_END = 2;
  // Years per second: the chosen speed, raised only if the video would be too long.
  function videoPlan() {
    const speed = Math.max(opt.speed, sim.sim_l / (VIDEO_MAX_S - HOLD_START - HOLD_END));
    const run = Math.ceil(sim.sim_l / speed * FPS);
    return { speed, run, frames: HOLD_START * FPS + run + HOLD_END * FPS, faster: speed > opt.speed };
  }
  const pause = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });

  async function makeVideo(width, onProgress) {
    const k = width / W, w = width, h = Math.round(H * k), plan = videoPlan();
    const enc = await Mp4Encoder.create(w, h, FPS, width > 1400 ? 10e6 : 5e6);
    if (!enc) throw new Error(tx("sv_err_video"));
    try {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d");
      for (let i = 0; i < plan.frames; i++) {
        const j = Math.max(0, Math.min(plan.run, i - HOLD_START * FPS));
        if (i === 0 || (j > 0 && i <= HOLD_START * FPS + plan.run)) draw(g, plan.run ? sim.sim_l * j / plan.run : 0, k);
        await enc.add(c);
        if (onProgress) onProgress(i + 1, plan.frames);
        if (i % 2) await pause();              // keep the window responsive
      }
      return { bytes: await enc.finish(), frames: plan.frames, seconds: plan.frames / FPS, ...plan, codec: enc.codec };
    } finally { enc.close(); }
  }

  // Runs one export at a time; its own button becomes "cancel" meanwhile.
  let cancelled = false;
  async function runExport(id, label, job) {
    if (busy) { if (opt.exporting === id) cancelled = true; return; }
    setPlaying(false);
    busy = true; cancelled = false; opt.exporting = id;
    const btn = $(id), controls = [...document.querySelectorAll("#sub-stand button, #sub-stand select, #sub-stand input, #sub-stand textarea")].filter(e => e !== btn);
    controls.forEach(e => { e.disabled = true; });
    const token = loadToken;
    status("");
    try {
      await job((i, n) => {
        if (token !== loadToken) throw new Error(tx("sv_restarted"));
        if (cancelled) throw new Error(tx("sv_stopped"));
        btn.textContent = tx("sv_encoding", Math.floor(100 * i / n));
      }, () => { btn.disabled = true; });      // past the point where cancel makes sense
    } catch (e) {
      status(cancelled ? tx("sv_stopped") : tx("sv_failed", e.message || e));
    } finally {
      busy = false; dirty = true; opt.exporting = null;
      btn.textContent = tx(label); btn.disabled = false;
      controls.forEach(e => { e.disabled = false; });
      if (relabelLater) { const s = $("sv_status") ? $("sv_status").textContent : ""; relabel(); status(s); }
    }
  }
  const exportGif = () => runExport("sv_gif", "sv_gif", async (progress, saving) => {
    const { bytes, frames } = await makeGif(opt.gifw, opt.gifn, progress);
    saving();
    status(tx("sv_ready", "GIF", frames, mb(bytes.length)));
    const p = await saveBinary(`${tx("sv_file_gif")}_${stamp()}.gif`, bytes, "image/gif");
    status(p ? tx("sv_saved_gif", p, frames, mb(bytes.length)) : tx("sv_cancelled"));
  });
  const exportVideo = () => runExport("sv_mp4", "sv_mp4", async (progress, saving) => {
    const v = await makeVideo(opt.vidw, progress);
    saving();
    const note = v.faster ? " " + tx("sv_faster", +v.speed.toFixed(1)) : "";
    status(tx("sv_ready", "MP4", v.frames, mb(v.bytes.length)) + note);
    const p = await saveBinary(`${tx("sv_file_gif")}_${stamp()}.mp4`, v.bytes, "video/mp4");
    status(p ? tx("sv_saved_mp4", p, Math.round(v.seconds), mb(v.bytes.length)) + note : tx("sv_cancelled"));
  });

  // ── Public ────────────────────────────────────────────────────────────────
  async function load(result) {
    const token = ++loadToken;
    stand = null;
    playing = false; clock = 0; loading = true;
    relabel();
    try {
      const [m, gd] = await getManifest();
      const key = m.zones[result.gec] ? result.gec : ZONE_FALLBACK[result.gec];
      if (!key) throw new Error(tx("sv_err_zone", result.gec));
      const z = m.zones[key];
      const files = z.classes.flatMap(c => [...c.trees.map(x => x.file), c.snag.file]).concat(m.stump.file);
      if (gd && gd.zones[key]) {
        const used = new Set(gd.zones[key].mix.flatMap(x => Object.keys(x)).filter(n => n !== "Other").map(n => formName(gd, key, n)));
        for (const n of used) files.push(...gd.forms[n].sizes.map(x => x.file));
        files.push(...compFiles(gd, key, opt.comp));
      }
      await Promise.all(files.map(loadImage));
      if (token !== loadToken) return;         // a newer run replaced this one
      if (zoneKey !== key) derived.clear();
      manifest = m; genera = gd; zone = z; zoneKey = key; sim = result;
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
  return { load, clear, relabel, makeGif, makeVideo,
    debug: () => ({ stand, zone, sim, opt, draw, set: (time, o) => { Object.assign(opt, o || {}); clock = time; dirty = true; } }) };
})();
