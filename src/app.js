// ============================================================================
// MatrixPro Peru — frontend logic
// ============================================================================
const invoke = window.__TAURI__.core.invoke;

// ── i18n ─────────────────────────────────────────────────────────────────────
const T = {
  es: {
    title_sub: "Simulador de Crecimiento Forestal Basado en Modelo Matricial",
    tab_input: "📥&nbsp; Parámetros de Entrada", tab_output: "📊&nbsp; Resultados",
    sec_location: " Coordenadas de Ubicación",
    map_hint: "📍 Ingrese manualmente o haga clic en el mapa — el clic completa ambos campos",
    lbl_lat: "Latitud (°)", lbl_lon: "Longitud (°)",
    sec_map: " Perú — Haga clic en el mapa para seleccionar ubicación",
    sec_stand: " Estado del Rodal",
    stand_init: "🌱 Estado Inicial del Rodal", stand_tgt: "🎯 Estado Objetivo del Rodal",
    btn_manual: "✏ Ingresar Manualmente", btn_autofill: "📍 Autocompletar desde Mapa",
    btn_copy: "= Igual al Inicial",
    th_dbh: "Clase DAP (cm)", th_tph_input: "Árboles / Hectárea",
    sec_params: " Parámetros de Simulación",
    lbl_sim_length: "Duración de Simulación (años)",
    lbl_first_harvest: "Año de Primera Cosecha", lbl_cutting_cycle: "Ciclo de Corta (años)",
    btn_run: "▶&nbsp; Ejecutar Simulación", btn_get_data: "⬇&nbsp; Obtener Datos",
    sub_tph: "🌳 Árboles por Hectárea", sub_ba: "📐 Área Basal",
    sub_agb: "🌿 Biomasa", sub_div: "📊 Índices de Diversidad",
    loading: "Cargando…", data_error: "Error de datos",
    ready: (n) => `Listo — ${n} parcelas`,
    err_lat_range: "Latitud fuera del rango de Perú",
    err_lon_range: "Longitud fuera del rango de Perú",
    err_enter_coords: "⚠ Por favor ingrese Latitud y Longitud primero.",
    err_outside_forest_autofill: "⚠ El punto está fuera del área forestal — autocompletar no disponible.",
    err_outside_forest_warn: "⚠ El punto seleccionado está fuera del área forestal — valores del rodal establecidos en cero.",
    ok_autofill: (km) => `✅ Rodal inicial completado desde la parcela más cercana (~${km} km desde la ubicación ingresada).`,
    err_no_coords: "Ingrese latitud y longitud primero.", err_outside_peru: "Las coordenadas están fuera del rango de Perú.",
    running: "Ejecutando…", err_sim: "⚠ Error de Simulación",
    chart_year: "Año", tph_chart_label: "Total Árboles/ha", tph_y: "Árboles / ha",
    sec_tph_chart: "Total de Árboles por Hectárea en el Tiempo",
    sec_tph_table: "Árboles Anuales por Hectárea — por Clase DAP",
    th_year: "Año", th_total_tph: "TPH Total", th_harv_tph: "TPH Cosechado", th_harvest: "Cosecha",
    ba_chart_label: "Área Basal Total (m²/ha)", ba_y: "Área Basal (m²/ha)",
    sec_ba_chart: "Área Basal Total en el Tiempo (m²/ha)", sec_ba_table: "Área Basal Total Anual",
    th_ba: "AB Total (m²/ha)",
    agb_chart_label: "BAS Total (Mg/ha)", agb_y: "BAS (Mg/ha)",
    sec_agb_chart: "Biomasa Aérea Total en el Tiempo (Mg/ha)", sec_agb_table: "Biomasa Aérea Total Anual",
    th_agb: (gec) => `BAS Total (Mg/ha) — GEC ${gec}`,
    th_change: "Cambio respecto al Año Anterior", th_pct: "% Cambio",
    sec_s1_chart: "Índice de Shannon (S1) — H'", sec_s2_chart: "Índice de Simpson (S2) — D",
    sec_div_table: "Índices de Diversidad Anuales — S1 (Shannon) & S2 (Simpson)",
    s1_label: "Índice de Shannon S1 (H')", s1_y: "Shannon H'",
    s2_label: "Índice de Simpson S2 (D)", s2_y: "Simpson D",
    th_s1: "Shannon S1 (H')", th_s2: "Simpson S2 (D)",
    btn_dl: "⬇ Descargar CSV",
  },
  en: {
    title_sub: "Matrix Model Based Forest Growth Simulator",
    tab_input: "📥&nbsp; Input Parameters", tab_output: "📊&nbsp; Output",
    sec_location: " Location Coordinates",
    map_hint: "📍 Enter manually or click the map — map click auto-fills both fields",
    lbl_lat: "Latitude (°)", lbl_lon: "Longitude (°)",
    sec_map: " Peru — Click Map to Select Location",
    sec_stand: " Stand State Input",
    stand_init: "🌱 Initial Stand State", stand_tgt: "🎯 Target Stand State",
    btn_manual: "✏ Enter Manually", btn_autofill: "📍 Autofill from Map Location",
    btn_copy: "= Same as Initial",
    th_dbh: "DBH Class (cm)", th_tph_input: "Trees / Hectare",
    sec_params: " Simulation Parameters",
    lbl_sim_length: "Simulation Length (years)",
    lbl_first_harvest: "Year of First Harvest", lbl_cutting_cycle: "Cutting Cycle (years)",
    btn_run: "▶&nbsp; Run Simulation", btn_get_data: "⬇&nbsp; Get Input Data",
    sub_tph: "🌳 Trees per Hectare", sub_ba: "📐 Basal Area",
    sub_agb: "🌿 Biomass", sub_div: "📊 Diversity Indices",
    loading: "Loading…", data_error: "Data error",
    ready: (n) => `Ready — ${n} plots`,
    err_lat_range: "Latitude outside Peru range",
    err_lon_range: "Longitude outside Peru range",
    err_enter_coords: "⚠ Please enter Latitude and Longitude first.",
    err_outside_forest_autofill: "⚠ Point is outside the forest area — autofill unavailable.",
    err_outside_forest_warn: "⚠ Selected point is outside the forest area — stand values set to zero.",
    ok_autofill: (km) => `✅ Initial stand autofilled from closest plot (~${km} km from entered location).`,
    err_no_coords: "Enter a latitude and longitude first.", err_outside_peru: "Coordinates are outside Peru's range.",
    running: "Running…", err_sim: "⚠ Simulation Error",
    chart_year: "Year", tph_chart_label: "Total Trees/ha", tph_y: "Trees / ha",
    sec_tph_chart: "Total Trees per Hectare over Time",
    sec_tph_table: "Annual Trees per Hectare — by DBH Class",
    th_year: "Year", th_total_tph: "Total TPH", th_harv_tph: "Harvested TPH", th_harvest: "Harvest",
    ba_chart_label: "Total Basal Area (m²/ha)", ba_y: "Basal Area (m²/ha)",
    sec_ba_chart: "Total Basal Area over Time (m²/ha)", sec_ba_table: "Annual Total Basal Area",
    th_ba: "Total BA (m²/ha)",
    agb_chart_label: "Total AGB (Mg/ha)", agb_y: "AGB (Mg/ha)",
    sec_agb_chart: "Total Above-Ground Biomass over Time (Mg/ha)", sec_agb_table: "Annual Total Above-Ground Biomass",
    th_agb: (gec) => `Total AGB (Mg/ha) — GEC ${gec}`,
    th_change: "Change from Prev Year", th_pct: "% Change",
    sec_s1_chart: "Shannon Index (S1) — H'", sec_s2_chart: "Simpson Index (S2) — D",
    sec_div_table: "Annual Diversity Indices — S1 (Shannon) & S2 (Simpson)",
    s1_label: "Shannon Index S1 (H')", s1_y: "Shannon H'",
    s2_label: "Simpson Index S2 (D)", s2_y: "Simpson D",
    th_s1: "Shannon S1 (H')", th_s2: "Simpson S2 (D)",
    btn_dl: "⬇ Download CSV",
  }
};

let LANG = localStorage.getItem("mp_lang") || "es";
const t = (key) => T[LANG][key] || key;

let APP_STATUS = "loading", APP_PLOTS = 0;

function applyLang() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const val = T[LANG][el.dataset.i18n];
    if (val !== undefined) el.innerHTML = val;
  });
  // status text
  const st = document.getElementById("status_text");
  if (APP_STATUS === "ready") st.textContent = T[LANG].ready(APP_PLOTS);
  else if (APP_STATUS === "error") st.textContent = t("data_error");
  else st.textContent = t("loading");
  // lang button active states
  document.getElementById("lang_es").classList.toggle("active", LANG === "es");
  document.getElementById("lang_en").classList.toggle("active", LANG === "en");
  // re-render output if a simulation result exists
  if (SIM) renderAll();
}

const DBH_CLASSES = ["10-15","15-20","20-25","25-30","30-35","35-40","40-45",
  "45-50","50-55","55-60","60-65","65-70",">=70"];
const N_DBH = 13;

let SIM = null;        // last SimResult
let NEAREST = null;    // last find_nearest result (for "Get Input Data")
let depLayer = null;   // Leaflet GeoJSON layer
let depFeatures = null;// raw GeoJSON features for point-in-polygon
let marker = null;
let IS_FOREST = true;  // tracks whether the current point is inside the forest mask

// ── Build the 13-row stand-state input tables ──────────────────────────────
function buildStandTables() {
  const mk = (prefix) =>
    DBH_CLASSES.map((cl, i) =>
      `<tr><td class="dbh-lbl-cell">${cl} cm</td>
       <td><input type="number" id="${prefix}_${i+1}" value="0" min="0" step="0.1"></td></tr>`
    ).join("");
  document.getElementById("init_tbody").innerHTML = mk("init");
  document.getElementById("tgt_tbody").innerHTML = mk("tgt");
}

function readVec(prefix) {
  const v = [];
  for (let i = 1; i <= N_DBH; i++) {
    const el = document.getElementById(`${prefix}_${i}`);
    const n = parseFloat(el.value);
    v.push(isNaN(n) ? 0 : n);
  }
  return v;
}
function setInit(i, val) {
  const el = document.getElementById(`init_${i}`);
  if (el) el.value = val;
  if (tgtMode === "copy") { const t = document.getElementById(`tgt_${i}`); if (t) t.value = val; }
}

// ── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".tab-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  const t = b.dataset.tab;
  document.getElementById("tab-input").classList.toggle("hidden", t !== "input");
  document.getElementById("tab-output").classList.toggle("hidden", t !== "output");
}));
document.querySelectorAll(".subtab-btn").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".subtab-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  ["tph","ba","agb","div"].forEach(s =>
    document.getElementById(`sub-${s}`).classList.toggle("hidden", s !== b.dataset.sub));
}));

// ── Language switcher ────────────────────────────────────────────────────────
["es", "en"].forEach(lang =>
  document.getElementById(`lang_${lang}`).addEventListener("click", () => {
    LANG = lang;
    localStorage.setItem("mp_lang", lang);
    applyLang();
  })
);

// ── Init / Target mode toggles ──────────────────────────────────────────────
let initMode = "manual", tgtMode = "manual";
function styleToggle(btn, active, accent) {
  if (active) {
    btn.style.background = accent;
    btn.style.color = "#FAF4D3";
  } else {
    btn.style.background = "";
    btn.style.color = "";
  }
}
function setInitMode(mode) {
  initMode = mode;
  styleToggle(document.getElementById("init_opt_manual"), mode === "manual", "linear-gradient(135deg,#836B00,#5C4C00)");
  styleToggle(document.getElementById("init_opt_autofill"), mode === "autofill", "linear-gradient(135deg,#005550,#003330)");
  const inputs = document.querySelectorAll("#init_tbody input");
  inputs.forEach(el => { el.disabled = false; el.style.opacity = "1"; });
  if (mode === "autofill") autofill();
}
function setTgtMode(mode) {
  tgtMode = mode;
  styleToggle(document.getElementById("tgt_opt_manual"), mode === "manual", "linear-gradient(135deg,#005550,#003330)");
  styleToggle(document.getElementById("tgt_opt_copy"), mode === "copy", "linear-gradient(135deg,#005550,#003330)");
  const inputs = document.querySelectorAll("#tgt_tbody input");
  if (mode === "copy") {
    for (let i = 1; i <= N_DBH; i++) {
      const s = document.getElementById(`init_${i}`), d = document.getElementById(`tgt_${i}`);
      if (d) d.value = s ? s.value : 0;
      if (d) {
        d.disabled = true;
        d.style.opacity = "0.55";
        d.style.background = "rgba(34,197,94,0.07)";
      }
    }
  } else {
    inputs.forEach(el => { el.disabled = false; el.style.opacity = "1"; el.style.background = ""; });
  }
}
document.querySelectorAll("#init_opt_manual,#init_opt_autofill").forEach(b =>
  b.addEventListener("click", () => setInitMode(b.dataset.mode)));
document.querySelectorAll("#tgt_opt_manual,#tgt_opt_copy").forEach(b =>
  b.addEventListener("click", () => setTgtMode(b.dataset.mode)));

// Live-sync init -> tgt while in "copy" mode.
document.addEventListener("input", (e) => {
  if (tgtMode === "copy" && e.target.id && e.target.id.startsWith("init_")) {
    const idx = e.target.id.replace("init_", "");
    const d = document.getElementById(`tgt_${idx}`);
    if (d) d.value = e.target.value;
  }
});

// ── Coordinate validation + department badge ────────────────────────────────
function validateCoords() {
  const lat = parseFloat(document.getElementById("lat").value);
  const lon = parseFloat(document.getElementById("lon").value);
  const msgs = [];
  if (!isNaN(lat) && (lat < -18.35 || lat > -0.03)) msgs.push(t("err_lat_range"));
  if (!isNaN(lon) && (lon < -81.33 || lon > -68.65)) msgs.push(t("err_lon_range"));
  document.getElementById("coord_val_msg").innerHTML =
    msgs.length ? `<div class="val-error">${msgs.join(" · ")}</div>` : "";
  updateDeptBadge(lat, lon);
  document.getElementById("run_btn").disabled = false;
}
["lat","lon"].forEach(id => document.getElementById(id).addEventListener("input", validateCoords));

// ── Forest mask check ────────────────────────────────────────────────────────
async function checkForestAndWarn(lat, lon) {
  const el = document.getElementById("forest_warn_msg");
  if (isNaN(lat) || isNaN(lon)) { el.innerHTML = ""; IS_FOREST = true; return; }
  try {
    IS_FOREST = await invoke("check_forest", { lat, lon });
  } catch (_) {
    IS_FOREST = true; // fail open if mask not loaded
  }
  if (!IS_FOREST) {
    el.innerHTML = `<div class="forest-warn">${t("err_outside_forest_warn")}</div>`;
    zeroInitialAndTarget();
  } else {
    el.innerHTML = "";
  }
}

let _forestCheckTimer = null;
function scheduleForestCheck() {
  clearTimeout(_forestCheckTimer);
  _forestCheckTimer = setTimeout(() => {
    const lat = parseFloat(document.getElementById("lat").value);
    const lon = parseFloat(document.getElementById("lon").value);
    checkForestAndWarn(lat, lon);
  }, 600);
}
["lat","lon"].forEach(id => document.getElementById(id).addEventListener("input", scheduleForestCheck));

// Point-in-polygon (ray casting) over a [lon,lat] ring.
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = ((yi > lat) !== (yj > lat)) &&
                (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (const ring of polygon) {
    if (pointInRing(lon, lat, ring)) inside = !inside;
  }
  return inside;
}
function featureContainsPoint(f, lon, lat) {
  const g = f.geometry;
  if (!g) return false;
  if (g.type === "Polygon") {
    return pointInPolygon(lon, lat, g.coordinates);
  }
  if (g.type === "MultiPolygon") {
    for (const polygon of g.coordinates) {
      if (pointInPolygon(lon, lat, polygon)) return true;
    }
  }
  return false;
}
function deptAt(lon, lat) {
  if (!depFeatures) return null;
  for (const f of depFeatures) {
    if (featureContainsPoint(f, lon, lat)) {
      return f.properties && (f.properties.name || f.properties.NAME || f.properties.shapeName) || "Peru";
    }
  }
  return null;
}
function updateDeptBadge(lat, lon) {
  const el = document.getElementById("dept_badge");
  if (isNaN(lat) || isNaN(lon)) { el.innerHTML = ""; return; }
  const d = deptAt(lon, lat);
  el.innerHTML = d ? `<div class="dept-badge">📍 ${d}</div>` : "";
}

// ── Map ─────────────────────────────────────────────────────────────────────
let map;
function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
    maxBounds: [[-18.35, -81.33], [-0.03, -68.65]],
    maxBoundsViscosity: 1.0,
    minZoom: 4
  }).setView([-9.5, -75.0], 5);

  // Basemap layers
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });
  const esriTerrain = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 13,
    attribution: 'Tiles &copy; Esri'
  });
  const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Imagery &copy; Esri'
  });
  const baseMaps = {
    "OpenStreetMap": osm,
    "Satellite (Esri)": esriImagery
  };

  // (Mapbox removed — only OpenStreetMap and Esri Satellite are available)

  // Default basemap
  osm.addTo(map);

  // Layer control (collapsed on small screens)
  L.control.layers(baseMaps, null, { collapsed: false }).addTo(map);

  // Optional department polygons (place peru_departments.geojson next to index.html)
  fetch("peru_departments.geojson").then(r => r.ok ? r.json() : null).then(gj => {
    if (!gj) return;
    depFeatures = gj.features || [];
    depLayer = L.geoJSON(gj, {
      interactive: false,
      style: { fillOpacity: 0, color: "#7d6038", weight: 1.3, opacity: 0.9 }
    }).addTo(map);

    // Create a world-mask polygon with a hole for Peru so only Peru shows through.
    try {
      if (depFeatures && depFeatures.length) {
        // Outer world rectangle (lat,lng)
        const outer = [[90, -180], [90, 180], [-90, 180], [-90, -180], [90, -180]];
        const holes = [];
        for (const f of depFeatures) {
          const g = f.geometry; if (!g) continue;
          const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : []);
          for (const poly of polys) {
            // poly[0] is the outer ring; convert [lon,lat] -> [lat,lon]
            const ring = poly[0].map(c => [c[1], c[0]]);
            holes.push(ring);
          }
        }
        if (holes.length) {
          // Create a pane above tile layers so mask fully hides outside-Peru tiles
          map.createPane('maskPane');
          map.getPane('maskPane').style.zIndex = 650;
          map.getPane('maskPane').style.pointerEvents = 'none';
          const mask = L.polygon([outer, ...holes], {
            pane: 'maskPane',
            color: '#0A1416', fillColor: '#0A1416', fillOpacity: 1, weight: 0, interactive: false
          }).addTo(map);
        }
      }
    } catch (e) { console.warn('Creating Peru mask failed', e); }
  }).catch(() => {});

  map.on("click", (e) => {
    const lat = Math.round(e.latlng.lat * 1e4) / 1e4;
    const lon = Math.round(e.latlng.lng * 1e4) / 1e4;
    document.getElementById("lat").value = lat;
    document.getElementById("lon").value = lon;
    validateCoords();
    placeMarker(lat, lon, "#D1AC00");
    checkForestAndWarn(lat, lon);
  });
}
function placeMarker(lat, lon, color) {
  if (marker) map.removeLayer(marker);
  marker = L.circleMarker([lat, lon], {
    radius: 8, color: "#0C1618", weight: 2, fillColor: color, fillOpacity: 0.92
  }).addTo(map);
}

function zeroStandValues(prefix) {
  for (let i = 1; i <= N_DBH; i++) {
    const el = document.getElementById(`${prefix}_${i}`);
    if (el) el.value = 0;
  }
}

function zeroInitialAndTarget() {
  zeroStandValues("init");
  if (tgtMode === "copy") {
    zeroStandValues("tgt");
  }
}

// ── Autofill from nearest plot ──────────────────────────────────────────────
async function autofill() {
  const lat = parseFloat(document.getElementById("lat").value);
  const lon = parseFloat(document.getElementById("lon").value);
  const msg = document.getElementById("autofill_msg");
  if (isNaN(lat) || isNaN(lon)) {
    msg.innerHTML = `<div class="autofill-err">${t("err_enter_coords")}</div>`;
    return;
  }
  await checkForestAndWarn(lat, lon);
  if (!IS_FOREST) {
    msg.innerHTML = `<div class="autofill-err">${t("err_outside_forest_autofill")}</div>`;
    return;
  }
  try {
    const r = await invoke("find_nearest", { lat, lon });
    NEAREST = r;
    for (let i = 0; i < N_DBH; i++) setInit(i + 1, r.dbh[i]);
    msg.innerHTML = `<div class="autofill-ok">${T[LANG].ok_autofill(r.dist_km)}</div>`;
  } catch (err) {
    msg.innerHTML = `<div class="autofill-err">⚠ ${err}</div>`;
  }
}

// ── Run simulation ──────────────────────────────────────────────────────────
document.getElementById("run_btn").addEventListener("click", async () => {
  const lat = parseFloat(document.getElementById("lat").value);
  const lon = parseFloat(document.getElementById("lon").value);
  if (isNaN(lat) || isNaN(lon)) { alert(t("err_no_coords")); return; }
  if (lat < -18.35 || lat > -0.03 || lon < -81.33 || lon > -68.65) {
    alert(t("err_outside_peru")); return;
  }
  // Switch to output tab, show running state.
  document.querySelector('.tab-btn[data-tab="output"]').click();
  document.getElementById("sub-tph").innerHTML =
    `<div class="out-empty"><div style="font-size:36px;">⏳</div>
     <p style="font-size:15px;font-weight:600;color:#D1AC00;">${t("running")}</p></div>`;
  placeMarker(lat, lon, "#F6BE9A");

  const params = {
    lat, lon,
    init_v: readVec("init"),
    tgt_v: readVec("tgt"),
    sim_length: parseInt(document.getElementById("sim_length").value) || 50,
    first_harvest: parseInt(document.getElementById("first_harvest").value) || 1,
    cutting_cycle: parseInt(document.getElementById("cutting_cycle").value) || 5,
  };
  try {
    SIM = await invoke("run_sim", { params });
    renderAll();
  } catch (err) {
    document.getElementById("sub-tph").innerHTML =
      `<div class="card card-accent-red" style="border-left:3px solid #f87171;">
         <div class="sec-hdr" style="color:#f87171;">${t("err_sim")}</div>
         <div class="sim-error-box">${err}</div></div>`;
  }
});

// ── Rendering helpers ────────────────────────────────────────────────────────
const rowSum = (m, r) => m[r].reduce((a, b) => a + b, 0);
const fmt = (x, d) => Number(x).toFixed(d);

const CHART_GRID = "rgba(26,58,56,0.9)";
const CHART_TEXT = "rgba(250,244,211,0.45)";
const CHART_TITLE_COLOR = "#F6BE9A";
const CHART_HARVEST_LINE = "rgba(246,190,154,0.55)";

function lineChart(canvasId, label, yLabel, years, values, harvestYears, color) {
  const bg = color.replace("1)", "0.10)");
  const anns = {};
  harvestYears.forEach((y, i) => {
    anns["h" + i] = { type: "line", scaleID: "x", value: y,
      borderColor: CHART_HARVEST_LINE, borderWidth: 1.5, borderDash: [5, 4] };
  });
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  new Chart(ctx.getContext("2d"), {
    type: "line",
    data: { labels: years, datasets: [{ label, data: values, borderColor: color,
      backgroundColor: bg, borderWidth: 2, pointRadius: 0, fill: true, tension: 0.35 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { labels: { color: CHART_TITLE_COLOR, font: { size: 11.5 }, boxWidth: 14 } },
        annotation: { annotations: anns }
      },
      scales: {
        x: {
          title: { display: true, text: t("chart_year"), font: { size: 11 }, color: CHART_TEXT },
          ticks: { font: { size: 10 }, maxTicksLimit: 15, color: CHART_TEXT },
          grid: { color: CHART_GRID },
          border: { color: CHART_GRID }
        },
        y: {
          title: { display: true, text: yLabel, font: { size: 11 }, color: CHART_TEXT },
          ticks: { font: { size: 10 }, color: CHART_TEXT },
          grid: { color: CHART_GRID },
          border: { color: CHART_GRID }
        }
      }
    }
  });
}

function harvestMark(isH) {
  return isH ? `<span style="color:#F6BE9A;font-weight:700;">✂</span>` : "—";
}

function renderAll() {
  const s = SIM, years = [...Array(s.sim_l + 1).keys()];
  const hy = s.harvest_years;
  const isH = (y) => hy.includes(y);

  // ── TPH ────────────────────────────────────────────────────────────────
  const totalTph = years.map(y => rowSum(s.tph_mat, y));
  const totalHarv = years.map(y => rowSum(s.harv_mat, y));
  let h = `<div class="card card-accent-left">
      <div class="sec-hdr"><span class="hdr-icon">📈</span>&nbsp;${t("sec_tph_chart")}
        <span style="margin-left:auto;"><button class="btn-dl" onclick="downloadCsv('tph')">${t("btn_dl")}</button></span></div>
      <canvas id="c_tph"></canvas></div>
    <div class="card card-accent-left">
      <div class="sec-hdr"><span class="hdr-icon">📋</span> ${t("sec_tph_table")}</div>
      <div style="overflow-x:auto;max-height:420px;overflow-y:auto;">
      <table class="res-table"><thead><tr><th>${t("th_year")}</th>` +
      DBH_CLASSES.map(c => `<th>${c} cm</th>`).join("") +
      `<th>${t("th_total_tph")}</th><th>${t("th_harv_tph")}</th><th>${t("th_harvest")}</th></tr></thead><tbody>` +
      years.map(y => `<tr class="${isH(y) ? "harvest-row" : ""}"><td>${t("th_year")} ${y}</td>` +
        s.tph_mat[y].map(v => `<td>${fmt(v,1)}</td>`).join("") +
        `<td style="font-weight:700;">${fmt(totalTph[y],1)}</td>` +
        `<td style="color:#F6BE9A;font-weight:600;">${fmt(totalHarv[y],1)}</td>` +
        `<td>${harvestMark(isH(y))}</td></tr>`).join("") +
      `</tbody></table></div></div>`;
  document.getElementById("sub-tph").innerHTML = h;
  lineChart("c_tph", t("tph_chart_label"), t("tph_y"), years, totalTph, hy, "rgba(209,172,0,1)");

  // ── Basal area ──────────────────────────────────────────────────────────
  const totalBa = years.map(y => rowSum(s.ba_mat, y));
  document.getElementById("sub-ba").innerHTML = deltaTable(
    "ba", "📐", t("sec_ba_chart"), t("sec_ba_table"),
    "card-accent-purple", years, totalBa, hy, 4, t("th_ba"));
  lineChart("c_ba", t("ba_chart_label"), t("ba_y"), years, totalBa, hy, "rgba(246,190,154,1)");

  // ── Biomass ─────────────────────────────────────────────────────────────
  const totalAgb = years.map(y => rowSum(s.agb_mat, y));
  document.getElementById("sub-agb").innerHTML = deltaTable(
    "agb", "🌿", t("sec_agb_chart"), t("sec_agb_table"),
    "card-accent-green", years, totalAgb, hy, 3, T[LANG].th_agb(s.gec));
  lineChart("c_agb", t("agb_chart_label"), t("agb_y"), years, totalAgb, hy, "rgba(0,197,185,1)");

  // ── Diversity ────────────────────────────────────────────────────────────
  let dv = `<div class="card card-accent-left">
      <div class="sec-hdr"><span class="hdr-icon">📈</span> ${t("sec_s1_chart")}
        <span style="margin-left:auto;"><button class="btn-dl" onclick="downloadCsv('div')">${t("btn_dl")}</button></span></div>
      <canvas id="c_s1"></canvas></div>
    <div class="card card-accent-purple">
      <div class="sec-hdr"><span class="hdr-icon">📉</span> ${t("sec_s2_chart")}</div>
      <canvas id="c_s2"></canvas></div>
    <div class="card card-accent-orange">
      <div class="sec-hdr"><span class="hdr-icon">📋</span> ${t("sec_div_table")}</div>
      <div style="overflow-x:auto;max-height:460px;overflow-y:auto;">
      <table class="res-table"><thead><tr><th>${t("th_year")}</th><th>${t("th_s1")}</th><th>${t("th_s2")}</th><th>${t("th_harvest")}</th></tr></thead><tbody>` +
      years.map(y => `<tr class="${isH(y) ? "harvest-row" : ""}"><td>${t("th_year")} ${y}</td>` +
        `<td>${fmt(s.s1_vec[y],5)}</td><td>${fmt(s.s2_vec[y],5)}</td><td>${harvestMark(isH(y))}</td></tr>`).join("") +
      `</tbody></table></div></div>`;
  document.getElementById("sub-div").innerHTML = dv;
  lineChart("c_s1", t("s1_label"), t("s1_y"), years, s.s1_vec, hy, "rgba(209,172,0,1)");
  lineChart("c_s2", t("s2_label"), t("s2_y"), years, s.s2_vec, hy, "rgba(246,190,154,1)");
}

// A "total + change + % change" table (basal area / biomass share this shape).
function deltaTable(key, icon, chartTitle, tableTitle, accent, years, total, hy, digits, yLabel) {
  const isH = (y) => hy.includes(y);
  let rows = years.map(y => {
    const prev = y === 0 ? NaN : total[y - 1];
    const chg = y === 0 ? NaN : total[y] - prev;
    const pct = (y === 0 || isNaN(prev) || prev === 0) ? NaN : Math.round((total[y] - prev) / prev * 1e4) / 100;
    const col = (isNaN(chg) || chg >= 0) ? "#00C5B8" : "#E07878";
    return `<tr class="${isH(y) ? "harvest-row" : ""}"><td>${t("th_year")} ${y}</td>
      <td>${fmt(total[y], digits)}</td>
      <td style="color:${col};font-weight:600;">${isNaN(chg) ? "—" : (chg >= 0 ? "+" : "") + fmt(chg, digits)}</td>
      <td style="color:${col};">${isNaN(pct) ? "—" : (pct >= 0 ? "+" : "") + pct + "%"}</td>
      <td>${harvestMark(isH(y))}</td></tr>`;
  }).join("");
  return `<div class="card ${accent}">
      <div class="sec-hdr"><span class="hdr-icon">${icon}</span> ${chartTitle}
        <span style="margin-left:auto;"><button class="btn-dl" onclick="downloadCsv('${key}')">${t("btn_dl")}</button></span></div>
      <canvas id="c_${key}"></canvas></div>
    <div class="card ${accent}">
      <div class="sec-hdr"><span class="hdr-icon">📋</span> ${tableTitle}</div>
      <div style="overflow-x:auto;max-height:420px;overflow-y:auto;">
      <table class="res-table"><thead><tr><th>${t("th_year")}</th><th>${yLabel}</th><th>${t("th_change")}</th><th>${t("th_pct")}</th><th>${t("th_harvest")}</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

// ── CSV downloads (native Save As via Rust, with a Blob fallback) ────────────
function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function toCsv(rows) { return rows.map(r => r.join(",")).join("\n"); }

async function saveCsv(name, csv) {
  try {
    const path = await invoke("save_text_file", { defaultName: name, contents: csv });
    if (path) console.log("Saved", path);
  } catch (e) {
    // Fallback: browser download.
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
  }
}

window.downloadCsv = function (which) {
  if (!SIM) return;
  const s = SIM, years = [...Array(s.sim_l + 1).keys()];
  const hy = s.harvest_years, hflag = (y) => hy.includes(y) ? 1 : 0;
  let rows, name;

  if (which === "tph") {
    name = `tph_results_${stamp()}.csv`;
    const head = ["Year", ...DBH_CLASSES.map(c => `TPH_${c}`), "Total_TPH",
      ...DBH_CLASSES.map(c => `Harv_${c}`), "Total_Harvested", "Harvest_Year"];
    rows = [head, ...years.map(y => [y,
      ...s.tph_mat[y].map(v => v.toFixed(4)), rowSum(s.tph_mat, y).toFixed(4),
      ...s.harv_mat[y].map(v => v.toFixed(4)), rowSum(s.harv_mat, y).toFixed(4), hflag(y)])];
  } else if (which === "ba") {
    name = `ba_results_${stamp()}.csv`;
    rows = [["Year", "Total_BA_m2ha", "Harvest_Year"],
      ...years.map(y => [y, rowSum(s.ba_mat, y).toFixed(4), hflag(y)])];
  } else if (which === "agb") {
    name = `agb_results_${stamp()}.csv`;
    rows = [["Year", "Total_AGB_Mgha", "GEC", "Harvest_Year"],
      ...years.map(y => [y, rowSum(s.agb_mat, y).toFixed(4), s.gec, hflag(y)])];
  } else if (which === "div") {
    name = `diversity_results_${stamp()}.csv`;
    rows = [["Year", "Shannon_S1", "Simpson_S2", "Harvest_Year"],
      ...years.map(y => [y, s.s1_vec[y].toFixed(6), s.s2_vec[y].toFixed(6), hflag(y)])];
  } else return;

  saveCsv(name, toCsv(rows));
};

// "Get Input Data": matched plot row + the entered initial (D) and target (TG) vectors.
document.getElementById("get_input_data").addEventListener("click", async () => {
  const lat = parseFloat(document.getElementById("lat").value);
  const lon = parseFloat(document.getElementById("lon").value);
  const iv = readVec("init"), tv = readVec("tgt");
  let head = [], vals = [];
  if (!isNaN(lat) && !isNaN(lon)) {
    try {
      const r = await invoke("find_nearest", { lat, lon });
      head = r.matched_headers.slice(); vals = r.matched_values.slice();
    } catch (_) { head = ["LAT", "LON"]; vals = [lat, lon]; }
  } else { head = ["LAT", "LON"]; vals = [lat, lon]; }
  for (let i = 1; i <= N_DBH; i++) head.push(`D${i}`);
  iv.forEach(v => vals.push(v));
  for (let i = 1; i <= N_DBH; i++) head.push(`TG${i}`);
  tv.forEach(v => vals.push(v));
  saveCsv(`matrixpro_input_${stamp()}.csv`, toCsv([head, vals]));
});

// ── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  applyLang();
  buildStandTables();
  setInitMode("manual");
  setTgtMode("manual");
  initMap();
  try {
    const info = await invoke("init_data");
    APP_STATUS = "ready"; APP_PLOTS = info.plots;
    document.getElementById("status_text").textContent = T[LANG].ready(info.plots);
    console.log("Recruitment model vars:", info.vars_recruitment);
    console.log("Upgrowth model vars:", info.vars_upgrowth);
    console.log("Mortality model vars:", info.vars_mortality);
  } catch (err) {
    APP_STATUS = "error";
    document.getElementById("status_text").textContent = t("data_error");
    alert("Could not load data files:\n\n" + err +
      "\n\nMake sure perudata.csv and the three model_*.json files are in src-tauri/data/.");
  }
}
window.addEventListener("DOMContentLoaded", start);
