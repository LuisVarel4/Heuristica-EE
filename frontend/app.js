const API = "";
const COOLDOWN_KEY = "heuristica_cooldown";
const REFRESH_COOLDOWN_KEY = "heuristica_refresh_cooldown";
const EMAIL_KEY = "heuristica_email";
const ALIAS_KEY = "heuristica_alias";
const REFRESH_COOLDOWN_MS = 3000;
const UNAL_EMAIL_RE = /^[^\s@]+@unal\.edu\.co$/i;

const form = document.getElementById("submit-form");
const emailInput = document.getElementById("email");
const aliasInput = document.getElementById("alias");
const submitBtn = document.getElementById("submit-btn");
const cooldownMsg = document.getElementById("cooldown-msg");
const formError = document.getElementById("form-error");
const formSuccess = document.getElementById("form-success");
const leaderboardBody = document.getElementById("leaderboard-body");
const refreshBtn = document.getElementById("refresh-btn");

let cooldownTimer = null;
let refreshCooldownTimer = null;
let refreshAvailableAt = 0;
let autoRefreshTimer = null;
const DECIMALS = 12;
const MAX_MU_POR_GENERACIONES = 10000;

const muInput = document.getElementById("mu");
const generacionesInput = document.getElementById("generaciones");
const paramWarn = document.getElementById("param-warn");

function loadStoredEmail() {
  const saved = localStorage.getItem(EMAIL_KEY);
  if (saved) emailInput.value = saved;
  const savedAlias = localStorage.getItem(ALIAS_KEY);
  if (savedAlias) aliasInput.value = savedAlias;
}

function saveEmail(email) {
  localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
}

function saveAlias(alias) {
  localStorage.setItem(ALIAS_KEY, alias.trim());
}

function isUnalEmail(email) {
  return UNAL_EMAIL_RE.test(email.trim());
}

function getStoredCooldown() {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredCooldown(email, nextSubmitAt) {
  localStorage.setItem(
    COOLDOWN_KEY,
    JSON.stringify({ email: email.trim().toLowerCase(), nextSubmitAt })
  );
}

function setSubmitCooldown(active, leftSeconds) {
  submitBtn.disabled = active || !isParamProductWithinLimit();
  submitBtn.textContent = active ? `Esperar (${leftSeconds}s)` : "Ejecutar y enviar";
}

function getParamProduct() {
  const mu = Number(muInput.value);
  const generaciones = Number(generacionesInput.value);
  if (!Number.isInteger(mu) || !Number.isInteger(generaciones) || mu < 1 || generaciones < 1) {
    return null;
  }
  return mu * generaciones;
}

function isParamProductWithinLimit() {
  const product = getParamProduct();
  if (product === null) return true;
  return product <= MAX_MU_POR_GENERACIONES;
}

function updateParamLimitWarning() {
  const product = getParamProduct();
  if (product === null || product <= MAX_MU_POR_GENERACIONES) {
    paramWarn.hidden = true;
  } else {
    paramWarn.hidden = false;
    paramWarn.textContent =
      `μ × generaciones debe ser ≤ ${MAX_MU_POR_GENERACIONES.toLocaleString("es-CO")}. ` +
      `Valor actual: ${product.toLocaleString("es-CO")}. Ajusta μ o generaciones antes de enviar.`;
  }
  if (!cooldownTimer) {
    submitBtn.disabled = !isParamProductWithinLimit();
  }
}

function clearCooldownUi() {
  cooldownMsg.hidden = true;
  setSubmitCooldown(false, 0);
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

function isRefreshOnCooldown() {
  return Date.now() < refreshAvailableAt;
}

function updateRefreshButton() {
  const left = Math.max(0, Math.ceil((refreshAvailableAt - Date.now()) / 1000));
  if (left <= 0) {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Actualizar";
    if (refreshCooldownTimer) {
      clearInterval(refreshCooldownTimer);
      refreshCooldownTimer = null;
    }
    localStorage.removeItem(REFRESH_COOLDOWN_KEY);
    return;
  }
  refreshBtn.disabled = true;
  refreshBtn.textContent = `Actualizar (${left}s)`;
}

function startRefreshCooldown() {
  refreshAvailableAt = Date.now() + REFRESH_COOLDOWN_MS;
  localStorage.setItem(REFRESH_COOLDOWN_KEY, String(refreshAvailableAt));
  updateRefreshButton();
  if (refreshCooldownTimer) clearInterval(refreshCooldownTimer);
  refreshCooldownTimer = setInterval(updateRefreshButton, 200);
}

function applyStoredRefreshCooldown() {
  const raw = localStorage.getItem(REFRESH_COOLDOWN_KEY);
  if (!raw) return;
  refreshAvailableAt = Number(raw);
  if (!Number.isFinite(refreshAvailableAt) || Date.now() >= refreshAvailableAt) {
    localStorage.removeItem(REFRESH_COOLDOWN_KEY);
    return;
  }
  updateRefreshButton();
  if (refreshCooldownTimer) clearInterval(refreshCooldownTimer);
  refreshCooldownTimer = setInterval(updateRefreshButton, 200);
}

function showCooldown(remainingSeconds, nextSubmitAt) {
  const update = () => {
    const target = new Date(nextSubmitAt).getTime();
    const left = Math.max(0, Math.ceil((target - Date.now()) / 1000));
    if (left <= 0) {
      clearCooldownUi();
      localStorage.removeItem(COOLDOWN_KEY);
      return;
    }
    cooldownMsg.hidden = false;
    cooldownMsg.textContent = `Espera ${left}s antes de enviar otra solución (el servidor también valida esto).`;
    setSubmitCooldown(true, left);
  };
  update();
  cooldownTimer = setInterval(update, 500);
}

async function syncCooldownFromServer(email) {
  if (!email) return;
  const params = new URLSearchParams({ email: email.trim().toLowerCase() });
  const res = await fetch(`${API}/api/cooldown?${params}`);
  if (!res.ok) return;
  const data = await res.json();
  if (!data.can_submit && data.next_submit_at) {
    setStoredCooldown(email, data.next_submit_at);
    showCooldown(data.remaining_seconds, data.next_submit_at);
  }
}

function applyLocalCooldown() {
  const email = emailInput.value.trim().toLowerCase();
  const stored = getStoredCooldown();
  if (!stored || stored.email !== email) return false;
  const target = new Date(stored.nextSubmitAt).getTime();
  if (Date.now() >= target) {
    localStorage.removeItem(COOLDOWN_KEY);
    return false;
  }
  const left = Math.ceil((target - Date.now()) / 1000);
  showCooldown(left, stored.nextSubmitAt);
  return true;
}

function hideMessages() {
  formError.hidden = true;
  formSuccess.hidden = true;
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
  formSuccess.hidden = true;
}

function showSuccess(message) {
  formSuccess.textContent = message;
  formSuccess.hidden = false;
  formError.hidden = true;
}

function formatDecimal(value, digits = DECIMALS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs < 1e-8 || abs >= 1e10) return n.toExponential(Math.max(6, digits - 4));
  return n.toFixed(digits);
}

function formatRank(rank) {
  if (rank === 1) return "🏆 🥇";
  if (rank === 2) return "🏆 🥈";
  if (rank === 3) return "🏆 🥉";
  return String(rank);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatParam(value) {
  if (value === null || value === undefined) return "—";
  return value;
}

async function loadLeaderboard() {
  leaderboardBody.innerHTML = `<tr><td colspan="8" class="muted">Cargando…</td></tr>`;
  try {
    const viewer = emailInput.value.trim().toLowerCase();
    const params = new URLSearchParams({ _t: String(Date.now()) });
    if (viewer) params.set("viewer_email", viewer);
    const res = await fetch(`${API}/api/leaderboard?${params}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) throw new Error("No se pudo cargar el leaderboard");
    const data = await res.json();
    if (!data.entries.length) {
      leaderboardBody.innerHTML = `<tr><td colspan="8" class="muted">Sin envíos aún</td></tr>`;
      return;
    }
    leaderboardBody.innerHTML = data.entries
      .map((row) => {
        const rankClass = row.rank <= 3 ? `top-${row.rank}` : "";
        return `
          <tr class="${rankClass}">
            <td class="rank-cell">${formatRank(row.rank)}</td>
            <td>${row.alias}</td>
            <td>${formatParam(row.mu)}</td>
            <td>${formatParam(row.sigma)}</td>
            <td>${formatParam(row.generaciones)}</td>
            <td>${formatDecimal(row.solucion)}</td>
            <td>${formatDecimal(row.fitness)}</td>
            <td>${formatTime(row.created_at)}</td>
          </tr>`;
      })
      .join("");
  } catch (err) {
    leaderboardBody.innerHTML = `<tr><td colspan="8" class="muted">${err.message}</td></tr>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessages();

  const email = emailInput.value.trim();
  const alias = aliasInput.value.trim();
  const mu = Number(muInput.value);
  const sigma = Number(document.getElementById("sigma").value);
  const generaciones = Number(generacionesInput.value);

  if (!email) {
    showError("Ingresa tu correo.");
    return;
  }
  if (!isUnalEmail(email)) {
    showError("El correo debe ser del dominio @unal.edu.co (ej. nombre.apellido@unal.edu.co).");
    return;
  }
  if (!alias) {
    showError("Ingresa un alias para el leaderboard.");
    return;
  }
  if (mu < 1 || generaciones < 1 || !Number.isFinite(mu) || !Number.isFinite(generaciones)) {
    showError("μ y generaciones deben ser enteros ≥ 1 (sin negativos).");
    return;
  }
  if (sigma <= 0 || !Number.isFinite(sigma)) {
    showError("σ debe ser mayor que 0 (sin negativos ni cero).");
    return;
  }
  if (!Number.isInteger(mu) || !Number.isInteger(generaciones)) {
    showError("μ y generaciones deben ser números enteros.");
    return;
  }
  const producto = mu * generaciones;
  if (producto > MAX_MU_POR_GENERACIONES) {
    updateParamLimitWarning();
    showError(
      `μ × generaciones debe ser ≤ ${MAX_MU_POR_GENERACIONES.toLocaleString("es-CO")} ` +
        `(actual: ${producto.toLocaleString("es-CO")}). Ajusta los parámetros antes de enviar.`
    );
    return;
  }
  saveEmail(email);
  saveAlias(alias);
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, alias, mu, sigma, generaciones }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 403) {
      const msg = typeof data.detail === "string" ? data.detail : "No autorizado.";
      showError(msg);
      submitBtn.disabled = false;
      return;
    }
    if (res.status === 429) {
      const detail = data.detail || {};
      const next = detail.next_submit_at;
      if (next) {
        setStoredCooldown(email, next);
        showCooldown(detail.remaining_seconds ?? 30, next);
      }
      showError("Debes esperar 30 segundos entre envíos.");
      return;
    }

    if (!res.ok) {
      const msg = typeof data.detail === "string" ? data.detail : data.detail?.message || "Error al enviar";
      showError(msg);
      applyLocalCooldown();
      if (!getStoredCooldown()) updateParamLimitWarning();
      return;
    }

    setStoredCooldown(email, data.next_submit_at);
    showCooldown(data.cooldown_seconds, data.next_submit_at);
    let successText = `Resultado: solución = ${formatDecimal(data.solucion)}, fitness = ${formatDecimal(data.fitness)}`;
    if (data.mensaje) successText += ` — ${data.mensaje}`;
    if (data.is_new_best) {
      successText += " — ¡Nuevo récord personal en el leaderboard!";
    } else {
      successText += " — Envío guardado; en el leaderboard sigue tu mejor fitness anterior (menor = mejor).";
    }
    showSuccess(successText);
    await loadLeaderboard();
  } catch {
    showError("Error de red. Intenta de nuevo.");
    if (!cooldownTimer) updateParamLimitWarning();
  }
});

emailInput.addEventListener("change", () => {
  saveEmail(emailInput.value);
  clearCooldownUi();
  applyLocalCooldown();
  syncCooldownFromServer(emailInput.value);
  loadLeaderboard();
});

emailInput.addEventListener("input", () => {
  saveEmail(emailInput.value);
});

aliasInput.addEventListener("input", () => {
  saveAlias(aliasInput.value);
});

function onParamInput() {
  hideMessages();
  updateParamLimitWarning();
}

muInput.addEventListener("input", onParamInput);
muInput.addEventListener("change", onParamInput);
generacionesInput.addEventListener("input", onParamInput);
generacionesInput.addEventListener("change", onParamInput);

refreshBtn.addEventListener("click", async () => {
  if (isRefreshOnCooldown()) return;
  await loadLeaderboard();
  startRefreshCooldown();
});

loadStoredEmail();
updateParamLimitWarning();
applyLocalCooldown();
applyStoredRefreshCooldown();
syncCooldownFromServer(emailInput.value);
loadLeaderboard();
autoRefreshTimer = setInterval(() => {
  if (!isRefreshOnCooldown()) loadLeaderboard();
}, 15000);
