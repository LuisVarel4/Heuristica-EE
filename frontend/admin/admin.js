const API = "";

const adminKeyInput = document.getElementById("admin-key");
const loadBtn       = document.getElementById("load-btn");
const authError     = document.getElementById("auth-error");
const configPanel   = document.getElementById("config-panel");
const wlBadge       = document.getElementById("wl-badge");
const wlCount       = document.getElementById("wl-count");
const btnEnable     = document.getElementById("btn-enable");
const btnDisable    = document.getElementById("btn-disable");
const toggleMsg     = document.getElementById("toggle-msg");
const newEmailInput = document.getElementById("new-email");
const btnAdd        = document.getElementById("btn-add");
const addMsg        = document.getElementById("add-msg");
const searchInput   = document.getElementById("search-input");
const btnSearch     = document.getElementById("btn-search");
const searchResult  = document.getElementById("search-result");
const linkLeaderboard = document.getElementById("link-leaderboard");
const linkEmails      = document.getElementById("link-emails");

function getKey() {
  return adminKeyInput.value.trim();
}

function renderBadge(enabled) {
  wlBadge.textContent = enabled ? "ACTIVA" : "DESACTIVADA";
  wlBadge.className   = "badge " + (enabled ? "badge-on" : "badge-off");
}

async function loadConfig() {
  authError.hidden = true;
  const res = await fetch(`${API}/admin/config?key=${encodeURIComponent(getKey())}`);
  if (res.status === 403) {
    authError.textContent = "Admin key incorrecta.";
    authError.hidden = false;
    configPanel.hidden = true;
    return;
  }
  if (!res.ok) {
    authError.textContent = "Error al cargar la configuración.";
    authError.hidden = false;
    return;
  }
  const data = await res.json();
  configPanel.hidden = false;
  renderBadge(data.whitelist_enabled);
  wlCount.textContent = data.whitelist_count;

  // Actualizar enlaces con la key ya incluida
  linkLeaderboard.href = `/resultados/ocultos?key=${encodeURIComponent(getKey())}`;
  linkEmails.href      = `/admin/emails?key=${encodeURIComponent(getKey())}`;
}

async function toggleWhitelist(enabled) {
  toggleMsg.hidden = true;
  const res = await fetch(
    `${API}/admin/config/toggle?key=${encodeURIComponent(getKey())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toggleMsg.textContent = data.detail || "Error al cambiar el estado.";
    toggleMsg.style.color = "#ff8888";
    toggleMsg.hidden = false;
    return;
  }
  renderBadge(data.whitelist_enabled);
  toggleMsg.textContent = `Lista blanca ${data.whitelist_enabled ? "activada" : "desactivada"}.`;
  toggleMsg.style.color = "#6effa0";
  toggleMsg.hidden = false;
}

async function addEmail() {
  addMsg.hidden = true;
  const email = newEmailInput.value.trim();
  if (!email) return;
  const res = await fetch(
    `${API}/admin/config/whitelist?key=${encodeURIComponent(getKey())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    addMsg.textContent = data.detail || "Error al agregar el correo.";
    addMsg.style.color = "#ff8888";
    addMsg.hidden = false;
    return;
  }
  addMsg.textContent = `${data.email} agregado correctamente.`;
  addMsg.style.color = "#6effa0";
  addMsg.hidden = false;
  newEmailInput.value = "";
  await loadConfig();  // refresca el conteo
}

async function searchEmail() {
  searchResult.hidden = true;
  const email = searchInput.value.trim();
  if (!email) return;

  const params = new URLSearchParams({ email, key: getKey() });
  const res = await fetch(`${API}/admin/config/search?${params}`);
  const data = await res.json().catch(() => ({}));

  searchResult.hidden = false;
  if (res.status === 403) {
    searchResult.innerHTML = `<span class="badge badge-missing">Sin acceso</span> Admin key incorrecta.`;
    return;
  }
  if (res.status === 400) {
    searchResult.innerHTML = `<span class="badge badge-missing">Error</span> ${data.detail || "Correo inválido."}`;
    return;
  }
  if (!res.ok) {
    searchResult.innerHTML = `<span class="badge badge-missing">Error</span> No se pudo verificar.`;
    return;
  }

  if (data.in_whitelist) {
    searchResult.innerHTML =
      `<span class="badge badge-found">✓ Habilitado</span>  ${data.email} está en la lista.`;
  } else {
    searchResult.innerHTML =
      `<span class="badge badge-missing">✗ No habilitado</span>  ${data.email} no está en la lista.`;
  }
}

// ── Eventos ──────────────────────────────────────────────────────────────
loadBtn.addEventListener("click", loadConfig);
adminKeyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") loadConfig(); });

btnEnable.addEventListener("click",  () => toggleWhitelist(true));
btnDisable.addEventListener("click", () => toggleWhitelist(false));

btnAdd.addEventListener("click", addEmail);
newEmailInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addEmail(); });

btnSearch.addEventListener("click", searchEmail);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchEmail(); });
