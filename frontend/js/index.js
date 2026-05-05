// Using global API from config.js
const statsEndpoint = `${API}/history/stats`;

const ids = {
  salesEnq: document.getElementById("salesEnq"),
  usedEnq: document.getElementById("usedEnq"),
  serviceEnq: document.getElementById("serviceEnq"),
  insuranceEnq: document.getElementById("insuranceEnq"),
  refinancingEnq: document.getElementById("refinancingEnq"),
  aboutUsEnq: document.getElementById("aboutUsEnq"),
  contactEnq: document.getElementById("contactEnq"),
  leadCount: document.getElementById("leadCount"),
  trendBars: document.getElementById("trendBars"),
  trendLabels: document.getElementById("trendLabels"),
  periodTodayBtn: document.getElementById("periodTodayBtn"),
  periodYesterdayBtn: document.getElementById("periodYesterdayBtn"),
  periodWeekBtn: document.getElementById("periodWeekBtn"),
  period15DaysBtn: document.getElementById("period15DaysBtn"),
  loadActionBtn: document.getElementById("loadActionBtn"),
  actionItemsContainer: document.getElementById("actionItemsContainer"),
};

function formatNumber(value) {
  return value != null ? value.toString() : "0";
}

function renderTrend(trend) {
  if (!ids.trendBars || !ids.trendLabels) return;
  
  ids.trendBars.innerHTML = "";
  ids.trendLabels.innerHTML = "";

  if (!trend || trend.length === 0) {
    ids.trendBars.innerHTML = '<div class="trend-empty" style="text-align:center;padding:40px;">No trend data</div>';
    return;
  }

  const maxValue = Math.max(...trend.map((item) => item.count), 1);
  trend.forEach((item, index) => {
    const heightPct = Math.round((item.count / maxValue) * 100);
    const bar = document.createElement("div");
    bar.className = "trend-bar" + (item.count > 0 ? " active-bar" : "");
    bar.style.height = `${heightPct}%`;
    bar.title = `${item.date}: ${item.count} unique users`;
    ids.trendBars.appendChild(bar);

    const label = document.createElement("span");
    // Show only day/month for cleaner display
    label.textContent = item.date.slice(5);
    label.title = item.date;
    ids.trendLabels.appendChild(label);
  });
}

function updateDashboard(data) {
  // Use period_counts when available; fall back to today_counts for backwards compatibility
  const counts = data.period_counts || data.today_counts || data.by_module || {};
  const periodLabel = data.period_label || data.period || "today";
  
  console.log("Dashboard Stats:", {
    sales: counts.sales || 0,
    used_cars: counts.used_cars || 0,
    service: counts.service || 0,
    insurance: counts.insurance || 0,
    refinancing: counts.refinancing || 0,
    about_us: counts.about_us || 0,
    contact: counts.contact || 0,
    total_unique: data.total_unique_users || 0,
    period: data.period || "today"
  });
  
  if (ids.salesEnq) ids.salesEnq.textContent = formatNumber(counts.sales || 0);
  if (ids.usedEnq) ids.usedEnq.textContent = formatNumber(counts.used_cars || 0);
  if (ids.serviceEnq) ids.serviceEnq.textContent = formatNumber(counts.service || 0);
  if (ids.insuranceEnq) ids.insuranceEnq.textContent = formatNumber(counts.insurance || 0);
  if (ids.refinancingEnq) ids.refinancingEnq.textContent = formatNumber(counts.refinancing || 0);
  if (ids.aboutUsEnq) ids.aboutUsEnq.textContent = formatNumber(counts.about_us || 0);
  if (ids.contactEnq) ids.contactEnq.textContent = formatNumber(counts.contact || 0);

  // Calculate total unique users for the period
  const totalLeads = data.total_unique_users || Object.values(counts).reduce((sum, val) => sum + (Number(val) || 0), 0);
  if (ids.leadCount) {
    if (periodLabel === "last_15_days") {
      ids.leadCount.textContent = `${formatNumber(totalLeads)} previous enquiries`;
    } else {
      ids.leadCount.textContent = `${formatNumber(totalLeads)} unique user${totalLeads === 1 ? "" : "s"} (${periodLabel.replace(/_/g, " ")})`;
    }
  }
  
  // Render trend chart
  renderTrend(data.trend || []);
}

function setActivePeriodButton(period) {
  const buttonMap = {
    today: ids.periodTodayBtn,
    yesterday: ids.periodYesterdayBtn,
    week: ids.periodWeekBtn,
    "15days": ids.period15DaysBtn,
  };
  Object.values(buttonMap).forEach(btn => {
    if (!btn) return;
    btn.classList.remove('active');
  });
  const activeBtn = buttonMap[period];
  if (activeBtn) activeBtn.classList.add('active');
}

// Modal Logic
// Full View Toggle Logic
function showAppointmentsView() {
  const dashboard = document.getElementById("dashboardOverview");
  const appointments = document.getElementById("appointmentsView");
  const appContainer = document.querySelector(".app");
  
  if (dashboard) dashboard.style.display = "none";
  if (appointments) appointments.style.display = "block";
  if (appContainer) appContainer.classList.add("sidebar-hidden");
  
  loadActionItems(modalPeriod);
}

function showDashboardOverview() {
  const dashboard = document.getElementById("dashboardOverview");
  const appointments = document.getElementById("appointmentsView");
  const appContainer = document.querySelector(".app");
  
  if (dashboard) dashboard.style.display = "block";
  if (appointments) appointments.style.display = "none";
  if (appContainer) appContainer.classList.remove("sidebar-hidden");
}

function changeModalPeriod(period) {
  modalPeriod = period;
  // Update UI for buttons
  const buttons = {
    today: document.getElementById("modalPeriodToday"),
    yesterday: document.getElementById("modalPeriodYesterday"),
    week: document.getElementById("modalPeriodWeek"),
    "15days": document.getElementById("modalPeriod15Days"),
  };
  Object.keys(buttons).forEach((k) => {
    if (buttons[k]) buttons[k].classList.toggle("active", k === period);
  });
  loadActionItems(period);
}

function filterModalByModule(module) {
  currentModuleFilter = module;
  // Update tab UI
  const tabs = {
    all: document.getElementById("tabAll"),
    sales: document.getElementById("tabSales"),
    used_cars: document.getElementById("tabUsed"),
    insurance: document.getElementById("tabInsurance"),
    service: document.getElementById("tabService"),
    refinancing: document.getElementById("tabRefinancing"),
  };
  Object.keys(tabs).forEach((k) => {
    if (tabs[k]) tabs[k].classList.toggle("active", k === module);
  });

  // Filter and re-render
  let filtered = cachedActionItems;
  if (module !== "all") {
    filtered = cachedActionItems.filter(item => item.module === module);
  }
  renderActionItems(filtered);
}

let modalPeriod = "15days";
let currentModuleFilter = "all";
let cachedActionItems = [];

function renderActionItems(items) {
  const container = document.getElementById("actionItemsContainer");
  if (!container) return;
  
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty-state">No records found for ${currentModuleFilter === 'all' ? 'any module' : currentModuleFilter.replace('_', ' ')}.</div>`;
    return;
  }

  const isInsurance = currentModuleFilter === "insurance";
  const isService = currentModuleFilter === "service";

  const rows = items.map((item) => {
    let brandModelHtml = `
      <td>
        <span class="badge-module badge-${item.module}">${item.brand || '-'}</span>
      </td>
      <td>
        <span class="model-text">${item.model || '-'}</span>
      </td>
    `;

    if (item.module === "insurance") {
      brandModelHtml = `
        <td colspan="2">
          <span class="vehicle-no-tag">🚗 ${item.vehicle_no || '-'}</span>
        </td>
      `;
    } else if (item.module === "service") {
      brandModelHtml = "";
    }

    return `
      <tr>
        <td>
          <span class="customer-name">${item.customer_name}</span>
          <span class="customer-phone">${item.phone}</span>
        </td>
        <td>
          <span class="location-tag">📍 ${item.location}</span>
        </td>
        ${brandModelHtml}
        <td>
          <span class="item-type-label">${item.item_type}</span>
        </td>
        <td>
          <div style="font-size: 13px; font-weight: 600;">${item.appointment_date}</div>
          <div style="font-size: 11px; color: var(--neutral-500);">${item.appointment_time}</div>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <table class="table-premium">
      <thead>
        <tr>
          <th>Customer Details</th>
          <th>Location</th>
          ${isInsurance ? '<th colspan="2">Vehicle No.</th>' : isService ? '' : '<th>Brand</th><th>Model</th>'}
          <th>Test Drive / Appt</th>
          <th>Schedule</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function loadActionItems(period = modalPeriod) {
  const container = document.getElementById("actionItemsContainer");
  if (container) {
    container.innerHTML = '<div class="empty-state">Fetching latest records…</div>';
  }

  try {
    const resp = await fetch(`${API}/history/action-items?period=${period}&limit=200`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
    const data = await resp.json();
    cachedActionItems = data.items || [];
    // Reset to current filter or "all"
    filterModalByModule(currentModuleFilter);
  } catch (error) {
    console.error("Action items load failed:", error);
    if (container) {
      container.innerHTML = '<div class="empty-state">Failed to load data. Please try again.</div>';
    }
  }
}

// Optional: Add period selector functionality
let currentPeriod = "today";

function changePeriod(period) {
  currentPeriod = period;
  loadStatsWithPeriod(period);
}

async function loadStats() {
  loadStatsWithPeriod(currentPeriod);
}

async function loadStatsWithPeriod(period) {
  setActivePeriodButton(period);
  // Show loading state
  const loadingText = "...";
  Object.values(ids).forEach(el => {
    if (el && el.tagName === "DIV" && el.classList?.contains("dash-card-value")) {
      el.textContent = loadingText;
    }
  });
  
  try {
    const resp = await fetch(`${statsEndpoint}?period=${period}`, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`Server returned ${resp.status}`);
    }
    const data = await resp.json();
    updateDashboard(data);
  } catch (error) {
    console.error("Unable to load dashboard stats:", error);
    // Show error state
    Object.values(ids).forEach(el => {
      if (el && el.tagName === "DIV" && el.classList?.contains("dash-card-value")) {
        el.textContent = "Err";
      }
    });
    if (ids.leadCount) ids.leadCount.textContent = "0 leads";
  }
}

// Auto-refresh every 30 seconds
window.addEventListener("DOMContentLoaded", () => {
  loadStats();
  // Optional: refresh stats every 30 seconds
  setInterval(() => loadStatsWithPeriod(currentPeriod), 30000);
});

// Expose functions to window for onclick handlers
window.changePeriod = changePeriod;
window.showAppointmentsView = showAppointmentsView;
window.showDashboardOverview = showDashboardOverview;
window.changeModalPeriod = changeModalPeriod;
window.loadActionItems = loadActionItems;
window.filterModalByModule = filterModalByModule;