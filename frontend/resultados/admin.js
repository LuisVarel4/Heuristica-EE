const API = "";
const ADMIN_KEY_STORAGE = "heuristica_admin_key";
const DECIMALS = 12;

const leaderboardBody = document.getElementById("leaderboard-body");
const refreshBtn = document.getElementById("refresh-btn");
const adminError = document.getElementById("admin-error");

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

function formatRank(rank) {
  if (rank === 1) return "🏆 🥇";
  if (rank === 2) return "🏆 🥈";
  if (rank === 3) return "🏆 🥉";
  return String(rank);
}

function getAdminKey() {
  let key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  if (!key) {
    key = window.prompt("Clave de administrador (ADMIN_KEY en .env):") || "";
    if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
  }
  return key;
}

function showAdminError(message) {
  adminError.textContent = message;
  adminError.hidden = false;
}

function hideAdminError() {
  adminError.hidden = true;
}

async function loadAdminLeaderboard() {
  leaderboardBody.innerHTML = `<tr><td colspan="9" class="muted">Cargando…</td></tr>`;
  hideAdminError();

  const key = getAdminKey();
  const params = new URLSearchParams({ _t: String(Date.now()) });
  if (key) params.set("key", key);

  try {
    const res = await fetch(`${API}/api/leaderboard/admin?${params}`, { cache: "no-store" });
    if (res.status === 403) {
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      showAdminError("Clave incorrecta. Recarga la página e intenta de nuevo.");
      leaderboardBody.innerHTML = `<tr><td colspan="9" class="muted">Acceso denegado</td></tr>`;
      return;
    }
    if (!res.ok) throw new Error("No se pudo cargar el leaderboard admin");

    const data = await res.json();
    if (!data.entries.length) {
      leaderboardBody.innerHTML = `<tr><td colspan="9" class="muted">Sin envíos aún</td></tr>`;
      return;
    }

    leaderboardBody.innerHTML = data.entries
      .map((row) => {
        const rankClass = row.rank <= 3 ? `top-${row.rank}` : "";
        return `
          <tr class="${rankClass}">
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
      })
      .join("");
  } catch (err) {
    leaderboardBody.innerHTML = `<tr><td colspan="9" class="muted">${err.message}</td></tr>`;
  }
}

refreshBtn.addEventListener("click", loadAdminLeaderboard);
loadAdminLeaderboard();
