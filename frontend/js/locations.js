// Using global API from config.js

let locations = [];

async function loadLocations() {
  const body = document.getElementById('locationsBody');
  body.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 40px;">Loading locations...</td></tr>';

  try {
    const res = await fetch(`${API}/locations/locations`);
    if (!res.ok) throw new Error(`Server ${res.status}`);
    locations = await res.json();

    if (!locations.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 40px;">No locations found. Click "+ Add Location" to get started.</td></tr>';
      return;
    }

    body.innerHTML = locations.map(loc => `
      <tr>
        <td style="font-weight: 700; color: #0052cc;">
          ${escapeHtml(loc.location_name || 'Unnamed')}
        </td>
        <td style="max-width: 200px;">
          ${escapeHtml(loc.address || '—')}
          ${loc.map_url ? `
            <div style="margin-top: 4px;">
              <a href="${escapeHtml(loc.map_url)}" target="_blank" style="color: #2563eb; font-size: 11px; text-decoration: none;">📍 Map</a>
            </div>
          ` : ''}
        </td>
        <td>
          <div style="font-size: 13px;">📞 ${escapeHtml(loc.phone || '—')}</div>
          <div style="font-size: 13px; color: #64748b;">✉️ ${escapeHtml(loc.email || '—')}</div>
        </td>
        <td style="font-size: 12px; color: #475569;">
          ${escapeHtml(loc.hours || '—').replace(/\n/g, '<br>')}
        </td>
        <td>
          <span class="badge-module">${escapeHtml(loc.module || 'All')}</span>
        </td>
        <td>
          <span class="badge-status ${loc.status === 'active' ? 'badge-active' : 'badge-inactive'}">
            ${loc.status === 'active' ? '✓ Active' : '✗ Inactive'}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-icon btn-icon-edit" onclick="openEditLocationModal(${loc.id})" title="Edit">✏️</button>
            <button class="btn-icon btn-icon-delete" onclick="deleteLocation(${loc.id})" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load locations:', error);
    body.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 40px;">Unable to load locations</td></tr>';
  }
}

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function openAddLocationModal() {
  document.getElementById('modalTitle').textContent = 'Add Location';
  document.getElementById('locationId').value = '';
  document.getElementById('locationName').value = '';
  document.getElementById('address').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('email').value = '';
  document.getElementById('hours').value = '';
  document.getElementById('latitude').value = '';
  document.getElementById('longitude').value = '';
  document.getElementById('mapUrl').value = '';
  document.getElementById('module').value = '';
  document.getElementById('status').value = 'active';
  
  const modal = document.getElementById('locationModal');
  modal.classList.add('visible');
}

function openEditLocationModal(id) {
  const location = locations.find(l => l.id === id);
  if (!location) return alert('Location not found');

  document.getElementById('modalTitle').textContent = 'Edit Location';
  document.getElementById('locationId').value = location.id;
  document.getElementById('locationName').value = location.location_name || '';
  document.getElementById('address').value = location.address || '';
  document.getElementById('phone').value = location.phone || '';
  document.getElementById('email').value = location.email || '';
  document.getElementById('hours').value = location.hours || '';
  document.getElementById('latitude').value = location.latitude || '';
  document.getElementById('longitude').value = location.longitude || '';
  document.getElementById('mapUrl').value = location.map_url || '';
  document.getElementById('module').value = location.module || 'All';
  document.getElementById('status').value = location.status || 'active';

  const modal = document.getElementById('locationModal');
  modal.classList.add('visible');
}

function closeLocationModal() {
  const modal = document.getElementById('locationModal');
  modal.classList.remove('visible');
}

async function saveLocation() {
  const id = document.getElementById('locationId').value;
  const body = {
    location_name: document.getElementById('locationName').value.trim(),
    address: document.getElementById('address').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    hours: document.getElementById('hours').value.trim(),
    latitude: document.getElementById('latitude').value ? parseFloat(document.getElementById('latitude').value) : null,
    longitude: document.getElementById('longitude').value ? parseFloat(document.getElementById('longitude').value) : null,
    map_url: document.getElementById('mapUrl').value.trim(),
    module: document.getElementById('module').value,
    status: document.getElementById('status').value,
  };

  if (!body.module) return alert('Please select a module');
  if (!body.location_name) return alert('Location name is required');
  if (!body.address) return alert('Address is required');
  if (!body.phone) return alert('Phone is required');

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API}/locations/locations/${id}` : `${API}/locations/locations`;
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server ${res.status}`);
    }

    alert(id ? 'Location updated successfully' : 'Location created successfully');
    closeLocationModal();
    await loadLocations();
  } catch (error) {
    console.error('Failed to save location:', error);
    alert('Error: ' + error.message);
  }
}

async function deleteLocation(id) {
  if (!confirm('Delete this location? This cannot be undone.')) return;

  try {
    const res = await fetch(`${API}/locations/locations/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server ${res.status}`);
    }
    alert('Location deleted successfully');
    await loadLocations();
  } catch (error) {
    console.error('Failed to delete location:', error);
    alert('Error: ' + error.message);
  }
}


window.addEventListener('DOMContentLoaded', () => {
  loadLocations();
});

window.loadLocations = loadLocations;
window.openAddLocationModal = openAddLocationModal;
window.openEditLocationModal = openEditLocationModal;
window.closeLocationModal = closeLocationModal;
window.saveLocation = saveLocation;
window.deleteLocation = deleteLocation;
