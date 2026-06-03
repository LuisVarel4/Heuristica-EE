const API = "";
const SESSION_KEY = "heuristica_admin_key";

const adminKeyInput = document.getElementById("admin-key");
const loadBtn       = document.getElementById("load-btn");
const authError     = document.getElementById("auth-error");
const authSection   = document.getElementById("auth-section");
const sessionBar    = document.getElementById("session-bar");
const btnLogout     = document.getElementById("btn-logout");
const configPanel   = document.getElementById("config-panel");
const wlBadge       = document.getElementById("wl-badge");
const wlCount       = document.getElementById("wl-count");
const btnEnable     = document.getElementById("btn-enable");
const btnDisable    = document.getElementById("btn-disable");
const toggleMsg     = document.getElementById("toggle-msg");
const searchInput   = document.getElementById("search-input");
const btnSearch     = document.getElementById("btn-search");
const searchResult  = document.getElementById("search-result");
const searchMsg     = document.getElementById("search-msg");
const btnAdd        = document.getElementById("btn-add");
const addMsg        = document.getElementById("add-msg");

function getKey() { return adminKeyInput.value.trim(); }

function saveKey(k) { sessionStorage.setItem(SESSION_KEY, k); }

function renderBadge(enabled) {
  wlBadge.textContent = enabled ? "ACTIVA" : "DESACTIVADA";
  wlBadge.className   = "badge " + (enabled ? "badge-on" : "badge-off");
}

async function loadConfig() {
  authError.hidden = true;
  const res = await fetch(`${API}/admin/config?key=${encodeURIComponent(getKey())}`);
  if (res.status === 403 || res.status === 503) {
    authError.textContent = res.status === 503
      ? "Admin key no configurada en el servidor."
      : "Admin key incorrecta.";
    authError.hidden = false;
    configPanel.hidden = true;
    authSection.hidden = false;
    sessionBar.hidden  = true;
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  if (!res.ok) { authError.textContent = "Error al cargar."; authError.hidden = false; return; }
  const data = await res.json();
  saveKey(getKey());
  authSection.hidden = true;
  sessionBar.hidden  = false;
  configPanel.hidden = false;
  renderBadge(data.whitelist_enabled);
  wlCount.textContent = data.whitelist_count;
}

async function toggleWhitelist(enabled) {
  toggleMsg.hidden = true;
  const res = await fetch(
    `${API}/admin/config/toggle?key=${encodeURIComponent(getKey())}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }) }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toggleMsg.textContent = data.detail || "Error.";
    toggleMsg.style.color = "#ff8888";
    toggleMsg.hidden = false;
    return;
  }
  renderBadge(data.whitelist_enabled);
  toggleMsg.textContent = `Lista blanca ${data.whitelist_enabled ? "activada" : "desactivada"}.`;
  toggleMsg.style.color = "#6effa0";
  toggleMsg.hidden = false;
}

async function searchEmail() {
  searchResult.hidden = true;
  addMsg.hidden = true;
  btnAdd.hidden = true;
  const email = searchInput.value.trim();
  if (!email) return;

  const params = new URLSearchParams({ email, key: getKey() });
  const res = await fetch(`${API}/admin/config/search?${params}`);
  const data = await res.json().catch(() => ({}));

  searchResult.hidden = false;

  if (!res.ok) {
    searchMsg.innerHTML = `<span class="badge badge-missing">Error</span> ${data.detail || "No se pudo verificar."}`;
    return;
  }

  if (data.in_whitelist) {
    searchMsg.innerHTML = `<span class="badge badge-found">✓ Habilitado</span>  ${data.email} ya está en la lista.`;
    btnAdd.hidden = true;
  } else {
    searchMsg.innerHTML = `<span class="badge badge-missing">✗ No habilitado</span>  ${data.email} no está en la lista.`;
    btnAdd.hidden = false;
    btnAdd.dataset.email = data.email;
  }
}

async function addEmail() {
  addMsg.hidden = true;
  const email = btnAdd.dataset.email;
  if (!email) return;

  const res = await fetch(
    `${API}/admin/config/whitelist?key=${encodeURIComponent(getKey())}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }) }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    addMsg.textContent = data.detail || "Error al agregar.";
    addMsg.style.color = "#ff8888";
    addMsg.hidden = false;
    return;
  }
  addMsg.textContent = `${data.email} agregado correctamente.`;
  addMsg.style.color = "#6effa0";
  addMsg.hidden = false;
  btnAdd.hidden = true;
  searchMsg.innerHTML = `<span class="badge badge-found">✓ Habilitado</span>  ${data.email} agregado a la lista.`;
  wlCount.textContent = parseInt(wlCount.textContent) + 1;
}

// ── Eventos ──────────────────────────────────────────────────────────────
loadBtn.addEventListener("click", loadConfig);
adminKeyInput.addEventListener("keydown", e => { if (e.key === "Enter") loadConfig(); });
btnEnable.addEventListener("click",  () => toggleWhitelist(true));
btnDisable.addEventListener("click", () => toggleWhitelist(false));
btnSearch.addEventListener("click", searchEmail);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") searchEmail(); });
btnAdd.addEventListener("click", addEmail);

btnLogout.addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  adminKeyInput.value = "";
  authSection.hidden = false;
  sessionBar.hidden  = true;
  configPanel.hidden = true;
  authError.hidden   = true;
});

// Restaurar sesión si ya había ingresado antes
const saved = sessionStorage.getItem(SESSION_KEY);
if (saved) { adminKeyInput.value = saved; loadConfig(); }
