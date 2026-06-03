const API = "";
const SESSION_KEY = "heuristica_admin_key";

const COLORS = {
  accent: "#3d8bfd", ok: "#3dd68c", warn: "#f5a524",
  muted: "#8b9cb3", grid: "#2d3a4f", faint: "#3a4760",
};

// Misma función objetivo que evolution.py (replicada para dibujarla).
function fitness(x) {
  return (
    0.25 * (x - 2.1) ** 2 +
    Math.sin(2.8 * x) +
    0.6 * Math.cos(4.2 * x) +
    0.15 * Math.sin(1.7 * x + 1.2) ** 2
  );
}

// ── Elementos ──────────────────────────────────────────────────────────────
const adminKeyInput = document.getElementById("admin-key");
const loadBtn       = document.getElementById("load-btn");
const authError     = document.getElementById("auth-error");
const authSection   = document.getElementById("auth-section");
const panel         = document.getElementById("panel");
const btnRun        = document.getElementById("btn-run");
const runMsg        = document.getElementById("run-msg");
const results       = document.getElementById("results");
const runSelect     = document.getElementById("run-select");
const genSlider     = document.getElementById("gen-slider");
const genLabel      = document.getElementById("gen-label");
const btnPlay       = document.getElementById("btn-play");

const statGlobal  = document.getElementById("stat-global");
const statSuccess = document.getElementById("stat-success");
const statX       = document.getElementById("stat-x");
const statFit     = document.getElementById("stat-fit");
const statConv    = document.getElementById("stat-conv");

const chartFit    = document.getElementById("chart-fit");
const chartSigma  = document.getElementById("chart-sigma");
const chartPop    = document.getElementById("chart-pop");

let lastData = null;
let selectedRun = 0;
let playTimer = null;

function getKey() { return adminKeyInput.value.trim(); }

// ── Helpers de formato ───────────────────────────────────────────────────
function fmt(v) {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return String(Math.round(v * 1e6) / 1e6);
}

function makeScale(d0, d1, r0, r1) {
  const span = (d1 - d0) || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

// ── Gráfica de líneas genérica (convergencia y σ) ──────────────────────────
function plotLines(canvas, { series, xLabel, yRef, yLog }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const padL = 60, padR = 14, padT = 14, padB = 34;
  ctx.clearRect(0, 0, W, H);

  const allX = [], allY = [];
  series.forEach((s) => s.points.forEach((p) => { allX.push(p.x); allY.push(p.y); }));
  if (yRef != null) allY.push(yRef);
  if (!allY.length) return;

  const ty = yLog ? (v) => Math.log10(Math.max(v, 1e-12)) : (v) => v;
  const xmin = Math.min(...allX), xmax = Math.max(...allX);
  let tymin = Math.min(...allY.map(ty)), tymax = Math.max(...allY.map(ty));
  const yspan = (tymax - tymin) || 1;
  tymin -= yspan * 0.06; tymax += yspan * 0.06;

  const sx = makeScale(xmin, xmax, padL, W - padR);
  const sy = makeScale(tymin, tymax, H - padB, padT);

  ctx.font = "11px system-ui";
  // Grid + etiquetas Y
  ctx.textBaseline = "middle"; ctx.textAlign = "right";
  for (let i = 0; i <= 5; i++) {
    const tv = tymin + (tymax - tymin) * (i / 5);
    const py = sy(tv);
    ctx.strokeStyle = COLORS.grid; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(W - padR, py); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = COLORS.muted;
    const label = yLog ? "1e" + (Math.round(tv * 10) / 10) : fmt(tv);
    ctx.fillText(label, padL - 6, py);
  }
  // Etiquetas X
  ctx.textBaseline = "top"; ctx.textAlign = "center"; ctx.fillStyle = COLORS.muted;
  for (let i = 0; i <= 6; i++) {
    const xv = xmin + (xmax - xmin) * (i / 6);
    ctx.fillText(Math.round(xv), sx(xv), H - padB + 6);
  }
  // Línea de referencia (óptimo global)
  if (yRef != null) {
    const py = sy(ty(yRef));
    ctx.strokeStyle = COLORS.warn; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(W - padR, py); ctx.stroke();
    ctx.setLineDash([]);
  }
  // Series
  series.forEach((s) => {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.globalAlpha = s.alpha ?? 1;
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const px = sx(p.x), py = sy(ty(p.y));
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke(); ctx.globalAlpha = 1;
  });
  // Etiqueta eje X
  ctx.fillStyle = COLORS.muted; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText(xLabel, (padL + W - padR) / 2, H - 1);
}

// ── Gráfica de población sobre f(x) ────────────────────────────────────────
function plotPopulation(canvas, genData, globalX) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const padL = 56, padR = 16, padT = 16, padB = 34;
  ctx.clearRect(0, 0, W, H);

  const N = 500, curve = [];
  for (let i = 0; i <= N; i++) {
    const x = -10 + (20 * i) / N;
    curve.push({ x, y: fitness(x) });
  }
  const ymin = Math.min(...curve.map((p) => p.y));
  const ymax = Math.max(...curve.map((p) => p.y));
  const sx = makeScale(-10, 10, padL, W - padR);
  const sy = makeScale(ymin - 0.5, ymax + 0.5, H - padB, padT);

  // Grid + ejes
  ctx.font = "11px system-ui";
  ctx.textBaseline = "middle"; ctx.textAlign = "right"; ctx.fillStyle = COLORS.muted;
  for (let i = 0; i <= 5; i++) {
    const yv = (ymin - 0.5) + (ymax - ymin + 1) * (i / 5);
    const py = sy(yv);
    ctx.strokeStyle = COLORS.grid; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(W - padR, py); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillText(fmt(yv), padL - 6, py);
  }
  ctx.textBaseline = "top"; ctx.textAlign = "center";
  for (let x = -10; x <= 10; x += 2) ctx.fillText(x, sx(x), H - padB + 6);

  // Curva f(x)
  ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2; ctx.beginPath();
  curve.forEach((p, i) => { const px = sx(p.x), py = sy(p.y); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();

  // Marcador del óptimo global
  ctx.strokeStyle = COLORS.warn; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx(globalX), padT); ctx.lineTo(sx(globalX), H - padB); ctx.stroke();
  ctx.setLineDash([]);

  // Individuos
  if (genData) {
    ctx.fillStyle = COLORS.ok;
    genData.poblacion.forEach((x) => {
      ctx.beginPath(); ctx.arc(sx(x), sy(fitness(x)), 4, 0, Math.PI * 2); ctx.fill();
    });
  }
  ctx.fillStyle = COLORS.muted; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.fillText("x", (padL + W - padR) / 2, H - 1);
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderCharts() {
  if (!lastData) return;
  const runs = lastData.runs;
  const gfit = lastData.global_optimum.fitness;

  // Convergencia: todas las corridas grises + seleccionada en azul
  plotLines(chartFit, {
    xLabel: "generación",
    yRef: gfit,
    series: runs.map((r, i) => ({
      points: r.history.map((h) => ({ x: h.gen, y: h.best_fitness })),
      color: i === selectedRun ? COLORS.accent : COLORS.faint,
      width: i === selectedRun ? 2.5 : 1,
      alpha: i === selectedRun ? 1 : 0.4,
    })),
  });

  // σ: escala log, seleccionada en verde
  plotLines(chartSigma, {
    xLabel: "generación",
    yLog: true,
    series: runs.map((r, i) => ({
      points: r.history.map((h) => ({ x: h.gen, y: h.mean_sigma })),
      color: i === selectedRun ? COLORS.ok : COLORS.faint,
      width: i === selectedRun ? 2.5 : 1,
      alpha: i === selectedRun ? 1 : 0.4,
    })),
  });

  // Población: corrida seleccionada, generación del slider
  const run = runs[selectedRun];
  const gen = Math.min(Number(genSlider.value), run.history.length - 1);
  plotPopulation(chartPop, run.history[gen], lastData.global_optimum.x);
  genLabel.textContent = `Gen ${run.history[gen].gen}`;
}

function selectRun(i) {
  stopPlay();
  selectedRun = i;
  const run = lastData.runs[i];
  genSlider.max = run.history.length - 1;
  genSlider.value = run.history.length - 1; // arranca mostrando el final
  statX.textContent = fmt(run.best_x);
  statFit.textContent = fmt(run.best_fitness);
  statConv.innerHTML = run.converged
    ? `<span class="pill pill-ok">✓ óptimo global</span>`
    : `<span class="pill pill-bad">✗ mínimo local</span>`;
  renderCharts();
}

function renderResults(data) {
  lastData = data;
  const g = data.global_optimum;
  statGlobal.textContent = `x=${fmt(g.x)}  ·  f=${fmt(g.fitness)}`;
  const pct = Math.round(data.success_rate * 100);
  statSuccess.innerHTML =
    `${pct}% <span style="font-size:0.8rem;color:var(--muted)">(${data.runs.filter(r=>r.converged).length}/${data.runs.length} corridas)</span>`;

  runSelect.innerHTML = data.runs
    .map((r, i) => `<option value="${i}">Corrida ${i + 1}${r.converged ? " ✓" : " ✗"}</option>`)
    .join("");

  results.hidden = false;
  selectRun(0);
}

// ── Animación ──────────────────────────────────────────────────────────────
function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; btnPlay.textContent = "▶ Animar"; }
}

function startPlay() {
  if (!lastData) return;
  const max = Number(genSlider.max);
  genSlider.value = 0;
  btnPlay.textContent = "⏸ Pausar";
  playTimer = setInterval(() => {
    let v = Number(genSlider.value);
    if (v >= max) { stopPlay(); return; }
    genSlider.value = v + 1;
    renderCharts();
  }, 120);
}

// ── Ejecución ────────────────────────────────────────────────────────────
async function run() {
  runMsg.hidden = true;
  stopPlay();
  const params = new URLSearchParams({
    key: getKey(),
    mu: document.getElementById("mu").value,
    lambda: document.getElementById("lambda").value,
    rho: document.getElementById("rho").value,
    generaciones: document.getElementById("generaciones").value,
    runs: document.getElementById("runs").value,
  });
  const tau = document.getElementById("tau").value.trim();
  const seed = document.getElementById("seed").value.trim();
  if (tau) params.set("tau", tau);
  if (seed) params.set("seed", seed);

  btnRun.disabled = true; btnRun.textContent = "Ejecutando…";
  try {
    const res = await fetch(`${API}/admin/demo/ee?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      runMsg.textContent = data.detail || "Error al ejecutar.";
      runMsg.style.color = "#ff8888"; runMsg.hidden = false;
      return;
    }
    renderResults(data);
  } catch {
    runMsg.textContent = "Error de red.";
    runMsg.style.color = "#ff8888"; runMsg.hidden = false;
  } finally {
    btnRun.disabled = false; btnRun.textContent = "▶ Ejecutar EE";
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────
async function authenticate() {
  authError.hidden = true;
  // Verifica la key contra un endpoint admin liviano.
  const res = await fetch(`${API}/admin/config?key=${encodeURIComponent(getKey())}`);
  if (res.status === 403 || res.status === 503) {
    authError.textContent = res.status === 503
      ? "Admin key no configurada en el servidor."
      : "Admin key incorrecta.";
    authError.hidden = false;
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  if (!res.ok) { authError.textContent = "Error de autenticación."; authError.hidden = false; return; }
  sessionStorage.setItem(SESSION_KEY, getKey());
  authSection.hidden = true;
  panel.hidden = false;
}

// ── Eventos ────────────────────────────────────────────────────────────────
loadBtn.addEventListener("click", authenticate);
adminKeyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") authenticate(); });
btnRun.addEventListener("click", run);
runSelect.addEventListener("change", (e) => selectRun(Number(e.target.value)));
genSlider.addEventListener("input", () => { stopPlay(); renderCharts(); });
btnPlay.addEventListener("click", () => { playTimer ? stopPlay() : startPlay(); });

// Restaurar sesión
const saved = sessionStorage.getItem(SESSION_KEY);
if (saved) { adminKeyInput.value = saved; authenticate(); }
