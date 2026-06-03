const API = "";
const SESSION_KEY = "heuristica_admin_key";

const adminKeyInput = document.getElementById("admin-key");
const loadBtn       = document.getElementById("load-btn");
const authError     = document.getElementById("auth-error");
const authSection   = document.getElementById("auth-section");
const sessionBar    = document.getElementById("session-bar");
const btnLogout     = document.getElementById("btn-logout");
const panel         = document.getElementById("panel");
const newEmailInput = document.getElementById("new-email");
const btnAdd        = document.getElementById("btn-add");
const addMsg        = document.getElementById("add-msg");
const filterInput   = document.getElementById("filter-input");
const emailList     = document.getElementById("email-list");
const countShown    = document.getElementById("count-shown");
const countTotal    = document.getElementById("count-total");

let allEmails = [];

function getKey() { return adminKeyInput.value.trim(); }

function renderList() {
  const term = filterInput.value.trim().toLowerCase();
  const filtered = term ? allEmails.filter(e => e.email.includes(term)) : allEmails;
  countShown.textContent = filtered.length;
  countTotal.textContent = allEmails.length;
  emailList.innerHTML = filtered.map(e => `
    <li>
      <span>${e.email}</span>
      <span class="date">${e.added_at.slice(0, 10)}</span>
    </li>`).join("");
}

async function loadEmails() {
  authError.hidden = true;
  const res = await fetch(`${API}/admin/config/emails?key=${encodeURIComponent(getKey())}`);
  if (res.status === 403 || res.status === 503) {
    authError.textContent = res.status === 503
      ? "Admin key no configurada en el servidor."
      : "Admin key incorrecta.";
    authError.hidden = false;
    panel.hidden = true;
    authSection.hidden = false;
    sessionBar.hidden  = true;
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  if (!res.ok) { authError.textContent = "Error al cargar."; authError.hidden = false; return; }
  const data = await res.json();
  sessionStorage.setItem(SESSION_KEY, getKey());
  authSection.hidden = true;
  sessionBar.hidden  = false;
  allEmails = data.emails;
  panel.hidden = false;
  renderList();
}

async function addEmail() {
  addMsg.hidden = true;
  const email = newEmailInput.value.trim();
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
  addMsg.textContent = `${data.email} agregado.`;
  addMsg.style.color = "#6effa0";
  addMsg.hidden = false;
  newEmailInput.value = "";
  await loadEmails();
}

loadBtn.addEventListener("click", loadEmails);
adminKeyInput.addEventListener("keydown", e => { if (e.key === "Enter") loadEmails(); });
btnAdd.addEventListener("click", addEmail);
newEmailInput.addEventListener("keydown", e => { if (e.key === "Enter") addEmail(); });
filterInput.addEventListener("input", renderList);

btnLogout.addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  adminKeyInput.value = "";
  authSection.hidden = false;
  sessionBar.hidden  = true;
  panel.hidden = true;
  authError.hidden = true;
});

// Restaurar sesión
const saved = sessionStorage.getItem(SESSION_KEY);
if (saved) { adminKeyInput.value = saved; loadEmails(); }
