// Using global API from config.js

let currentModule   = "";
let currentBlockTab = "all";
let allUniquePhones = [];
let blockedPhones   = new Set();

// Pagination state for history
const PAGE_SIZE = 10;
let historyData = [];
let historyPage = 1;

// ═══════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// MODULE CONFIG
// ═══════════════════════════════════════════════════════════════════
const MODULE_MAP = {
  sales       : { icon: "🚗", label: "Sales",       cls: "sales"       },
  insurance   : { icon: "🛡️", label: "Insurance",   cls: "insurance"   },
  service     : { icon: "🔧", label: "Service",     cls: "service"     },
  used_cars   : { icon: "🚙", label: "Used Cars",   cls: "used_cars"   },
  refinancing : { icon: "💼", label: "Refinancing", cls: "refinancing" },
  contact     : { icon: "📍", label: "Contact",     cls: "general"     },
  about_us    : { icon: "ℹ️", label: "About Us",    cls: "general"     },
  general     : { icon: "💡", label: "General",     cls: "general"     },
};

function moduleBadge(module) {
  const m = MODULE_MAP[module] || { icon: "💬", label: module, cls: "general" };
  return `<span class="module-badge ${m.cls}">${m.icon} ${m.label}</span>`;
}

function statusBadge(status) {
  const isActive = status === "active";
  return `<span class="status-badge ${isActive ? "active" : "closed"}">${isActive ? "🟢 Active" : "⚫ Closed"}</span>`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ═══════════════════════════════════════════════════════════════════
// HISTORY TABLE with PAGINATION
// ═══════════════════════════════════════════════════════════════════
function buildQuery() {
  const params   = new URLSearchParams();
  const search   = document.getElementById("searchInput").value.trim();
  const status   = document.getElementById("statusFilter").value;
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo   = document.getElementById("dateTo").value;
  if (currentModule) params.set("module",    currentModule);
  if (search)        params.set("search",    search);
  if (status)        params.set("status",    status);
  if (dateFrom)      params.set("date_from", dateFrom);
  if (dateTo)        params.set("date_to",   dateTo);
  params.set("limit", "200");
  return params.toString();
}

function renderTable(sessions) {
  const tbody = document.getElementById("historyTbody");
  const count = document.getElementById("resultCount");
  count.textContent = `${sessions.length} result${sessions.length !== 1 ? "s" : ""}`;

  if (!sessions.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No sessions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = sessions.map((h, i) => {
    const overallIndex = ((historyPage - 1) * PAGE_SIZE) + i + 1;
    return `
    <tr>
      <td data-label="#">${overallIndex}</td>
      <td data-label="Phone" style="font-weight:600;">${escHtml(h.user_phone)}</td>
      <td data-label="Module">${moduleBadge(h.module)}</td>
      <td data-label="Last Message" class="action-text-cell" title="${escHtml(h.action)}">${escHtml(h.action)}</td>
      <td data-label="Messages" style="text-align:center;">
        <span class="msg-count-chip">${h.message_count}</span>
        <span class="msg-count-detail">👤${h.user_msg_count} 🤖${h.bot_msg_count}</span>
      </td>
      <td data-label="Status">${statusBadge(h.status)}</td>
      <td data-label="Date">${h.date}</td>
      <td data-label="Time">${h.time}</td>
      <td data-label="Duration">${h.duration}</td>
      <td data-label="View"><button class="view-btn" onclick="openChatModal('${h.id}')">View Chat</button></td>
    </tr>`;
  }).join("");
}

function renderPagination() {
  const totalPages = Math.ceil(historyData.length / PAGE_SIZE);
  const container = document.getElementById("historyPagination");
  if (!container) return;

  container.innerHTML = "";

  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = i === historyPage ? "active" : "";
    btn.onclick = () => {
      historyPage = i;
      renderCurrentPage();
    };
    container.appendChild(btn);
  }
}

function renderCurrentPage() {
  const start = (historyPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageData = historyData.slice(start, end);
  renderTable(pageData);
  renderPagination();
}

async function loadSessions() {
  const tbody = document.getElementById("historyTbody");
  tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Loading…</td></tr>`;
  
  // Reset to page 1 on new search
  historyPage = 1;
  
  try {
    const res  = await fetch(`${API}/history/sessions?${buildQuery()}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    
    historyData = data.sessions || [];
    allUniquePhones = [...new Set(historyData.map(s => s.user_phone))];
    
    renderCurrentPage();
  } catch (e) {
    console.error(e);
    document.getElementById("historyTbody").innerHTML =
      `<tr><td colspan="10" class="empty-state" style="color:#ef4444;">❌ Backend error: ${escHtml(e.message)}</td></tr>`;
  }
}

function applyFilters() { loadSessions(); }

function resetFilters() {
  document.getElementById("searchInput").value  = "";
  document.getElementById("statusFilter").value = "";
  document.getElementById("dateFrom").value     = "";
  document.getElementById("dateTo").value       = "";
  currentModule = "";
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelector('.tab-btn[data-module=""]').classList.add("active");
  loadSessions();
}

function setTabActive(btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentModule = btn.dataset.module;
  loadSessions();
}

function setModuleFilter(module) {
  currentModule = module;
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.module === module));
  loadSessions();
}

// ═══════════════════════════════════════════════════════════════════
// CHAT DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════

// Chat filter state inside modal
let _chatSessionId   = null;
let _chatSenderFilter = "";
let _chatKeyword     = "";

async function openChatModal(sessionId) {
  _chatSessionId    = sessionId;
  _chatSenderFilter = "";
  _chatKeyword      = "";

  const modal = document.getElementById("chatModal");
  modal.style.display = "flex";

  // Reset filter inputs
  const sfEl = document.getElementById("chatSenderFilter");
  const kwEl = document.getElementById("chatKeyword");
  if (sfEl) sfEl.value = "";
  if (kwEl) kwEl.value = "";

  await _loadChatMessages();
}

async function _loadChatMessages() {
  document.getElementById("chatMessages").innerHTML    = `<div class="empty-state">Loading messages…</div>`;
  document.getElementById("chatMeta").innerHTML        = "";
  document.getElementById("modalTitle").textContent    = "Chat Session";
  document.getElementById("modalSubtitle").textContent = "";

  const params = new URLSearchParams();
  if (_chatSenderFilter) params.set("sender",  _chatSenderFilter);
  if (_chatKeyword)      params.set("keyword", _chatKeyword);

  try {
    const res  = await fetch(`${API}/history/sessions/${_chatSessionId}?${params}`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();

    document.getElementById("modalTitle").textContent    = `📱 ${data.user_phone}`;
    document.getElementById("modalSubtitle").textContent =
      `${data.date} · ${data.time} · ${data.platform} · ${data.duration}`;

    const sum = data.summary || {};
    document.getElementById("chatMeta").innerHTML = `
      <div class="meta-item">${moduleBadge(data.module)}</div>
      <div class="meta-item">💬 <strong>${data.total_messages}</strong> total
        ${data.filtered_count !== data.total_messages
          ? `<span style="color:#f59e0b;font-weight:600;"> (${data.filtered_count} shown)</span>`
          : ""}
      </div>
      <div class="meta-item">👤 <strong>${data.user_msg_count}</strong> user msgs</div>
      <div class="meta-item">🤖 <strong>${data.bot_msg_count}</strong> bot msgs</div>
      <div class="meta-item">${statusBadge(data.status)}</div>
      ${sum.lead_type
        ? `<div class="meta-item">🎯 Lead: <strong>${escHtml(sum.lead_type)}</strong></div>`
        : ""}
      ${sum.insurance_renewal
        ? `<div class="meta-item">🛡️ Renewal: <strong>✅ Yes</strong></div>`
        : ""}
      ${(sum.searched_cars || []).length
        ? `<div class="meta-item">🚗 Cars: <strong>${escHtml(sum.searched_cars.join(", "))}</strong></div>`
        : ""}`;

    const msgs = data.messages || [];
    if (!msgs.length) {
      document.getElementById("chatMessages").innerHTML =
        `<div class="empty-state">No messages match your filter.</div>`;
      return;
    }

    document.getElementById("chatMessages").innerHTML = msgs.map(m => {
      return _renderBubble(m);
    }).join("");

    const chatDiv = document.getElementById("chatMessages");
    chatDiv.scrollTop = chatDiv.scrollHeight;

  } catch (e) {
    document.getElementById("chatMessages").innerHTML =
      `<div class="empty-state" style="color:#ef4444;">Failed: ${escHtml(e.message)}</div>`;
  }
}

function _renderBubble(m) {
  const isUser = m.sender === "user";
  const intent = m.intent ? `<span class="msg-intent">${escHtml(m.intent)}</span>` : "";
  const time   = m.time   ? `<span>${m.time}</span>` : "";

  let content = "";

  if (m.type === "image") {
    // Render image bubble
    content = `
      <div class="bubble-text bubble-media">
        <div class="media-label">🖼️ Image</div>
        <img src="${escHtml(m.text)}" alt="WhatsApp Image"
             onerror="this.style.display='none';this.nextSibling.style.display='block'"
             style="max-width:100%;border-radius:8px;margin-top:6px;display:block;" />
        <span style="display:none;font-size:11px;color:#94a3b8;">Image unavailable</span>
      </div>`;
  } else if (m.type === "document") {
    // Render document bubble
    const fname = m.text.split("/").pop();
    content = `
      <div class="bubble-text bubble-media">
        <div class="media-label">📄 Document</div>
        <a href="${escHtml(m.text)}" target="_blank" class="doc-link">
          📎 ${escHtml(fname)}
        </a>
      </div>`;
  } else {
    // Plain text — preserve newlines
    const safe = escHtml(m.text).replace(/\n/g, "<br>");
    content = `<div class="bubble-text">${safe}</div>`;
  }

  return `
    <div class="msg-bubble ${isUser ? "user" : "bot"}">
      ${content}
      <div class="msg-meta">
        <span>${isUser ? "👤 User" : "🤖 Bot"}</span>
        ${time}${intent}
      </div>
    </div>`;
}

// Modal in-chat filters
function applyChatFilter() {
  const sfEl = document.getElementById("chatSenderFilter");
  const kwEl = document.getElementById("chatKeyword");
  _chatSenderFilter = sfEl ? sfEl.value : "";
  _chatKeyword      = kwEl ? kwEl.value.trim() : "";
  _loadChatMessages();
}

function resetChatFilter() {
  const sfEl = document.getElementById("chatSenderFilter");
  const kwEl = document.getElementById("chatKeyword");
  if (sfEl) sfEl.value = "";
  if (kwEl) kwEl.value = "";
  _chatSenderFilter = "";
  _chatKeyword      = "";
  _loadChatMessages();
}

function closeModal() {
  document.getElementById("chatModal").style.display = "none";
  _chatSessionId = null;
}

// ═══════════════════════════════════════════════════════════════════
// BLOCK MANAGER MODAL
// ═══════════════════════════════════════════════════════════════════
async function openBlockModal() {
  document.getElementById("blockModal").style.display = "flex";
  document.getElementById("blockSearchInput").value   = "";
  currentBlockTab = "all";
  document.getElementById("tabAllNumbers").classList.add("active");
  document.getElementById("tabBlocked").classList.remove("active");

  if (allUniquePhones.length === 0) await loadSessions();
  await refreshBlockedList();
  renderBlockList();
}

function closeBlockModal() {
  document.getElementById("blockModal").style.display = "none";
}

async function refreshBlockedList() {
  try {
    const res  = await fetch(`${API}/block/list`);
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    blockedPhones = new Set((data.blocked || []).map(b => b.phone));
    document.getElementById("blockedCount").textContent    = blockedPhones.size;
    document.getElementById("allNumbersCount").textContent = allUniquePhones.length;
  } catch (e) {
    console.error("Block list fetch failed:", e);
  }
}

function switchBlockTab(tab) {
  currentBlockTab = tab;
  document.getElementById("tabAllNumbers").classList.toggle("active", tab === "all");
  document.getElementById("tabBlocked").classList.toggle("active",    tab === "blocked");
  document.getElementById("blockSearchInput").value = "";
  renderBlockList();
}

function filterBlockList() { renderBlockList(); }

function renderBlockList() {
  const search = document.getElementById("blockSearchInput").value.toLowerCase().trim();
  const listEl = document.getElementById("blockList");

  let phones = currentBlockTab === "blocked" ? [...blockedPhones] : allUniquePhones;
  if (search) phones = phones.filter(p => p.toLowerCase().includes(search));

  if (!phones.length) {
    listEl.innerHTML = `<div class="empty-state">${
      currentBlockTab === "blocked" ? "No blocked numbers." : "No users found."
    }</div>`;
    return;
  }

  listEl.innerHTML = phones.map(phone => {
    const isBlocked = blockedPhones.has(phone);
    return `
      <div class="block-row ${isBlocked ? "is-blocked" : ""}">
        <div class="block-row-phone">
          ${isBlocked
            ? '<span class="blocked-dot">🚫</span>'
            : '<span class="active-dot">🟢</span>'}
          <span>${escHtml(phone)}</span>
        </div>
        <div class="block-row-actions">
          ${isBlocked
            ? `<span class="blocked-label">Blocked</span>
               <button class="unblock-btn" onclick="handleUnblock('${escHtml(phone)}')">Unblock</button>`
            : `<button class="block-btn-action" onclick="handleBlock('${escHtml(phone)}')">Block</button>`}
        </div>
      </div>`;
  }).join("");
}

async function handleBlock(phone) {
  try {
    const res = await fetch(`${API}/block/add`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) throw new Error(await res.text());
    await refreshBlockedList();
    renderBlockList();
    showToast(`🚫 ${phone} blocked`);
  } catch (e) { alert("Block failed: " + e.message); }
}

async function handleUnblock(phone) {
  try {
    const res = await fetch(`${API}/block/remove/${encodeURIComponent(phone)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    await refreshBlockedList();
    renderBlockList();
    showToast(`✅ ${phone} unblocked`);
  } catch (e) { alert("Unblock failed: " + e.message); }
}

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div"); t.id = "toast";
    t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
      background:#1e293b;color:#fff;padding:12px 24px;border-radius:999px;
      font-size:13px;font-weight:600;font-family:'Plus Jakarta Sans',sans-serif;
      box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:9999;transition:opacity 0.3s;opacity:0;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2500);
}

// ── Backdrop close ───────────────────────────────────────────────
document.addEventListener("click", e => {
  if (e.target === document.getElementById("chatModal"))  closeModal();
  if (e.target === document.getElementById("blockModal")) closeBlockModal();
});

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  loadSessions();
});

// Expose globals
window.applyFilters    = applyFilters;
window.resetFilters    = resetFilters;
window.setTabActive    = setTabActive;
window.setModuleFilter = setModuleFilter;
window.openChatModal   = openChatModal;
window.closeModal      = closeModal;
window.applyChatFilter = applyChatFilter;
window.resetChatFilter = resetChatFilter;
window.openBlockModal  = openBlockModal;
window.closeBlockModal = closeBlockModal;
window.switchBlockTab  = switchBlockTab;
window.filterBlockList = filterBlockList;
window.handleBlock     = handleBlock;
window.handleUnblock   = handleUnblock;