// Using global API from config.js

// Pagination state
const PAGE_SIZE = 10;
let renewalData = [];
let estimateData = [];
let renewalPage = 1;
let estimatePage = 1;

// ---------- TAB TOGGLE ----------
function showTab(tab) {
  const renewal = document.getElementById("renewalSection");
  const estimate = document.getElementById("estimateSection");
  const upload = document.getElementById("uploadSection");
  
  const tabRenewal = document.getElementById("tabRenewal");
  const tabEstimate = document.getElementById("tabEstimate");
  const tabUpload = document.getElementById("tabUpload");

  renewal.classList.add("hidden");
  estimate.classList.add("hidden");
  upload.classList.add("hidden");
  tabRenewal.classList.remove("active");
  tabEstimate.classList.remove("active");
  tabUpload.classList.remove("active");

  if (tab === "renewal") {
    renewal.classList.remove("hidden");
    tabRenewal.classList.add("active");
  } else if (tab === "estimate") {
    estimate.classList.remove("hidden");
    tabEstimate.classList.add("active");
  } else if (tab === "upload") {
    upload.classList.remove("hidden");
    tabUpload.classList.add("active");
  }
}

// ---------- LOAD RENEWALS (with pagination) ----------
async function loadRenewals(page = 1) {
  try {
    const res = await fetch(API + "/insurance/renewals");
    if (!res.ok) throw new Error("API Error");

    renewalData = await res.json();
    renewalPage = page;

    renderRenewals();
    renderPagination(
      renewalData.length,
      renewalPage,
      PAGE_SIZE,
      "renewalPagination",
      loadRenewals
    );
  } catch (err) {
    console.error(err);
    alert("Failed to load renewals");
  }
}

function renderRenewals() {
  const tbody = document.querySelector("#renewalTable tbody");
  tbody.innerHTML = "";

  const start = (renewalPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  renewalData.slice(start, end).forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td>${r.mobile_number}</td>
        <td>${r.vehicle_reg_no}</td>
        <td>${r.customer_name}</td>
        <td>${r.renewal_type}</td>
        <td>${r.appointment_mode}</td>
        <td>${r.appointment_date}</td>
        <td>${r.appointment_time}</td>
      </tr>
    `;
  });
}

// ---------- LOAD ESTIMATES (with pagination) ----------
async function loadEstimates(page = 1) {
  try {
    const res = await fetch(API + "/insurance/estimates");
    if (!res.ok) throw new Error("API Error");

    estimateData = await res.json();
    estimatePage = page;

    renderEstimates();
    renderPagination(
      estimateData.length,
      estimatePage,
      PAGE_SIZE,
      "estimatePagination",
      loadEstimates
    );
  } catch (err) {
    console.error(err);
    alert("Failed to load estimates");
  }
}

function renderEstimates() {
  const tbody = document.querySelector("#estimateTable tbody");
  tbody.innerHTML = "";

  const start = (estimatePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  estimateData.slice(start, end).forEach(e => {
    const docLink = e.document_name
      ? `
        <div class="doc-actions">
          <a href="${API}/insurance/estimates/${e.id}/document" target="_blank" title="View" style="text-decoration:none; font-size:18px;">👁️</a>
          <a href="${API}/insurance/estimates/${e.id}/document" download title="Download" style="text-decoration:none; font-size:18px;">⬇️</a>
        </div>
      `
      : "-";

    tbody.innerHTML += `
      <tr>
        <td>${e.mobile_number}</td>
        <td>${e.customer_name}</td>
        <td>${e.vehicle_reg_no}</td>
        <td>${docLink}</td>
        <td>${e.document_type || "-"}</td>
        <td>${e.file_size ? (e.file_size / 1024).toFixed(1) + " KB" : "-"}</td>
      </tr>
    `;
  });
}



// ---------- DOWNLOAD TEMPLATE ----------
function downloadTemplate(tableType) {
  const timestamp = new Date().getTime();
  window.open(`${API}/insurance/template/${tableType}?t=${timestamp}`, '_blank');
}

// ---------- UPLOAD DATA ----------
async function uploadData(event, tableType) {
  event.preventDefault();
  
  let fileInputStr = tableType === 'forecasted' ? 'fileForecasted' : 'fileIndividual';
  let statusStr = tableType === 'forecasted' ? 'statusForecasted' : 'statusIndividual';
  let formStr = tableType === 'forecasted' ? 'formForecasted' : 'formIndividual';
  
  const fileInput = document.getElementById(fileInputStr);
  const statusEl = document.getElementById(statusStr);
  
  if (!fileInput.files.length) {
    statusEl.innerHTML = '<span style="color:red;">Please select a file to upload.</span>';
    return;
  }
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  
  statusEl.innerHTML = '<span style="color:blue;">Uploading processing...</span>';
  
  try {
    const res = await fetch(`${API}/insurance/upload/${tableType}`, {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    
    statusEl.innerHTML = `<span style="color:green;">${data.message}</span>`;
    document.getElementById(formStr).reset();
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
  }
}

// ---------- PAGINATION RENDER ----------
function renderPagination(totalItems, currentPage, pageSize, containerId, callback) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = i === currentPage ? "active" : "";
    btn.onclick = () => callback(i);
    container.appendChild(btn);
  }
}

// ---------- AUTO LOAD ON PAGE OPEN ----------
document.addEventListener("DOMContentLoaded", () => {
  loadRenewals();     // Renewal auto load
  loadEstimates();   // Estimate auto load (tab switch panna empty-a irukkaadhu)
});

// expose functions
window.showTab = showTab;
window.loadRenewals = loadRenewals;
window.loadEstimates = loadEstimates;
window.downloadTemplate = downloadTemplate;
window.uploadData = uploadData;

// ---------- PREVIEW MODAL ----------
let previewCurrentPage = 1;
let previewCurrentType = '';
const PREVIEW_PAGE_SIZE = 10;

async function openPreview(tableType) {
  previewCurrentType = tableType;
  previewCurrentPage = 1;

  const modal = document.getElementById('previewModal');
  const title = document.getElementById('previewTitle');

  title.textContent = tableType === 'forecasted'
    ? '📊 Preview — Insurance Forecasted Data'
    : '📋 Preview — Individual Report';

  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';

  await loadPreviewPage(1);
}

function closePreview() {
  document.getElementById('previewModal').style.display = 'none';
  document.body.style.overflow = '';
}

async function loadPreviewPage(page) {
  previewCurrentPage = page;

  const loader = document.getElementById('previewLoader');
  const empty = document.getElementById('previewEmpty');
  const table = document.getElementById('previewTable');
  const countEl = document.getElementById('previewCount');
  const paginationEl = document.getElementById('previewPagination');

  loader.style.display = 'block';
  empty.style.display = 'none';
  table.style.display = 'none';
  paginationEl.innerHTML = '';

  try {
    const res = await fetch(`${API}/insurance/preview/${previewCurrentType}?page=${page}&page_size=${PREVIEW_PAGE_SIZE}`);
    if (!res.ok) throw new Error('API Error');

    const data = await res.json();
    loader.style.display = 'none';

    if (!data.rows || data.rows.length === 0) {
      empty.style.display = 'block';
      countEl.textContent = 'No records found.';
      return;
    }

    // Count info
    const start = (page - 1) * PREVIEW_PAGE_SIZE + 1;
    const end = Math.min(page * PREVIEW_PAGE_SIZE, data.total);
    countEl.textContent = `Showing ${start}–${end} of ${data.total} records`;

    // Build thead
    const thead = document.getElementById('previewThead');
    thead.innerHTML = '<tr>' + data.columns.map(col =>
      `<th style="background:#f8fafc; padding:12px 14px; text-align:left; font-size:12px; font-weight:700; color:#475569; letter-spacing:0.4px; text-transform:uppercase; border-bottom:1px solid #e2e8f0; white-space:nowrap;">${col}</th>`
    ).join('') + '</tr>';

    // Build tbody
    const tbody = document.getElementById('previewTbody');
    tbody.innerHTML = data.rows.map((row, i) =>
      '<tr style="' + (i % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;') + '">' +
        data.columns.map(col =>
          `<td style="padding:10px 14px; font-size:13px; color:#334155; border-bottom:1px solid #f1f5f9; white-space:nowrap;">${row[col] ?? '-'}</td>`
        ).join('') +
      '</tr>'
    ).join('');

    table.style.display = 'table';

    // Pagination
    const totalPages = Math.ceil(data.total / PREVIEW_PAGE_SIZE);
    renderPreviewPagination(totalPages, page);

  } catch (err) {
    loader.style.display = 'none';
    empty.textContent = 'Failed to load data. Please try again.';
    empty.style.display = 'block';
    console.error(err);
  }
}

function renderPreviewPagination(totalPages, currentPage) {
  const container = document.getElementById('previewPagination');
  container.innerHTML = '';

  // Show max 7 page buttons with ellipsis logic
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  // Prev button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = currentPage === 1;
  prevBtn.style.cssText = 'padding:8px 14px; border-radius:10px; border:1px solid #e2e8f0; background:white; font-size:13px; font-weight:600; cursor:pointer; color:#334155; opacity:' + (currentPage === 1 ? '0.4' : '1');
  prevBtn.onclick = () => { if (currentPage > 1) loadPreviewPage(currentPage - 1); };
  container.appendChild(prevBtn);

  pages.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    if (p === '...') {
      btn.disabled = true;
      btn.style.cssText = 'padding:8px 10px; border-radius:10px; border:none; background:transparent; font-size:13px; color:#94a3b8; cursor:default;';
    } else {
      const isActive = p === currentPage;
      btn.style.cssText = 'padding:8px 13px; border-radius:10px; border:1px solid ' + (isActive ? 'transparent' : '#e2e8f0') + '; background:' + (isActive ? 'linear-gradient(135deg,#3b5b9b,#6b8dd6)' : 'white') + '; font-size:13px; font-weight:600; cursor:pointer; color:' + (isActive ? 'white' : '#334155') + ';';
      btn.onclick = () => loadPreviewPage(p);
    }
    container.appendChild(btn);
  });

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.style.cssText = 'padding:8px 14px; border-radius:10px; border:1px solid #e2e8f0; background:white; font-size:13px; font-weight:600; cursor:pointer; color:#334155; opacity:' + (currentPage === totalPages ? '0.4' : '1');
  nextBtn.onclick = () => { if (currentPage < totalPages) loadPreviewPage(currentPage + 1); };
  container.appendChild(nextBtn);
}

// Close modal when clicking outside
document.getElementById('previewModal').addEventListener('click', function(e) {
  if (e.target === this) closePreview();
});

window.openPreview = openPreview;
window.closePreview = closePreview;
window.loadPreviewPage = loadPreviewPage;
