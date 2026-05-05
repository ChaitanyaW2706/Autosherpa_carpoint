// Using global API from config.js

let locations = [];

async function loadLocations() {
  const container = document.getElementById('locationsContainer');
  container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 40px;">Loading locations...</div>';

  try {
    const res = await fetch(`${API}/locations/locations`);
    if (!res.ok) throw new Error(`Server ${res.status}`);
    locations = await res.json();

    if (!locations.length) {
      container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 40px;">No locations found. Click "Add Location" to get started.</div>';
      return;
    }

    container.innerHTML = locations.map(loc => `
      <div class="location-card">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <h3>📍 ${escapeHtml(loc.location_name || 'Unnamed Location')}</h3>
            <div class="location-info">
              <div class="info-field">
                <strong>Address</strong>
                ${escapeHtml(loc.address || '—')}
              </div>
              <div class="info-field">
                <strong>Phone</strong>
                <a href="tel:${escapeHtml(loc.phone || '')}" style="color: #0f72f8; text-decoration: none;">
                  ${escapeHtml(loc.phone || '—')}
                </a>
              </div>
              <div class="info-field">
                <strong>Email</strong>
                <a href="mailto:${escapeHtml(loc.email || '')}" style="color: #0f72f8; text-decoration: none;">
                  ${escapeHtml(loc.email || '—')}
                </a>
              </div>
              <div class="info-field">
                <strong>Hours</strong>
                ${escapeHtml(loc.hours || '—').replace(/\n/g, '<br>')}
              </div>
            </div>
            ${loc.map_url ? `
              <div style="margin-top: 12px;">
                <a href="${escapeHtml(loc.map_url)}" target="_blank" style="color: #0f72f8; text-decoration: none;">
                  📍 View on Map
                </a>
              </div>
            ` : ''}
          </div>
          <div style="flex-shrink: 0; display: flex; gap: 8px;">
            <span style="background: ${loc.status === 'active' ? '#dcfce7' : '#fef2f2'}; color: ${loc.status === 'active' ? '#166534' : '#991b1b'}; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 500;">
              ${loc.status === 'active' ? '✓ Active' : '✗ Inactive'}
            </span>
          </div>
        </div>
        <div class="location-actions">
          <button class="btn-small btn-edit" onclick="openEditLocationModal(${loc.id})">Edit</button>
          <button class="btn-small btn-delete" onclick="deleteLocation(${loc.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load locations:', error);
    container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">Unable to load locations</div>';
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
    status: document.getElementById('status').value,
  };

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
