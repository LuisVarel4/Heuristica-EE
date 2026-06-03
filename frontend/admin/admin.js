const API = "";

const adminKeyInput  = document.getElementById("admin-key");
const loadBtn        = document.getElementById("load-btn");
const authError      = document.getElementById("auth-error");
const configPanel    = document.getElementById("config-panel");
const wlBadge        = document.getElementById("wl-badge");
const wlCount        = document.getElementById("wl-count");
const wlList         = document.getElementById("wl-list");
const btnEnable      = document.getElementById("btn-enable");
const btnDisable     = document.getElementById("btn-disable");
const toggleMsg      = document.getElementById("toggle-msg");
const newEmailInput  = document.getElementById("new-email");
const btnAdd         = document.getElementById("btn-add");
const addMsg         = document.getElementById("add-msg");
const searchInput    = document.getElementById("search-input");
const btnSearch      = document.getElementById("btn-search");
const searchResult   = document.getElementById("search-result");
const filterInput    = document.getElementById("filter-input");

let allEntries = [];   // cache de la lista completa para filtrar en el cliente

function getKey() {
  return adminKeyInput.value.trim();
}

function renderBadge(enabled) {
  wlBadge.textContent = enabled ? "ACTIVA" : "DESACTIVADA";
  wlBadge.className   = "badge " + (enabled ? "badge-on" : "badge-off");
}

function renderList(entries, highlight = "") {
  const term = highlight.trim().toLowerCase();
  wlCount.textContent = entries.length;
  wlList.innerHTML = entries
    .map((e) => {
      const isMatch = term && e.email.toLowerCase().includes(term);
      return `<li class="${isMatch ? "highlight" : ""}">
        ${e.email}
        <span style="color:#8fa8be;font-size:0.75rem">${e.added_at.slice(0, 10)}</span>
      </li>`;
    })
    .join("");
}

function applyFilter() {
  const term = filterInput.value.trim().toLowerCase();
  const filtered = term
    ? allEntries.filter((e) => e.email.toLowerCase().includes(term))
    : allEntries;
  renderList(filtered);
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
  allEntries = data.whitelist;
  configPanel.hidden = false;
  renderBadge(data.whitelist_enabled);
  renderList(allEntries);
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
  toggleMsg.textContent = `Lista blanca ${data.whitelist_enabled ? "activada" : "desactivada"} correctamente.`;
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
  await loadConfig();
}

function searchEmail() {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return;

  const found = allEntries.find((e) => e.email.toLowerCase() === term);
  searchResult.hidden = false;

  if (found) {
    searchResult.innerHTML =
      `<span class="badge badge-found">✓ En la lista</span>  ${found.email} — agregado el ${found.added_at.slice(0, 10)}`;
  } else {
    searchResult.innerHTML =
      `<span class="badge badge-missing">✗ No está en la lista</span>  "${searchInput.value.trim()}"`;
  }
}

// ── Eventos ────────────────────────────────────────────────────────────────
loadBtn.addEventListener("click", loadConfig);
adminKeyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") loadConfig(); });

btnEnable.addEventListener("click",  () => toggleWhitelist(true));
btnDisable.addEventListener("click", () => toggleWhitelist(false));

btnAdd.addEventListener("click", addEmail);
newEmailInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addEmail(); });

btnSearch.addEventListener("click", searchEmail);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") searchEmail(); });

filterInput.addEventListener("input", applyFilter);
