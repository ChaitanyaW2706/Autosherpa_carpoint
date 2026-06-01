// Using global API from config.js

let currentFilter = null;
let currentIntentFilter = 'all';
let allLeads = [];
let editingLeadId = null;
let phoneNumberError = null;

function filterByStat(intent) {
  // Update active class on stat cards
  document.querySelectorAll('.stat-card').forEach(card => {
    card.classList.remove('active');
  });
  
  const cards = document.querySelectorAll('.stat-card');
  const intents = ['all', 'loan_against_car', 'loan_transfer', 'eligibility', 'refinancing'];
  const cardIndex = intents.indexOf(intent);
  if (cardIndex !== -1 && cards[cardIndex]) {
    cards[cardIndex].classList.add('active');
  }
  
  const leadsContainer = document.querySelector('.leads-container');
  
  if (leadsContainer) leadsContainer.style.display = 'block';
  currentIntentFilter = intent === 'all' ? null : intent;
  loadLeads(null, intent === 'all' ? null : intent);
}

function normalizeIntentFilter(intent) {
  const intentLower = (intent || '').toLowerCase();
  // Map various intent_type values to standard types for filtering
  if (intentLower.includes('against') || intentLower.includes('loan against')) {
    return 'loan_against_car';
  } else if (intentLower.includes('transfer')) {
    return 'loan_transfer';
  } else if (intentLower.includes('emi') || intentLower.includes('refinanc') || intentLower.includes('reduce')) {
    return 'refinancing';
  } else if (intentLower.includes('eligib')) {
    return 'eligibility';
  }
  return intent;
}

function openLeadModal(lead = null) {
  editingLeadId = lead ? lead.id : null;
  document.getElementById('modalTitle').textContent = lead ? 'Edit Refinancing Lead' : 'Add Refinancing Lead';
  document.getElementById('leadId').value = lead ? lead.id : '';
  document.getElementById('customerName').value = lead ? (lead.customer_name || '') : '';
  document.getElementById('phoneNumber').value = lead ? (lead.phone_number || '') : '';
  document.getElementById('city').value = lead ? (lead.city || '') : '';
  document.getElementById('intentType').value = lead ? (lead.intent_type || 'refinancing') : 'refinancing';
  document.getElementById('carBrand').value = lead ? (lead.car_brand || '') : '';
  document.getElementById('carModel').value = lead ? (lead.car_model || '') : '';
  document.getElementById('yearOfManufacture').value = lead ? (lead.year_of_manufacture || '') : '';
  document.getElementById('loanRequirement').value = lead ? (lead.loan_requirement || '') : '';
  document.getElementById('remainingLoanAmt').value = lead ? (lead.remaining_loan_amt || '') : '';
  document.getElementById('contactPreference').value = lead ? (lead.contact_preference || '') : '';
  document.getElementById('status').value = lead ? (lead.status || 'new') : 'new';
  
  // View Switch
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('leadFormView').classList.remove('hidden');
  window.scrollTo(0, 0);
}

function closeLeadModal() {
  document.getElementById('dashboardView').classList.remove('hidden');
  document.getElementById('leadFormView').classList.add('hidden');
  resetLeadForm();
  editingLeadId = null;
}

function resetLeadForm() {
  document.getElementById('customerName').value = '';
  document.getElementById('phoneNumber').value = '';
  document.getElementById('city').value = '';
  document.getElementById('intentType').value = 'refinancing';
  document.getElementById('carBrand').value = '';
  document.getElementById('carModel').value = '';
  document.getElementById('yearOfManufacture').value = '';
  document.getElementById('loanRequirement').value = '';
  document.getElementById('remainingLoanAmt').value = '';
  document.getElementById('contactPreference').value = '';
  document.getElementById('status').value = 'new';
}

function checkPhoneNumberDuplicate() {
  const phoneInput = document.getElementById('phoneNumber');
  const phoneNumber = phoneInput.value.trim();
  
  // Clear previous error
  phoneNumberError = null;
  const errorElement = document.getElementById('phoneNumberError');
  if (errorElement) errorElement.remove();
  
  if (!phoneNumber) return true;
  
  // Check if phone number exists in allLeads (and not the current being edited)
  const duplicate = allLeads.find(lead => 
    lead.phone_number === phoneNumber && 
    lead.id !== editingLeadId
  );
  
  if (duplicate) {
    phoneNumberError = `Phone number already exists for customer '${duplicate.customer_name}'`;
    const errorMsg = document.createElement('div');
    errorMsg.id = 'phoneNumberError';
    errorMsg.style.cssText = 'color: #dc2626; font-size: 12px; margin-top: 4px; font-weight: 500;';
    errorMsg.textContent = phoneNumberError;
    phoneInput.parentElement.appendChild(errorMsg);
    phoneInput.style.borderColor = '#dc2626';
    return false;
  }
  
  phoneInput.style.borderColor = '#dbeafe';
  return true;
}

async function saveLead() {
  const payload = {
    customer_name: document.getElementById('customerName').value.trim(),
    phone_number: document.getElementById('phoneNumber').value.trim(),
    city: document.getElementById('city').value.trim(),
    intent_type: document.getElementById('intentType').value,
    car_brand: document.getElementById('carBrand').value.trim(),
    car_model: document.getElementById('carModel').value.trim(),
    year_of_manufacture: document.getElementById('yearOfManufacture').value.trim() || null,
    loan_requirement: document.getElementById('loanRequirement').value.trim() || null,
    remaining_loan_amt: document.getElementById('remainingLoanAmt').value.trim() || null,
    contact_preference: document.getElementById('contactPreference').value.trim(),
    status: document.getElementById('status').value
  };

  // Validation
  if (!payload.customer_name) {
    alert('Customer name is required');
    document.getElementById('customerName').focus();
    return;
  }
  if (!payload.phone_number) {
    alert('Phone number is required');
    document.getElementById('phoneNumber').focus();
    return;
  }
  if (!payload.intent_type) {
    alert('Type is required');
    document.getElementById('intentType').focus();
    return;
  }
  
  // Check for duplicate phone number
  if (!checkPhoneNumberDuplicate()) {
    document.getElementById('phoneNumber').focus();
    return;
  }

  try {
    const url = editingLeadId ? `${API}/refinancing/leads/${editingLeadId}` : `${API}/refinancing/leads`;
    const method = editingLeadId ? 'PUT' : 'POST';

    console.log(`${method} request to:`, url);
    console.log('Payload:', payload);

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log(`Response status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const errorData = await res.json();
      const errorMsg = errorData.detail || errorData.message || `HTTP Error ${res.status}`;
      
      console.error('API Error:', errorData);
      
      // Handle duplicate phone number error from backend
      if (res.status === 409 && errorMsg.includes('Phone number already exists')) {
        document.getElementById('phoneNumber').style.borderColor = '#dc2626';
        const errorElement = document.createElement('div');
        errorElement.id = 'phoneNumberError';
        errorElement.style.cssText = 'color: #dc2626; font-size: 12px; margin-top: 4px; font-weight: 500;';
        errorElement.textContent = errorMsg;
        const existingError = document.getElementById('phoneNumberError');
        if (existingError) existingError.remove();
        document.getElementById('phoneNumber').parentElement.appendChild(errorElement);
        return;
      }
      
      // Handle validation errors
      if (res.status === 422) {
        alert(`Validation Error: Please check all required fields are filled correctly.\\n\\nDetails: ${errorMsg}`);
        console.error('Validation errors:', errorData);
      } else {
        alert(`Error: ${errorMsg}`);
      }
      return;
    }

    closeLeadModal();
    loadLeads(currentFilter);
    loadStats();
  } catch (error) {
    console.error('Failed to save lead:', error);
    alert('Unable to save lead. Please check the data and try again.');
  }
}

async function deleteLead(leadId) {
  if (!confirm('Delete this lead permanently?')) return;

  try {
    const res = await fetch(`${API}/refinancing/leads/${leadId}`, { method: 'DELETE' });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Failed to delete lead');
    }
    loadLeads(currentFilter);
    loadStats();
  } catch (error) {
    console.error('Failed to delete lead:', error);
    alert('Unable to delete lead. Please try again.');
  }
}

function editLead(leadId) {
  const lead = allLeads.find(item => item.id === leadId);
  if (lead) openLeadModal(lead);
}

async function loadStats() {
  try {
    const res = await fetch(`${API}/refinancing/stats`);
    const data = await res.json();
    
    document.getElementById('totalCount').textContent = data.total || 0;
    document.getElementById('loanAgainstCarCount').textContent = data.loan_against_car || 0;
    document.getElementById('loanTransferCount').textContent = data.loan_transfer || 0;
    document.getElementById('eligibilityCount').textContent = data.eligibility || 0;
    document.getElementById('refinancingCount').textContent = data.refinancing || 0;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadLeads(status = null, intent = null) {
  try {
    let url = `${API}/refinancing/leads`;
    const params = [];
    
    if (status) params.push(`status=${status}`);
    if (intent) params.push(`intent=${intent}`);
    
    if (params.length > 0) {
      url += '?' + params.join('&');
    }
    
    const res = await fetch(url);
    const data = await res.json();
    
    allLeads = data.leads || [];
    currentFilter = status;
    currentIntentFilter = intent;
    
    // Update title based on filters
    let title = "All Refinancing Leads";
    if (intent === "loan_against_car") title = "🚗 Loan Against Car Leads";
    else if (intent === "loan_transfer") title = "💳 Loan Transfer Leads";
    else if (intent === "eligibility") title = "✅ Eligibility Check Leads";
    else if (intent === "refinancing") title = "💰 EMI/Refinancing Leads";
    else if (status === "new") title = "📝 New Leads";
    else if (status === "contacted") title = "📞 Contacted Leads";
    else if (status === "approved") title = "✅ Approved Leads";
    
    document.getElementById('leadsTitle').textContent = title;
    
    renderLeads(allLeads);
  } catch (error) {
    console.error('Failed to load leads:', error);
    document.getElementById('leadsContent').innerHTML = `<div class="empty-state"><p>Error loading leads</p></div>`;
  }
}

function applyIntentFilter() {
  if (!currentIntentFilter) {
    loadLeads(currentFilter);
    return;
  }
  loadLeads(currentFilter, currentIntentFilter);
}

function updateTitle(title) {
  document.getElementById('leadsTitle').textContent = title;
}

function renderLeads(leads) {
  const container = document.getElementById('leadsContent');
  
  if (!leads || leads.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No leads found</p></div>`;
    return;
  }
  
  const tableHTML = `
    <table class="leads-table">
      <thead>
        <tr>
          <th>Customer Name</th>
          <th>Location</th>
          <th>Contact Number</th>
          <th>Type</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${leads.map(lead => `
          <tr>
            <td>${escapeHtml(lead.customer_name || '—')}</td>
            <td>${escapeHtml(lead.city || '—')}</td>
            <td><a href="tel:${escapeHtml(lead.phone_number || '')}" style="color: #0052cc; text-decoration: none; font-weight: 600;">${escapeHtml(lead.phone_number || '—')}</a></td>
            <td>${formatIntentType(lead.intent_type)}</td>
            <td class="table-actions">
              <button class="action-button" onclick="editLead(${lead.id})">Edit</button>
              <button class="action-button" onclick="deleteLead(${lead.id})">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  container.innerHTML = tableHTML;
}

function formatIntentType(intent) {
  const map = {
    'refinancing': 'Refinancing',
    'loan_against_car': 'Against Car',
    'loan_transfer': 'Transfer',
    'eligibility': 'Eligibility'
  };
  return map[intent] || intent || '—';
}

function formatStatus(status) {
  if (status === "new") return "New";
  if (status === "contacted") return "Contacted";
  if (status === "approved") return "Approved";
  return status || "Unknown";
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return dateStr;
  }
}

function formatNumber(num) {
  if (!num) return "0";
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

async function normalizeDatabase() {
  try {
    const res = await fetch(`${API}/refinancing/normalize-intent-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (res.ok) {
      console.log('Database normalized successfully');
      // Reload data after normalization
      loadStats();
      loadLeads();
    }
  } catch (error) {
    console.error('Error normalizing database:', error);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Normalize database on first load
  normalizeDatabase();
  
  loadStats();
  loadLeads(); // Load all leads by default
  const cards = document.querySelectorAll('.stat-card');
  if (cards.length > 0) {
    cards[0].classList.add('active');
  }
  
  // Real-time phone number validation
  const phoneInput = document.getElementById('phoneNumber');
  if (phoneInput) {
    phoneInput.addEventListener('blur', checkPhoneNumberDuplicate);
    phoneInput.addEventListener('change', checkPhoneNumberDuplicate);
  }
});



window.loadStats = loadStats;
window.loadLeads = loadLeads;
window.filterByStat = filterByStat;
window.openLeadModal = openLeadModal;
window.closeLeadModal = closeLeadModal;
window.resetLeadForm = resetLeadForm;
window.saveLead = saveLead;
window.editLead = editLead;
window.deleteLead = deleteLead;
window.checkPhoneNumberDuplicate = checkPhoneNumberDuplicate;
window.normalizeDatabase = normalizeDatabase;
