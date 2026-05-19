// Using global API from config.js

let allServiceItems = [];
let activeReportType = "all";
let serviceRangeMode = "all";
let servicePeriod = "all";
let serviceStartDate = "";
let serviceEndDate = "";
let serviceWeekDate = "";
let serviceMonthValue = "";

function setActiveRangeButton(mode) {
  document.querySelectorAll(".range-pill").forEach(button => {
    button.classList.toggle("active", button.textContent.toLowerCase().includes(mode));
  });
}

function setVisibleRangePanel(mode) {
  const panels = ["all", "week", "month", "custom"];
  panels.forEach(panel => {
    const element = document.getElementById(`service${panel.charAt(0).toUpperCase() + panel.slice(1)}Panel`);
    if (element) {
      element.classList.toggle("active", panel === mode);
      element.classList.toggle("hidden", panel !== mode);
    }
  });
  serviceRangeMode = mode;
}

function formatDateForDisplay(value) {
  if (!value) return "";
  const date = parseIsoDate(value);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : value;
}

function formatMonthForDisplay(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) return monthValue;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getServiceQueryParams() {
  const params = new URLSearchParams();
  
  // If we have specific start/end dates (from week, month, or custom), use them
  if (serviceStartDate && serviceEndDate) {
    params.append("period", "custom");
    params.append("start_date", serviceStartDate);
    params.append("end_date", serviceEndDate);
  } else {
    params.append("period", serviceRangeMode || "all");
  }

  // Respect the active tab (All Item / Estimate / Appointment)
  if (activeReportType && activeReportType !== "all") {
    params.append("type", activeReportType);
  }

  params.append("limit", "500");
  return params.toString();
}

function getServiceEndpoint() {
  return `${API}/service/action-items?${getServiceQueryParams()}`;
}

function getServiceExportEndpoint() {
  return `${API}/service/export?${getServiceQueryParams()}`;
}

function onServiceRangeChange(period) {
  serviceRangeMode = period;
  servicePeriod = period;
  
  // Reset values
  serviceStartDate = "";
  serviceEndDate = "";
  
  setVisibleRangePanel(period);
  setActiveRangeButton(period);

  // Toggle panel visibility class for cleaner UI
  const filterSection = document.querySelector('.service-filter-section');
  if (filterSection) {
    filterSection.classList.toggle('show-panel', period !== 'all');
  }

  if (period === "all") {
    loadServiceRecords();
  }
}

function getWeekRange(dateValue) {
  const date = parseIsoDate(dateValue);
  if (!date) return null;
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    start: weekStart.toISOString().slice(0, 10),
    end: weekEnd.toISOString().slice(0, 10),
  };
}

function onServiceWeekDateChange(value) {
  serviceWeekDate = value;
  const weekRange = getWeekRange(value);
  const summary = document.getElementById("serviceWeekSummary");
  if (!weekRange || !summary) return;
  if (!value) {
    summary.textContent = "Pick a date to use the full week.";
    return;
  }
  serviceStartDate = weekRange.start;
  serviceEndDate = weekRange.end;
  summary.textContent = `Week selected: ${formatDateForDisplay(serviceStartDate)} — ${formatDateForDisplay(serviceEndDate)}`;
  loadServiceRecords();
}

function onServiceMonthDateChange(value) {
  serviceMonthValue = value;
  const summary = document.getElementById("serviceMonthSummary");
  if (!value || !summary) {
    return;
  }
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) {
    summary.textContent = "Pick a month to load records for that month.";
    return;
  }
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  serviceStartDate = start.toISOString().slice(0, 10);
  serviceEndDate = end.toISOString().slice(0, 10);
  summary.textContent = `Month selected: ${formatMonthForDisplay(value)} (${formatDateForDisplay(serviceStartDate)} — ${formatDateForDisplay(serviceEndDate)})`;
  loadServiceRecords();
}

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function parseIsoDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function countItems(items, predicate) {
  return items.filter(predicate).length;
}

function getDateRangeCount(items, days) {
  const now = new Date();
  return countItems(items, item => {
    const createdAt = parseIsoDate(item.created_at);
    if (!createdAt) return false;
    const diff = now - createdAt;
    return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
  });
}

function updateServiceReportCards(items) {
  const estimateItems = items.filter(item => item.source === "Service Estimate");
  const appointmentItems = items.filter(item => item.source === "Service Appointment");

  document.getElementById("estimateTotal").textContent = estimateItems.length;
  document.getElementById("estimateWeekly").textContent = getDateRangeCount(estimateItems, 7);
  document.getElementById("estimateMonthly").textContent = getDateRangeCount(estimateItems, 30);

  document.getElementById("appointmentTotal").textContent = appointmentItems.length;
  document.getElementById("appointmentWeekly").textContent = getDateRangeCount(appointmentItems, 7);
  document.getElementById("appointmentMonthly").textContent = getDateRangeCount(appointmentItems, 30);
}

function filterServiceItems(type) {
  if (type === "estimate") {
    return allServiceItems.filter(item => item.source === "Service Estimate");
  }
  if (type === "appointment") {
    return allServiceItems.filter(item => item.source === "Service Appointment");
  }
  return allServiceItems;
}


function applyServiceDateFilter() {
  const startInput = document.getElementById("serviceStartDate").value;
  const endInput = document.getElementById("serviceEndDate").value;
  if (!startInput || !endInput) {
    alert("Please select both start and end dates.");
    return;
  }
  serviceRangeMode = "custom";
  serviceStartDate = startInput;
  serviceEndDate = endInput;
  setVisibleRangePanel("custom");
  setActiveRangeButton("custom");
  document.getElementById("serviceCustomSummary").textContent = `Custom range selected: ${formatDateForDisplay(serviceStartDate)} — ${formatDateForDisplay(serviceEndDate)}`;
  loadServiceRecords();
}

function downloadServiceExcel() {
  const exportUrl = getServiceExportEndpoint();
  window.location.href = exportUrl;
}

function formatSchedule(dateValue, timeValue) {
  const date = parseIsoDate(dateValue);
  const now = new Date();
  let label = "—";

  if (date) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((target - today) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      label = "Today";
    } else if (diffDays === 1) {
      label = "Tomorrow";
    } else if (diffDays === -1) {
      label = "Yesterday";
    } else {
      label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  }

  if (!timeValue) {
    return escapeHtml(label);
  }

  const timeText = escapeHtml(timeValue);
  return `${escapeHtml(label)}<div class="schedule-sub">${timeText}</div>`;
}

function formatCustomerDetails(name, phone) {
  return `
    <div class="customer-details">
      <div class="customer-name">${escapeHtml(name)}</div>
      <div class="customer-phone">${escapeHtml(phone)}</div>
    </div>
  `;
}

function updateTableHeaders(items) {
  const head = document.getElementById("serviceTableHead");
  if (!head) return;

  // Determine what type of records we're showing
  const hasEstimates = items.some(item => item.source === "Service Estimate");
  const hasAppointments = items.some(item => item.source === "Service Appointment");

  let headerHtml = "<tr>";
  
  if (hasEstimates && !hasAppointments) {
    // Service Estimate columns
    headerHtml += `
      <th>Vehicle Number</th>
      <th>Mobile Number</th>
      <th>Type of Service</th>
      <th>Schedule</th>
    `;
  } else if (hasAppointments && !hasEstimates) {
    // Service Appointment columns
    headerHtml += `
      <th>Name</th>
      <th>Phone Number</th>
      <th>Vehicle Number</th>
      <th>Appointment Date & Time</th>
      <th>Service Preference</th>
    `;
  } else {
    // Mixed records - use appointment columns as default
    headerHtml += `
      <th>Name</th>
      <th>Phone Number</th>
      <th>Vehicle Number</th>
      <th>Appointment Date & Time</th>
      <th>Service Preference</th>
    `;
  }
  
  headerHtml += "</tr>";
  head.innerHTML = headerHtml;
}

function renderServiceRows(items) {
  const tbody = document.getElementById("serviceTableBody");
  const hasEstimates = items.some(item => item.source === "Service Estimate");
  const hasAppointments = items.some(item => item.source === "Service Appointment");
  const isEstimateOnly = hasEstimates && !hasAppointments;
  const colSpan = isEstimateOnly ? 4 : 5;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-state">No service records found.</td></tr>`;
    return;
  }

  updateTableHeaders(items);

  tbody.innerHTML = items.map((item) => {
    if (isEstimateOnly) {
      // Service Estimate layout
      return `
        <tr>
          <td><span class="vehicle-number">${escapeHtml(item.vehicle_reg)}</span></td>
          <td><span class="mobile-number">${escapeHtml(item.phone)}</span></td>
          <td><span class="item-type-label">${escapeHtml(item.estimate_type)}</span></td>
          <td>${formatSchedule(item.created_at, "")}</td>
        </tr>
      `;
    } else {
      // Service Appointment layout
      const appointmentDateTime = `
        <div style="font-size: 13px; font-weight: 600;">${escapeHtml(item.appointment_date)}</div>
        <div style="font-size: 11px; color: var(--neutral-500);">${escapeHtml(item.appointment_time)}</div>
      `;

      return `
        <tr>
          <td><span class="customer-name">${escapeHtml(item.customer_name)}</span></td>
          <td><span class="phone-number">${escapeHtml(item.phone)}</span></td>
          <td><span class="vehicle-number">${escapeHtml(item.vehicle_reg)}</span></td>
          <td>${appointmentDateTime}</td>
          <td><span class="service-pref-label">${escapeHtml(item.service_preference)}</span></td>
        </tr>
      `;
    }
  }).join("");
}

function viewServiceReport(type) {
  activeReportType = type;
  renderServiceRows(filterServiceItems(type));
  document.getElementById("serviceTableSection").scrollIntoView({ behavior: "smooth" });
  // Update active filter tab
  document.querySelectorAll(".filter-tab").forEach(btn => btn.classList.remove("active"));
  if (type === "estimate") {
    document.querySelectorAll(".filter-tab")[1].classList.add("active");
  } else if (type === "appointment") {
    document.querySelectorAll(".filter-tab")[2].classList.add("active");
  } else {
    document.querySelectorAll(".filter-tab")[0].classList.add("active");
  }
}

function filterServiceType(type) {
  activeReportType = type;
  renderServiceRows(filterServiceItems(type));
  // Update active filter tab
  document.querySelectorAll(".filter-tab").forEach(btn => btn.classList.remove("active"));
  if (type === "estimate") {
    document.querySelectorAll(".filter-tab")[1].classList.add("active");
  } else if (type === "appointment") {
    document.querySelectorAll(".filter-tab")[2].classList.add("active");
  } else {
    document.querySelectorAll(".filter-tab")[0].classList.add("active");
  }
}

async function loadServiceRecords() {
  const tbody = document.getElementById("serviceTableBody");
  const colSpan = servicePeriod === "custom" ? 5 : 5;
  tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-state">Loading service records…</td></tr>`;

  try {
    const res = await fetch(getServiceEndpoint());
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    allServiceItems = data.items || [];

    updateServiceReportCards(allServiceItems);
    renderServiceRows(filterServiceItems(activeReportType));
    
    // Maintain active filter tab based on activeReportType
    document.querySelectorAll(".filter-tab").forEach((btn, idx) => {
      btn.classList.remove("active");
    });
    if (activeReportType === "estimate") {
      document.querySelectorAll(".filter-tab")[1].classList.add("active");
    } else if (activeReportType === "appointment") {
      document.querySelectorAll(".filter-tab")[2].classList.add("active");
    } else {
      document.querySelectorAll(".filter-tab")[0].classList.add("active");
    }
    setActiveRangeButton(serviceRangeMode);
    setVisibleRangePanel(serviceRangeMode);
  } catch (error) {
    console.error("Failed to load service records:", error);
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Unable to load service records.</td></tr>`;
    document.getElementById("estimateTotal").textContent = "—";
    document.getElementById("estimateWeekly").textContent = "—";
    document.getElementById("estimateMonthly").textContent = "—";
    document.getElementById("appointmentTotal").textContent = "—";
    document.getElementById("appointmentWeekly").textContent = "—";
    document.getElementById("appointmentMonthly").textContent = "—";
  }
}

let currentPreviewType = 'forecast';

async function uploadServiceFileByType(event, type) {
  if (event) event.preventDefault();
  
  const formId = type === 'forecast' ? 'formServiceForecast' : 'formServiceROBills';
  const fileInputId = type === 'forecast' ? 'fileServiceForecast' : 'fileServiceROBills';
  const statusElId = type === 'forecast' ? 'statusServiceForecast' : 'statusServiceROBills';
  const btnId = type === 'forecast' ? 'btnServiceForecast' : 'btnServiceROBills';

  const fileInput = document.getElementById(fileInputId);
  const statusEl = document.getElementById(statusElId);
  const btn = document.getElementById(btnId);
  
  if (!fileInput.files.length) {
    statusEl.innerHTML = '<span style="color:#ef4444; background:#fef2f2; padding:8px 12px; border-radius:6px; display:inline-block;">⚠️ Please select a file to upload.</span>';
    return;
  }
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  
  statusEl.innerHTML = '<span style="color:#2563eb;">⏳ Uploading and processing data...</span>';
  btn.disabled = true;
  btn.style.opacity = '0.7';
  
  try {
    const endpoint = type === 'forecast' ? 'upload/forecast' : 'upload/robillscube';
    const res = await fetch(`${API}/service/${endpoint}`, {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    
    statusEl.innerHTML = `<span style="color:#059669; background:#f0fdf4; padding:8px 12px; border-radius:6px; display:inline-block;">✅ ${data.message}</span>`;
    document.getElementById(formId).reset();
    
    if (type === 'robillscube') {
        loadServiceRecords();
    }
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = `<span style="color:#ef4444; background:#fef2f2; padding:8px 12px; border-radius:6px; display:inline-block;">❌ Error: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

function downloadServiceTemplateByType(event, type) {
  if (event) event.preventDefault();
  const timestamp = new Date().getTime();
  const endpoint = type === 'forecast' ? 'template/forecast' : 'template/robillscube';
  window.open(`${API}/service/${endpoint}?t=${timestamp}`, '_blank');
}

window.addEventListener("DOMContentLoaded", loadServiceRecords);
window.downloadServiceTemplateByType = downloadServiceTemplateByType;
window.uploadServiceFileByType = uploadServiceFileByType;

// ---------- SERVICE PREVIEW MODAL ----------
let servicePreviewPage = 1;
const SERVICE_PREVIEW_PAGE_SIZE = 10;

function openServicePreviewByType(type) {
  currentPreviewType = type;
  servicePreviewPage = 1;

  const modal = document.getElementById('servicePreviewModal');
  const title = document.getElementById('servicePreviewTitle');

  title.textContent = type === 'forecast'
    ? '📊 Preview — Forecast Data (bicoe_forecast_cube)'
    : '📋 Preview — RO Bills Cube (robillscube)';

  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';

  loadServicePreviewPage(1, type);
}

function closeServicePreview() {
  document.getElementById('servicePreviewModal').style.display = 'none';
  document.body.style.overflow = '';
}

async function loadServicePreviewPage(page, typeOverride) {
  const type = typeOverride || document.getElementById('serviceTemplateType').value;
  servicePreviewPage = page;

  const loader = document.getElementById('servicePreviewLoader');
  const empty = document.getElementById('servicePreviewEmpty');
  const table = document.getElementById('servicePreviewTable');
  const countEl = document.getElementById('servicePreviewCount');
  const paginationEl = document.getElementById('servicePreviewPagination');

  loader.style.display = 'block';
  empty.style.display = 'none';
  table.style.display = 'none';
  paginationEl.innerHTML = '';

  try {
    const res = await fetch(`${API}/service/preview/${type}?page=${page}&page_size=${SERVICE_PREVIEW_PAGE_SIZE}`);
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();

    loader.style.display = 'none';

    if (!data.rows || data.rows.length === 0) {
      empty.style.display = 'block';
      countEl.textContent = 'No records found.';
      return;
    }

    const start = (page - 1) * SERVICE_PREVIEW_PAGE_SIZE + 1;
    const end = Math.min(page * SERVICE_PREVIEW_PAGE_SIZE, data.total);
    countEl.textContent = `Showing ${start}–${end} of ${data.total} records`;

    // Build thead
    document.getElementById('servicePreviewThead').innerHTML =
      '<tr>' + data.columns.map(col =>
        `<th style="background:#f8fafc;padding:12px 14px;text-align:left;font-size:12px;font-weight:700;color:#475569;letter-spacing:0.4px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${col}</th>`
      ).join('') + '</tr>';

    // Build tbody
    document.getElementById('servicePreviewTbody').innerHTML = data.rows.map((row, i) =>
      `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">` +
        data.columns.map(col =>
          `<td style="padding:10px 14px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${row[col] ?? '-'}</td>`
        ).join('') +
      '</tr>'
    ).join('');

    table.style.display = 'table';
    renderServicePreviewPagination(Math.ceil(data.total / SERVICE_PREVIEW_PAGE_SIZE), page, type);

  } catch (err) {
    loader.style.display = 'none';
    empty.textContent = 'Failed to load data. Please try again.';
    empty.style.display = 'block';
    console.error(err);
  }
}

function renderServicePreviewPagination(totalPages, currentPage, type) {
  const container = document.getElementById('servicePreviewPagination');
  container.innerHTML = '';

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

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = currentPage === 1;
  prevBtn.style.cssText = `padding:8px 14px;border-radius:10px;border:1px solid #e2e8f0;background:white;font-size:13px;font-weight:600;cursor:pointer;color:#334155;opacity:${currentPage === 1 ? '0.4' : '1'};`;
  prevBtn.onclick = () => { if (currentPage > 1) loadServicePreviewPage(currentPage - 1, type); };
  container.appendChild(prevBtn);

  pages.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p;
    if (p === '...') {
      btn.disabled = true;
      btn.style.cssText = 'padding:8px 10px;border-radius:10px;border:none;background:transparent;font-size:13px;color:#94a3b8;cursor:default;';
    } else {
      const isActive = p === currentPage;
      btn.style.cssText = `padding:8px 13px;border-radius:10px;border:1px solid ${isActive ? 'transparent' : '#e2e8f0'};background:${isActive ? 'linear-gradient(135deg,#0052cc,#3b82f6)' : 'white'};font-size:13px;font-weight:600;cursor:pointer;color:${isActive ? 'white' : '#334155'};`;
      btn.onclick = () => loadServicePreviewPage(p, type);
    }
    container.appendChild(btn);
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.style.cssText = `padding:8px 14px;border-radius:10px;border:1px solid #e2e8f0;background:white;font-size:13px;font-weight:600;cursor:pointer;color:#334155;opacity:${currentPage === totalPages ? '0.4' : '1'};`;
  nextBtn.onclick = () => { if (currentPage < totalPages) loadServicePreviewPage(currentPage + 1, type); };
  container.appendChild(nextBtn);
}

// Close modal when clicking outside
document.getElementById('servicePreviewModal').addEventListener('click', function(e) {
  if (e.target === this) closeServicePreview();
});

window.openServicePreviewByType = openServicePreviewByType;
window.closeServicePreview = closeServicePreview;