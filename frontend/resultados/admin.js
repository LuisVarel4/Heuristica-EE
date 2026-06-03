const API = "";
const SESSION_KEY = "heuristica_admin_key";
const DECIMALS = 12;

const adminKeyInput    = document.getElementById("admin-key");
const loadBtn          = document.getElementById("load-btn");
const adminError       = document.getElementById("admin-error");
const authSection      = document.getElementById("auth-section");
const sessionBar       = document.getElementById("session-bar");
const btnLogout        = document.getElementById("btn-logout");
const leaderboardPanel = document.getElementById("leaderboard-panel");
const leaderboardBody  = document.getElementById("leaderboard-body");
const refreshBtn       = document.getElementById("refresh-btn");

function getKey() { return adminKeyInput.value.trim(); }

function formatDecimal(value, digits = DECIMALS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs < 1e-8 || abs >= 1e10) return n.toExponential(Math.max(6, digits - 4));
  return n.toFixed(digits);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      timeZone: "America/Bogota", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return iso; }
}

function formatRank(rank) {
  if (rank === 1) return "🏆 🥇";
  if (rank === 2) return "🏆 🥈";
  if (rank === 3) return "🏆 🥉";
  return String(rank);
}

async function loadAdminLeaderboard() {
  adminError.hidden = true;
  leaderboardBody.innerHTML = `<tr><td colspan="9" class="muted">Cargando…</td></tr>`;

  const params = new URLSearchParams({ key: getKey(), _t: String(Date.now()) });
  const res = await fetch(`${API}/api/leaderboard/admin?${params}`, { cache: "no-store" });

  if (res.status === 403 || res.status === 503) {
    adminError.textContent = res.status === 503
      ? "Admin key no configurada en el servidor."
      : "Admin key incorrecta.";
    adminError.hidden = false;
    leaderboardPanel.hidden = true;
    authSection.hidden = false;
    sessionBar.hidden  = true;
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  if (!res.ok) {
    adminError.textContent = "Error al cargar el leaderboard.";
    adminError.hidden = false;
    return;
  }

  sessionStorage.setItem(SESSION_KEY, getKey());
  authSection.hidden       = true;
  sessionBar.hidden        = false;
  sessionBar.style.display = "flex";
  leaderboardPanel.hidden  = false;

  const data = await res.json();
  if (!data.entries.length) {
    leaderboardBody.innerHTML = `<tr><td colspan="9" class="muted">Sin envíos aún</td></tr>`;
    return;
  }
  leaderboardBody.innerHTML = data.entries.map((row) => {
    const rankClass = row.rank <= 3 ? `top-${row.rank}` : "";
    return `<tr class="${rankClass}">
      <td class="rank-cell">${formatRank(row.rank)}</td>
      <td>${row.alias}</td>
      <td>${row.email}</td>
      <td>${row.mu}</td>
      <td>${row.sigma}</td>
      <td>${row.generaciones}</td>
      <td>${formatDecimal(row.solucion)}</td>
      <td>${formatDecimal(row.fitness)}</td>
      <td>${formatTime(row.created_at)}</td>
    </tr>`;
  }).join("");
}

loadBtn.addEventListener("click", loadAdminLeaderboard);
adminKeyInput.addEventListener("keydown", e => { if (e.key === "Enter") loadAdminLeaderboard(); });
refreshBtn.addEventListener("click", loadAdminLeaderboard);

btnLogout.addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  adminKeyInput.value = "";
  authSection.hidden = false;
  sessionBar.hidden  = true;
  leaderboardPanel.hidden = true;
  adminError.hidden = true;
});

// Restaurar sesión
const saved = sessionStorage.getItem(SESSION_KEY);
if (saved) { adminKeyInput.value = saved; loadAdminLeaderboard(); }
