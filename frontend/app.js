const API = "";
const COOLDOWN_KEY = "heuristica_cooldown";
const EMAIL_KEY = "heuristica_email";

const form = document.getElementById("submit-form");
const emailInput = document.getElementById("email");
const submitBtn = document.getElementById("submit-btn");
const cooldownMsg = document.getElementById("cooldown-msg");
const formError = document.getElementById("form-error");
const formSuccess = document.getElementById("form-success");
const leaderboardBody = document.getElementById("leaderboard-body");
const refreshBtn = document.getElementById("refresh-btn");

let cooldownTimer = null;

function loadStoredEmail() {
  const saved = localStorage.getItem(EMAIL_KEY);
  if (saved) emailInput.value = saved;
}

function saveEmail(email) {
  localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
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

function clearCooldownUi() {
  cooldownMsg.hidden = true;
  submitBtn.disabled = false;
  submitBtn.textContent = "Ejecutar y enviar";
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

function showCooldown(remainingSeconds, nextSubmitAt) {
  submitBtn.disabled = true;
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
    submitBtn.textContent = `Esperar (${left}s)`;
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

function formatNumber(value, digits = 6) {
  return Number(value).toFixed(digits);
}

function formatTime(iso) {
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return iso;
  }
}

async function loadLeaderboard() {
  leaderboardBody.innerHTML = `<tr><td colspan="8" class="muted">Cargando…</td></tr>`;
  try {
    const res = await fetch(`${API}/api/leaderboard`);
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
            <td>${row.rank}</td>
            <td>${row.email}</td>
            <td>${row.mu}</td>
            <td>${row.sigma}</td>
            <td>${row.generaciones}</td>
            <td>${formatNumber(row.solucion)}</td>
            <td>${formatNumber(row.fitness)}</td>
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
  const mu = Number(document.getElementById("mu").value);
  const sigma = Number(document.getElementById("sigma").value);
  const generaciones = Number(document.getElementById("generaciones").value);

  if (!email) {
    showError("Ingresa tu correo.");
    return;
  }

  saveEmail(email);
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, mu, sigma, generaciones }),
    });
    const data = await res.json().catch(() => ({}));

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
      if (!getStoredCooldown()) submitBtn.disabled = false;
      return;
    }

    setStoredCooldown(email, data.next_submit_at);
    showCooldown(data.cooldown_seconds, data.next_submit_at);
    showSuccess(
      `Resultado: solución ≈ ${formatNumber(data.solucion)}, fitness = ${formatNumber(data.fitness)}`
    );
    await loadLeaderboard();
  } catch {
    showError("Error de red. Intenta de nuevo.");
    submitBtn.disabled = false;
  }
});

emailInput.addEventListener("change", () => {
  saveEmail(emailInput.value);
  clearCooldownUi();
  applyLocalCooldown();
  syncCooldownFromServer(emailInput.value);
});

refreshBtn.addEventListener("click", loadLeaderboard);

loadStoredEmail();
applyLocalCooldown();
syncCooldownFromServer(emailInput.value);
loadLeaderboard();
setInterval(loadLeaderboard, 15000);
