const API = "";

const adminKeyInput = document.getElementById("admin-key");
const loadBtn       = document.getElementById("load-btn");
const authError     = document.getElementById("auth-error");
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

function renderList(entries) {
  const term = filterInput.value.trim().toLowerCase();
  const filtered = term ? entries.filter(e => e.email.includes(term)) : entries;
  countShown.textContent = filtered.length;
  countTotal.textContent = entries.length;
  emailList.innerHTML = filtered.map(e => `
    <li class="${term && e.email.includes(term) ? "highlight" : ""}">
      <span>${e.email}</span>
      <span class="date">${e.added_at.slice(0, 10)}</span>
    </li>`).join("");
}

async function loadEmails() {
  authError.hidden = true;
  const res = await fetch(`${API}/admin/config/emails?key=${encodeURIComponent(getKey())}`);
  if (res.status === 403) {
    authError.textContent = "Admin key incorrecta.";
    authError.hidden = false;
    panel.hidden = true;
    return;
  }
  if (!res.ok) { authError.textContent = "Error al cargar."; authError.hidden = false; return; }
  const data = await res.json();
  allEmails = data.emails;
  panel.hidden = false;
  renderList(allEmails);
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
filterInput.addEventListener("input", () => renderList(allEmails));
