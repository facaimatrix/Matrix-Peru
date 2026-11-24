// ============================================================================
// Stand View — turns the matrix-model time series into individual trees.
//
// The simulation reports trees/ha per DBH class (fractional, non-spatial). The
// picture needs whole trees that persist from year to year. buildStand() keeps
// one exact rule:
//
//     trees drawn in class c, year y  ==  round(tph[y][c] * area)
//
// and gets from one year to the next using the model's own flows (recruitment,
// upgrowth, mortality, harvest), rounded by carrying the remainder forward, so
// cumulative drawn events track cumulative modelled events. Which individual
// tree grows, dies or is cut, and where it stands, is random but seeded: the
// same simulation and seed always give the same picture.
// ============================================================================
const StandModel = (() => {
  const N = 13;

  function rng(seed) {                       // mulberry32
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // crown: crown width (m) per class, used only to space trees apart.
  function buildStand(sim, { areaHa = 1, seed = 1, crown } = {}) {
    const R = rng(seed), side = Math.sqrt(areaHa * 10000);
    const trees = [], live = Array.from({ length: N }, () => []);
    const zero = new Array(N).fill(0);
    const upM = sim.up_mat || [], moM = sim.mort_mat || [], rec = sim.rec_vec || [];
    const cells = new Map(), CELL = 5;        // spatial hash of living trees
    const key = (x, y) => Math.floor(x / CELL) + ":" + Math.floor(y / CELL);

    function crowding(x, y, r) {
      let s = 0;
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        for (const t of cells.get((cx + i) + ":" + (cy + j)) || []) {
          const d = Math.hypot(t.x - x, t.y - y), reach = r + crown[t.cls] / 2;
          if (d < reach) s += (1 - d / reach) * (1 + t.cls * 0.25);
          if (d < 1) s += 4;
        }
      }
      return s;
    }
    function spawn(cls, year) {
      let best = null;
      for (let k = 0; k < 10; k++) {          // least crowded of 10 random spots
        const x = (R() - 0.5) * side, y = (R() - 0.5) * side;
        const c = crowding(x, y, crown[cls] / 2) + R() * 0.15;
        if (!best || c < best.c) best = { x, y, c };
      }
      const t = {
        id: trees.length, x: best.x, y: best.y, cls,
        born: year, hist: [[year, cls]], end: Infinity, fate: null,
        shape: Math.floor(R() * 3), flip: R() < 0.5, vig: 0.92 + R() * 0.16,
        fall: R() < 0.5 ? -1 : 1,
      };
      trees.push(t); live[cls].push(t);
      const k = key(t.x, t.y);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(t);
      return t;
    }
    function remove(t, year, fate) {
      t.end = year; t.fate = fate;
      const c = cells.get(key(t.x, t.y));
      c.splice(c.indexOf(t), 1);
    }
    const take = (arr) => arr.splice(Math.floor(R() * arr.length), 1)[0];

    // Year 0, largest first so big trees get the open space.
    for (let c = N - 1; c >= 0; c--)
      for (let k = Math.round(sim.tph_mat[0][c] * areaHa); k > 0; k--) spawn(c, 0);

    // acc = modelled minus drawn, cumulative, per flow and class
    const acc = { inn: zero.slice(), mort: zero.slice(), harv: zero.slice() };
    const events = [{ rec: 0, up: 0, dead: 0, cut: 0, forced: 0 }];

    for (let m = 1; m <= sim.sim_l; m++) {
      const up = upM[m] || zero, mo = moM[m] || zero, hv = sim.harv_mat[m] || zero;
      const cutYear = sim.harvest_years.includes(m);
      const n = live.map(a => a.length);
      const F = [];
      let out = 0;                            // trees leaving class c upward
      for (let c = N - 1; c >= 0; c--) {
        const cap = c > 0 ? n[c - 1] : Infinity;
        acc.inn[c] += c > 0 ? up[c - 1] * areaHa : (rec[m] || 0) * areaHa;
        acc.mort[c] += mo[c] * areaHa;
        acc.harv[c] += hv[c] * areaHa;
        const f = {
          inn: Math.min(cap, Math.max(0, Math.round(acc.inn[c]))),
          mort: Math.max(0, Math.round(acc.mort[c])),
          harv: cutYear ? Math.max(0, Math.round(acc.harv[c])) : 0,
          forced: 0, out,
        };
        const target = Math.round(sim.tph_mat[m][c] * areaHa);
        let gap = target - (n[c] + f.inn - out - f.mort - f.harv);
        // Close the rounding gap one tree at a time, always through the flow
        // that ends up nearest to what the model says.
        while (gap !== 0) {
          const s = Math.sign(gap), opts = [];
          if (s > 0 ? f.inn < cap : f.inn > 0) opts.push(["inn", s]);
          if (s < 0 || f.mort > 0) opts.push(["mort", -s]);
          if (cutYear && hv[c] > 0 && (s < 0 || f.harv > 0)) opts.push(["harv", -s]);
          if (!opts.length) { f.forced += gap; break; }   // only ever gap > 0
          let best = null;
          for (const [k, d] of opts) {
            const err = Math.abs(acc[k][c] - (f[k] + d));
            if (!best || err < best.err) best = { k, d, err };
          }
          f[best.k] += best.d; gap -= s;
        }
        acc.inn[c] -= f.inn; acc.mort[c] -= f.mort; acc.harv[c] -= f.harv;
        F[c] = f; out = c > 0 ? f.inn : 0;
      }

      // Apply: upgrowth (longest in class first), recruits, deaths, cutting.
      const ev = { rec: 0, up: 0, dead: 0, cut: 0, forced: 0 };
      const since = (t) => t.hist[t.hist.length - 1][0];
      const movers = F.map((f, c) => {
        live[c].sort((a, b) => since(a) - since(b) || a.id - b.id);
        return live[c].splice(0, f.out);
      });
      for (let c = 0; c < N - 1; c++) for (const t of movers[c]) {
        t.cls = c + 1; t.hist.push([m, c + 1]); live[c + 1].push(t); ev.up++;
      }
      for (let k = 0; k < F[0].inn; k++) { spawn(0, m); ev.rec++; }
      for (let c = 0; c < N; c++) {
        for (let k = 0; k < F[c].forced; k++) { spawn(c, m); ev.forced++; }
        for (let k = 0; k < F[c].mort; k++) { remove(take(live[c]), m, "dead"); ev.dead++; }
        for (let k = 0; k < F[c].harv; k++) { remove(take(live[c]), m, "cut"); ev.cut++; }
      }
      events.push(ev);
    }
    return { trees, side, areaHa, events, years: sim.sim_l };
  }

  // Give every tree a genus for life, from observed shares by DBH class.
  // mix[c]: {genus: share}, cap: {genus: largest class it is drawn in}. The
  // share used is the one for the class in which the tree first appears, among
  // genera that reach the largest class this tree grows to.
  function assignGenera(stand, mix, cap, seed) {
    const R = rng((seed ^ 0x5bd1e995) >>> 0);
    for (const t of stand.trees) {
      const c0 = t.hist[0][1], top = t.hist[t.hist.length - 1][1], r = R();
      const opts = Object.entries(mix[c0]).filter(([g]) => g === "Other" || cap[g] >= top);
      const sum = opts.reduce((a, [, w]) => a + w, 0);
      let left = r * sum;
      t.genus = "Other";
      for (const [g, w] of opts) { left -= w; if (left <= 0) { t.genus = g; break; } }
    }
  }

  // DBH class a tree is in at the end of `year` (assumes born <= year).
  function classAt(t, year) {
    let c = t.hist[0][1];
    for (const [y, k] of t.hist) { if (y <= year) c = k; else break; }
    return c;
  }

  return { buildStand, assignGenera, classAt, rng, N };
})();
