// Using global API from config.js

async function loadUsedCarSessions() {
  const tbody = document.getElementById("usedCarTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Loading used car enquiries…</td></tr>`;

  try {
    const res = await fetch(`${API}/history/sessions?module=used_cars&limit=100`);
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    const sessions = data.sessions || [];

    if (!sessions.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No used car enquiries found.</td></tr>`;
      return;
    }

    tbody.innerHTML = sessions.map((session, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${session.user_phone || "—"}</td>
        <td>${escapeHtml(session.action)}</td>
        <td>${session.status || "—"}</td>
        <td>${session.date || "—"}</td>
        <td>${session.duration || "—"}</td>
      </tr>
    `).join("");
  } catch (error) {
    console.error("Failed to load used car sessions:", error);
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Unable to load used car enquiries.</td></tr>`;
  }
}

function escapeHtml(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function getUsedCarImageSrc(imageUrlData) {
  if (!imageUrlData) return null;

  const dataStr = String(imageUrlData).trim();

  if (!dataStr) return null;

  if (dataStr.startsWith('data:')) {
    return dataStr;
  }

  if (dataStr.startsWith('[')) {
    try {
      const imageArray = JSON.parse(dataStr);
      if (Array.isArray(imageArray) && imageArray.length > 0) {
        return getUsedCarImageSrc(String(imageArray[0]).trim());
      }
    } catch (e) {
      // Not a valid JSON array, continue
    }
  }

  const delimiters = [',', '|||', '||'];
  for (const delimiter of delimiters) {
    if (dataStr.includes(delimiter)) {
      const parts = dataStr.split(delimiter).map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length > 1) {
        return getUsedCarImageSrc(parts[0]);
      }
    }
  }

  return processImageUrl(dataStr);
}

function processImageUrl(value) {
  if (!value) return null;

  const trimmed = value.trim();

  // If it's a URL (http/https), return as-is
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If it's a relative URL
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // If it already has data: prefix
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }

  // Try to detect and convert base64 to data URL
  const cleaned = trimmed.replace(/\s/g, '');

  // Check for base64 image signatures
  if (cleaned.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${cleaned}`;
  }

  if (cleaned.startsWith('iVBOR')) {
    return `data:image/png;base64,${cleaned}`;
  }

  if (cleaned.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${cleaned}`;
  }

  if (cleaned.startsWith('UklGR')) {
    return `data:image/webp;base64,${cleaned}`;
  }

  // If it looks like base64 (has common base64 characters)
  if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 100) {
    try {
      // Validate it's valid base64
      atob(cleaned.substring(0, Math.min(100, cleaned.length)));
      // Assume JPEG if we can't determine type but it's valid base64
      return `data:image/jpeg;base64,${cleaned}`;
    } catch (e) {
      console.warn('Invalid base64 data for car image');
    }
  }

  return null;
}

let usedCarInventory = [];
let pendingViewCarImages = {};
let currentReportPage = 1;
const itemsPerReportPage = 10;
let currentActivityReportPage = 1;
let currentReportTab = 'stock';
let currentActivityType = 'Used Car Test Drive';
let allActivityEnquiries = [];

function renderUsedCarInventory(cars) {
  const grid = document.getElementById('usedCarInventoryGrid');
  const empty = document.getElementById('usedCarInventoryEmpty');
  if (!grid || !empty) return;

  grid.innerHTML = '';

  if (!cars.length) {
    empty.classList.remove('hidden');
    updateUsedCarCount(0, usedCarInventory.length);
    return;
  }

  empty.classList.add('hidden');
  updateUsedCarCount(cars.length, usedCarInventory.length);

  for (const car of cars) {
    const card = document.createElement('div');
    card.className = 'usedcar-card';

    // Pick best thumbnail: dedicated column → front → back → right → left → interior → first available
    const imgStore = parseImageStore(car.image_url);
    const rawImage = car.front_view_image || car.back_view_image || car.right_view_image ||
                     imgStore.front || imgStore.back || imgStore.right ||
                     imgStore.left || imgStore.interior || null;
    const imageSrc = getUsedCarImageSrc(rawImage);

    // Serial/key for API calls
    const serial = escapeHtml(car.serial_number || car.registration_number || car.chassis_number || '');

    // Status badge — mapped from ready_for_sales column
    const statusRaw = (car.ready_for_sales || '').toString().trim();
    const statusKey = statusRaw.toLowerCase();
    const statusClass = statusKey === 'sold' ? 'sold' : statusKey === 'booked' ? 'booked' : 'available';
    const statusLabel = statusRaw || 'Available';

    // All fields mapped directly from carstockdata columns
    const titleLabel = `${car.make || ''} ${car.model || ''}`.trim() || 'Unknown Car';
    const regNo = car.registration_number || '—';
    const year = car.manufacturing_year ? String(car.manufacturing_year) : '—';
    const fuel = car.fuel_type || '—';
    const mileage = car.mileage_km != null ? `${car.mileage_km} km` : '—';
    const modelOnly = car.model || '—';
    const carType = car.type || car.vehicle_category || '—';
    const color = car.color || '—';
    const price = car.estimated_selling_price
      ? '₹' + Number(car.estimated_selling_price).toLocaleString('en-IN')
      : '—';
    const yearFuelLabel = `${year} • ${fuel}`;
    const cardAltText = titleLabel;

    let imageHtml = '';
    if (imageSrc) {
      imageHtml = `
        <img
          src="${escapeHtml(imageSrc)}"
          alt="${escapeHtml(cardAltText)}"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          style="width:100%; height:220px; object-fit:cover; display:block;">
        <div style="display:none; width:100%; height:220px; align-items:center; justify-content:center; background:#f1f5f9; color:#94a3b8; font-size:2rem;">🚗</div>
      `;
    } else {
      imageHtml = `<div style="width:100%; height:220px; display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#94a3b8; font-size:2rem;">🚗</div>`;
    }

    card.innerHTML = `
      <div style="position:relative; overflow:hidden;">
        ${imageHtml}
        <span class="card-badge ${statusClass}" style="position:absolute; top:12px; right:12px;">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="usedcar-card-meta">
        <h4 style="margin:0 0 4px; font-size:1.05rem; font-weight:700; color:#111827;">${escapeHtml(titleLabel)}</h4>
        <div class="meta-item"><span class="meta-icon">🪪</span>${escapeHtml(regNo)}</div>
        <div class="meta-item"><span class="meta-icon">📅</span>${escapeHtml(yearFuelLabel)}</div>
        <div class="meta-item"><span class="meta-icon">🚘</span>${escapeHtml(modelOnly)}</div>
        <div class="meta-item"><span class="meta-icon">🏷️</span>${escapeHtml(carType)}</div>
        <div class="meta-item"><span class="meta-icon">🎨</span>${escapeHtml(color)}</div>
        <div class="meta-item"><span class="meta-icon">🛣️</span>${escapeHtml(mileage)}</div>
        <div class="price-text">${price}</div>
      </div>
      <div class="usedcar-card-footer">
        <button class="btn-view" data-serial="${serial}" onclick="openViewUsedCarModal(this.dataset.serial)">👁️ View Details</button>
        <button class="btn-edit" data-serial="${serial}" onclick="openEditUsedCarModal(this.dataset.serial)">✏️ Edit</button>
        <button class="btn-delete" data-serial="${serial}" onclick="deleteUsedCar(this.dataset.serial)">🗑️</button>
      </div>
    `;
    grid.appendChild(card);
  }
}

function updateUsedCarCount(visibleCount, totalCount) {
  const countEl = document.getElementById('usedCarCount');
  if (!countEl) return;
  countEl.textContent = totalCount === 0
    ? 'No cars available'
    : `Showing ${visibleCount} of ${totalCount} cars`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '—';
}

function formatDateForDisplay(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-IN');
}

async function fetchUsedCarFromServer(serial) {
  if (!serial) throw new Error('No serial provided');
  const res = await fetch(`${API}/usedcar/stock/${encodeURIComponent(serial)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server ${res.status}`);
  }
  return res.json();
}

async function openViewUsedCarModal(serial) {
  try {
    const car = await fetchUsedCarFromServer(serial);
    setText('viewCarTitle', `${car.make || 'Unknown'} ${car.model || ''}`.trim());
    setText('viewRegistrationNumber', car.registration_number);
    setText('viewBrand', car.make);
    setText('viewModel', car.model);
    setText('viewVariant', car.variant);
    setText('viewType', car.type || car.vehicle_category);
    setText('viewYear', car.manufacturing_year ? String(car.manufacturing_year) : '—');
    setText('viewColor', car.color);
    setText('viewCategory', car.Category || car.vehicle_category);
    setText('viewFuelType', car.fuel_type);
    setText('viewTransmission', car.transmission_type);
    setText('viewMileage', car.mileage_km ? `${car.mileage_km} km` : '—');
    setText('viewCubicCapacity', car.cubic_capacity_cc ? `${car.cubic_capacity_cc} cc` : '—');
    setText('viewPrice', car.estimated_selling_price ? `₹${Number(car.estimated_selling_price).toLocaleString('en-IN')}` : '—');
    setText('viewRcStatus', car.rc_status);
    setText('viewRcExpiryDate', formatDateForDisplay(car.rc_expiry_date));
    setText('viewEngineNumber', car.engine_number);
    setText('viewChassisNumber', car.chassis_number);
    setText('viewInsuranceType', car.insurance_type);
    setText('viewInsuranceExpiryDate', formatDateForDisplay(car.insurance_expiry_date));
    const imgData = parseImageStore(car.image_url);
    displayCarImageView('viewBackViewImage',  car.back_view_image  || imgData.back     || null, 'Back View');
    displayCarImageView('viewRightViewImage', car.right_view_image || imgData.right    || null, 'Right View');
    displayCarImageView('viewFrontViewImage', car.front_view_image || imgData.front    || null, 'Front View');
    displayCarImageView('viewLeftViewImage',  car.left_view_image  || imgData.left     || null, 'Left View');
    displayCarImageView('viewInteriorImage',  car.interior_image   || imgData.interior || null, 'Interior');
    document.getElementById('viewUsedCarSerial').value = serial;
    pendingViewCarImages = {};
    document.querySelectorAll('#viewUsedCarModal input[type=file]').forEach(input => input.value = '');

    const modal = document.getElementById('viewUsedCarModal');
    if (modal) {
      modal.classList.add('drawer-open');
      document.body.style.overflow = 'hidden';
    }
  } catch (error) {
    console.error('Failed to load used car details:', error);
    alert('Failed to load used car details: ' + error.message);
  }
}

function parseImageUrls(imageData) {
  if (!imageData) return [];

  const dataStr = String(imageData).trim();

  if (!dataStr) return [];

  // If this is a data URL, keep it whole
  if (dataStr.startsWith('data:')) {
    return [dataStr];
  }

  // Try to parse as JSON array first
  if (dataStr.startsWith('[')) {
    try {
      const imageArray = JSON.parse(dataStr);
      if (Array.isArray(imageArray)) {
        return imageArray.map(img => String(img).trim()).filter(url => url.length > 0);
      }
    } catch (e) {
      console.warn('Failed to parse image JSON array:', e);
    }
  }

  // Split comma-separated lists of URLs or base64 data.
  // Data URLs are already handled above, so it's safe to split on commas here.
  if (dataStr.includes(',')) {
    const parts = dataStr.split(',').map(url => url.trim()).filter(url => url.length > 0);
    if (parts.length > 1) {
      return parts;
    }
  }

  if (dataStr.includes('|||')) {
    return dataStr.split('|||').map(url => url.trim()).filter(url => url.length > 0);
  }

  if (dataStr.includes('||')) {
    return dataStr.split('||').map(url => url.trim()).filter(url => url.length > 0);
  }

  // Single image
  return [dataStr];
}

/**
 * Parse image_url into a label-keyed object {back, right, front, left, interior}.
 * Handles: JSON object, legacy JSON array (position-based), single URL/base64.
 */
function parseImageStore(raw) {
  if (!raw) return {};
  const s = String(raw).trim();
  if (!s) return {};

  // Already a JSON object {"back":..., "front":...}
  if (s.startsWith('{')) {
    try { return JSON.parse(s); } catch(e) {}
  }

  // Legacy JSON array — map by position
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      const keys = ['back', 'right', 'front', 'left', 'interior'];
      const obj = {};
      arr.forEach((v, i) => { if (i < keys.length && v) obj[keys[i]] = v; });
      return obj;
    } catch(e) {}
  }

  // Single image — treat as back view
  if (s) return { back: s };
  return {};
}

function displayCarImageView(elementId, imageData, viewName) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const imageSrc = getUsedCarImageSrc(imageData);
  if (imageSrc) {
    element.innerHTML = `<img src="${escapeHtml(imageSrc)}" alt="${viewName}" style="width:100%; height:160px; object-fit:contain; border-radius:14px;" onerror="this.parentElement.innerHTML=getImagePlaceholderHtml('${viewName}');">`;
    // Show remove button
    const wrap = element.closest('.img-slot-wrap');
    if (wrap) {
      const btn = wrap.querySelector('.img-remove-btn');
      if (btn) btn.style.display = 'flex';
    }
  } else {
    element.innerHTML = getImagePlaceholderHtml(viewName);
    // Hide remove button when no image
    const wrap = element.closest('.img-slot-wrap');
    if (wrap) {
      const btn = wrap.querySelector('.img-remove-btn');
      if (btn) btn.style.display = 'none';
    }
  }
}

function getImagePlaceholderHtml(viewName) {
  return `<div class="img-placeholder">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M21 15l-5-5L5 21"/>
    </svg>
    <span>${viewName}</span>
  </div>`;
}

async function removeCarImage(field) {
  const serial = document.getElementById('viewUsedCarSerial')?.value;
  if (!serial) return alert('No car selected.');

  const label = field === 'all' ? 'all images' : field.replace(/_/g, ' ');
  if (!confirm(`Remove ${label}?`)) return;

  try {
    const res = await fetch(`${API}/usedcar/stock/${encodeURIComponent(serial)}/remove-image`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server ${res.status}`);
    }
    await openViewUsedCarModal(serial);
  } catch (error) {
    alert('Failed to remove image: ' + error.message);
  }
}

function handleViewImageUpload(event, fieldKey, previewElementId, viewName) {
  const file = event.target.files?.[0];
  if (!file) return;

  fileToBase64(file).then(base64 => {
    pendingViewCarImages[fieldKey] = base64;
    displayCarImageView(previewElementId, base64, viewName);
  }).catch(error => {
    console.error('Failed to convert image to base64:', error);
    alert('Unable to convert image to base64. Please try another file.');
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveViewUploadedImages() {
  const serial = document.getElementById('viewUsedCarSerial')?.value;
  if (!serial) return alert('No used car selected for image upload.');

  if (!Object.keys(pendingViewCarImages).length) {
    return alert('Please select at least one image to upload.');
  }

  try {
    const body = { ...pendingViewCarImages };

    // Send only the separate image fields when updating view uploads.
    // Avoid writing a huge JSON array into the legacy image_url column.
    delete body.image_url;

    const res = await fetch(`${API}/usedcar/stock/${encodeURIComponent(serial)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server ${res.status}`);
    }
    alert('Images uploaded successfully.');
    await openViewUsedCarModal(serial);
  } catch (error) {
    console.error('Failed to upload car images:', error);
    alert('Failed to upload car images: ' + error.message);
  }
}

function resetViewImageUploads() {
  pendingViewCarImages = {};
  document.querySelectorAll('#viewUsedCarModal input[type=file]').forEach(input => input.value = '');
  const serial = document.getElementById('viewUsedCarSerial')?.value;
  if (serial) openViewUsedCarModal(serial);
}

function closeViewUsedCarModal() {
  const modal = document.getElementById('viewUsedCarModal');
  if (modal) {
    modal.classList.remove('drawer-open');
    document.body.style.overflow = '';
  }
}

async function openEditUsedCarModal(serial) {
  try {
    const car = await fetchUsedCarFromServer(serial);
    document.getElementById('editUsedCarId').value = serial;
    document.getElementById('editSerialNumber').value = car.serial_number || '';
    document.getElementById('editMake').value = car.make || '';
    document.getElementById('editModel').value = car.model || '';
    document.getElementById('editVariant').value = car.variant || '';
    document.getElementById('editColor').value = car.color || '';
    document.getElementById('editFuelType').value = car.fuel_type || '';
    document.getElementById('editTransmissionType').value = car.transmission_type || '';
    document.getElementById('editVehicleCategory').value = car.vehicle_category || '';
    document.getElementById('editRegistrationNumber').value = car.registration_number || '';
    document.getElementById('editRegistrationDate').value = car.registration_date ? car.registration_date.slice(0, 10) : '';
    document.getElementById('editRcStatus').value = car.rc_status || '';
    document.getElementById('editRcExpiryDate').value = car.rc_expiry_date ? car.rc_expiry_date.slice(0, 10) : '';
    document.getElementById('editChassisNumber').value = car.chassis_number || '';
    document.getElementById('editEngineNumber').value = car.engine_number || '';
    document.getElementById('editManufacturingYear').value = car.manufacturing_year || '';
    document.getElementById('editManufacturingMonth').value = car.manufacturing_month || '';
    document.getElementById('editOwnerSerialNumber').value = car.owner_serial_number || '';
    document.getElementById('editMileageKm').value = car.mileage_km || '';
    document.getElementById('editCubicCapacityCc').value = car.cubic_capacity_cc || '';
    document.getElementById('editEmissionNorms').value = car.emission_norms || '';
    document.getElementById('editInsuranceType').value = car.insurance_type || '';
    document.getElementById('editInsuranceExpiryDate').value = car.insurance_expiry_date ? car.insurance_expiry_date.slice(0, 10) : '';
    document.getElementById('editEstimatedSellingPrice').value = car.estimated_selling_price || '';
    document.getElementById('editReadyForSales').value = car.ready_for_sales || '';
    const editImageUrl = document.getElementById('editImageUrl');
    if (editImageUrl) editImageUrl.value = car.image_url || '';
    const editBackViewImage = document.getElementById('editBackViewImage');
    if (editBackViewImage) editBackViewImage.value = car.back_view_image || '';
    const editRightViewImage = document.getElementById('editRightViewImage');
    if (editRightViewImage) editRightViewImage.value = car.right_view_image || '';
    const editFrontViewImage = document.getElementById('editFrontViewImage');
    if (editFrontViewImage) editFrontViewImage.value = car.front_view_image || '';
    const editLeftViewImage = document.getElementById('editLeftViewImage');
    if (editLeftViewImage) editLeftViewImage.value = car.left_view_image || '';
    const editInteriorImage = document.getElementById('editInteriorImage');
    if (editInteriorImage) editInteriorImage.value = car.interior_image || '';
    document.getElementById('editVehicleType').value = car.type || '';
    document.getElementById('editCreatedAt').value = car.CreatedAt ? car.CreatedAt.replace(' ', 'T') : '';
    document.getElementById('editCategory').value = car.Category || '';

    // Update image previews
    updateImagePreviews();

    const modal = document.getElementById('editUsedCarModal');
    if (modal) {
      modal.classList.add('drawer-open');
      document.body.style.overflow = 'hidden';
    }
  } catch (error) {
    console.error('Failed to load used car for editing:', error);
    alert('Failed to load used car for editing: ' + error.message);
  }
}

function updateImagePreviews() {
  // Get textarea values
  const mainImageValue = document.getElementById('editImageUrl')?.value || '';
  const backImageValue = document.getElementById('editBackViewImage')?.value || '';
  const rightImageValue = document.getElementById('editRightViewImage')?.value || '';
  const frontImageValue = document.getElementById('editFrontViewImage')?.value || '';
  const leftImageValue = document.getElementById('editLeftViewImage')?.value || '';
  const interiorImageValue = document.getElementById('editInteriorImage')?.value || '';

  // Update previews
  updateImagePreview('editMainImagePreview', mainImageValue);
  updateImagePreview('editBackViewImagePreview', backImageValue);
  updateImagePreview('editRightViewImagePreview', rightImageValue);
  updateImagePreview('editFrontViewImagePreview', frontImageValue);
  updateImagePreview('editLeftViewImagePreview', leftImageValue);
  updateImagePreview('editInteriorImagePreview', interiorImageValue);
}

function updateImagePreview(previewId, imageData) {
  const previewImg = document.getElementById(previewId);
  if (!previewImg) return;

  // Parse the image data (could be comma-separated URLs)
  const imageUrls = parseImageUrls(imageData);

  if (imageUrls.length > 0) {
    const imageSrc = getUsedCarImageSrc(imageUrls[0]);
    if (imageSrc) {
      previewImg.src = imageSrc;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
      previewImg.src = '';
    }
  } else {
    previewImg.style.display = 'none';
    previewImg.src = '';
  }
}

function closeEditUsedCarModal() {
  const modal = document.getElementById('editUsedCarModal');
  if (modal) {
    modal.classList.remove('drawer-open');
    document.body.style.overflow = '';
  }
}

async function saveUsedCarEdits() {
  const serial = document.getElementById('editUsedCarId')?.value;
  if (!serial) return alert('No used car selected for editing');

  const body = {
    serial_number: document.getElementById('editSerialNumber')?.value.trim(),
    make: document.getElementById('editMake')?.value.trim(),
    model: document.getElementById('editModel')?.value.trim(),
    variant: document.getElementById('editVariant')?.value.trim(),
    color: document.getElementById('editColor')?.value.trim(),
    fuel_type: document.getElementById('editFuelType')?.value.trim(),
    registration_number: document.getElementById('editRegistrationNumber')?.value.trim(),
    registration_date: document.getElementById('editRegistrationDate')?.value || null,
    rc_status: document.getElementById('editRcStatus')?.value.trim(),
    rc_expiry_date: document.getElementById('editRcExpiryDate')?.value || null,
    chassis_number: document.getElementById('editChassisNumber')?.value.trim(),
    engine_number: document.getElementById('editEngineNumber')?.value.trim(),
    manufacturing_year: document.getElementById('editManufacturingYear')?.value || null,
    manufacturing_month: document.getElementById('editManufacturingMonth')?.value.trim(),
    owner_serial_number: document.getElementById('editOwnerSerialNumber')?.value.trim(),
    mileage_km: document.getElementById('editMileageKm')?.value || null,
    cubic_capacity_cc: document.getElementById('editCubicCapacityCc')?.value || null,
    emission_norms: document.getElementById('editEmissionNorms')?.value.trim(),
    transmission_type: document.getElementById('editTransmissionType')?.value.trim(),
    vehicle_category: document.getElementById('editVehicleCategory')?.value.trim(),
    insurance_type: document.getElementById('editInsuranceType')?.value.trim(),
    insurance_expiry_date: document.getElementById('editInsuranceExpiryDate')?.value || null,
    estimated_selling_price: document.getElementById('editEstimatedSellingPrice')?.value || null,
    ready_for_sales: document.getElementById('editReadyForSales')?.value.trim(),
    image_url: document.getElementById('editImageUrl')?.value?.trim() || null,
    back_view_image: document.getElementById('editBackViewImage')?.value?.trim() || null,
    right_view_image: document.getElementById('editRightViewImage')?.value?.trim() || null,
    front_view_image: document.getElementById('editFrontViewImage')?.value?.trim() || null,
    left_view_image: document.getElementById('editLeftViewImage')?.value?.trim() || null,
    interior_image: document.getElementById('editInteriorImage')?.value?.trim() || null,
    type: document.getElementById('editVehicleType')?.value.trim(),
    CreatedAt: document.getElementById('editCreatedAt')?.value || null,
    Category: document.getElementById('editCategory')?.value.trim(),
  };

  try {
    const res = await fetch(`${API}/usedcar/stock/${encodeURIComponent(serial)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server ${res.status}`);
    }
    alert('Used car stock updated successfully.');
    closeEditUsedCarModal();
    await loadUsedCarStock();
  } catch (error) {
    console.error('Failed to update used car stock:', error);
    alert('Update failed: ' + error.message);
  }
}

async function deleteUsedCar(serial) {
  if (!confirm('Delete this used car stock item? This cannot be undone.')) return;
  try {
    const res = await fetch(`${API}/usedcar/stock/${encodeURIComponent(serial)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server ${res.status}`);
    }
    alert('Used car stock item deleted.');
    await loadUsedCarStock();
  } catch (error) {
    console.error('Failed to delete used car stock item:', error);
    alert('Delete failed: ' + error.message);
  }
}

async function loadUsedCarStock() {
  const grid = document.getElementById('usedCarInventoryGrid');
  const empty = document.getElementById('usedCarInventoryEmpty');
  if (grid) grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:#64748b;">Loading used car inventory…</div>';
  if (empty) empty.classList.add('hidden');

  try {
    const res = await fetch(`${API}/usedcar/stock`);
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    usedCarInventory = Array.isArray(data) ? data : [];

    // Debug logging
    if (usedCarInventory.length > 0) {
      const firstCar = usedCarInventory[0];
      console.log('=== First Car Image Debug ===');
      console.log('Car:', `${firstCar.make} ${firstCar.model}`);
      console.log('Raw image_url:', firstCar.image_url);

      // Parse and show images
      const imageUrls = parseImageUrls(firstCar.image_url);
      console.log('Parsed images count:', imageUrls.length);
      console.log('Parsed image URLs:', imageUrls);

      if (imageUrls.length > 0) {
        console.log('First image:', imageUrls[0]);
        console.log('First image processed:', getUsedCarImageSrc(imageUrls[0]));
      }

      console.log('==============================');
    }

    populateUsedCarFilters(usedCarInventory);
    renderUsedCarInventory(usedCarInventory);
    const reportSection = document.getElementById('usedCarReportsSection');
    if (reportSection && !reportSection.classList.contains('hidden')) {
      renderUsedCarReports(usedCarInventory);
    }
  } catch (error) {
    console.error('Failed to load used car inventory:', error);
    if (grid) grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:#ef4444;">Unable to load inventory</div>`;
  }
}

function populateUsedCarFilters(cars) {
  const makeFilter = document.getElementById('usedCarMakeFilter');
  const modelFilter = document.getElementById('usedCarModelFilter');
  const fuelFilter = document.getElementById('usedCarFuelFilter');
  const statusFilter = document.getElementById('usedCarStatusFilter');
  const categoryFilter = document.getElementById('usedCarCategoryFilter');
  const typeFilter = document.getElementById('usedCarTypeFilter');

  const makes = [...new Set(cars.map(c => c.make).filter(Boolean))].sort();
  const models = [...new Set(cars.map(c => c.model).filter(Boolean))].sort();
  const fuels = [...new Set(cars.map(c => c.fuel_type).filter(Boolean))].sort();
  const statuses = [...new Set(cars.map(c => c.ready_for_sales).filter(Boolean).map(v => String(v).trim()))].sort();
  const categories = [...new Set(cars.map(c => c.Category || c.vehicle_category).filter(Boolean))].sort();
  const types = [...new Set(cars.map(c => c.type).filter(Boolean))].sort();

  if (makeFilter) makeFilter.innerHTML = '<option value="">All Brands</option>' + makes.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (modelFilter) modelFilter.innerHTML = '<option value="">All Models</option>' + models.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (fuelFilter) fuelFilter.innerHTML = '<option value="">All Fuel Types</option>' + fuels.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (statusFilter) statusFilter.innerHTML = '<option value="">All Status</option>' + statuses.map(v => `<option value="${escapeHtml(v.toLowerCase())}">${escapeHtml(v)}</option>`).join('');
  if (categoryFilter) categoryFilter.innerHTML = '<option value="">All Categories</option>' + categories.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (typeFilter) typeFilter.innerHTML = '<option value="">All Types</option>' + types.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

function filterUsedCarInventory() {
  const search = (document.getElementById('usedCarSearch')?.value || '').toLowerCase();
  const make = (document.getElementById('usedCarMakeFilter')?.value || '').toLowerCase();
  const model = (document.getElementById('usedCarModelFilter')?.value || '').toLowerCase();
  const fuel = (document.getElementById('usedCarFuelFilter')?.value || '').toLowerCase();
  const status = (document.getElementById('usedCarStatusFilter')?.value || '').toLowerCase();
  const priceRange = document.getElementById('usedCarPriceRangeFilter')?.value || '';
  const category = (document.getElementById('usedCarCategoryFilter')?.value || '').toLowerCase();
  const type = (document.getElementById('usedCarTypeFilter')?.value || '').toLowerCase();

  const filtered = usedCarInventory.filter(car => {
    const text = `${car.make || ''} ${car.model || ''} ${car.variant || ''} ${car.color || ''} ${car.registration_number || ''}`.toLowerCase();
    const matchesSearch = !search || text.includes(search);
    const matchesMake = !make || (car.make || '').toLowerCase() === make;
    const matchesModel = !model || (car.model || '').toLowerCase() === model;
    const matchesFuel = !fuel || (car.fuel_type || '').toLowerCase() === fuel;
    const matchesStatus = !status || (car.ready_for_sales || '').toString().trim().toLowerCase() === status;
    const matchesPrice = !priceRange || checkPriceRange(Number(car.estimated_selling_price), priceRange);
    const matchesCategory = !category || (car.Category || car.vehicle_category || '').toLowerCase() === category;
    const matchesType = !type || (car.type || '').toLowerCase() === type;
    return matchesSearch && matchesMake && matchesModel && matchesFuel && matchesStatus && matchesPrice && matchesCategory && matchesType;
  });

  renderUsedCarInventory(filtered);
}

function exportUsedCarsCSV() {
  const search = (document.getElementById('usedCarSearch')?.value || '').toLowerCase();
  const make = (document.getElementById('usedCarMakeFilter')?.value || '').toLowerCase();
  const model = (document.getElementById('usedCarModelFilter')?.value || '').toLowerCase();
  const fuel = (document.getElementById('usedCarFuelFilter')?.value || '').toLowerCase();
  const status = (document.getElementById('usedCarStatusFilter')?.value || '').toLowerCase();
  const priceRange = document.getElementById('usedCarPriceRangeFilter')?.value || '';
  const category = (document.getElementById('usedCarCategoryFilter')?.value || '').toLowerCase();
  const type = (document.getElementById('usedCarTypeFilter')?.value || '').toLowerCase();

  const filtered = usedCarInventory.filter(car => {
    const text = `${car.make || ''} ${car.model || ''} ${car.variant || ''} ${car.color || ''} ${car.registration_number || ''}`.toLowerCase();
    const matchesSearch = !search || text.includes(search);
    const matchesMake = !make || (car.make || '').toLowerCase() === make;
    const matchesModel = !model || (car.model || '').toLowerCase() === model;
    const matchesFuel = !fuel || (car.fuel_type || '').toLowerCase() === fuel;
    const matchesStatus = !status || (car.ready_for_sales || '').toString().trim().toLowerCase() === status;
    const matchesPrice = !priceRange || checkPriceRange(Number(car.estimated_selling_price), priceRange);
    const matchesCategory = !category || (car.Category || car.vehicle_category || '').toLowerCase() === category;
    const matchesType = !type || (car.type || '').toLowerCase() === type;
    return matchesSearch && matchesMake && matchesModel && matchesFuel && matchesStatus && matchesPrice && matchesCategory && matchesType;
  });

  if (!filtered.length) return alert('No data to export matching current filters.');

  const cols = ['registration_number', 'make', 'model', 'variant', 'type', 'manufacturing_year', 'fuel_type', 'transmission_type', 'mileage_km', 'estimated_selling_price', 'color', 'cubic_capacity_cc', 'rc_status', 'rc_expiry_date', 'engine_number', 'chassis_number', 'emission_norms', 'insurance_expiry_date', 'insurance_type', 'ready_for_sales', 'Category'];
  const header = cols.join(',');
  const rows = filtered.map(car =>
    cols.map(col => {
      const val = car[col] != null ? String(car[col]) : '';
      return val.includes(',') ? `"${val}"` : val;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'used_car_inventory_filtered.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
window.exportUsedCarsCSV = exportUsedCarsCSV;

function navigateToUsedCarReports() {
  const url = new URL(window.location.href);
  url.searchParams.set('reports', '1');
  window.location.href = url.toString();
}

function showUsedCarReports() {
  const reportSection = document.getElementById('usedCarReportsSection');
  if (!reportSection) return;

  document.querySelectorAll('main > .card, #uploadCarForm, #usedExcelUploadSection').forEach(el => {
    if (el.id === 'usedCarReportsSection') {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  if (!usedCarInventory.length) {
    loadUsedCarStock();
  } else {
    renderUsedCarReports(usedCarInventory);
  }
  reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderUsedCarReports(cars) {
  const totalCars = cars.length;
  const availableCars = cars.filter(car => (car.ready_for_sales || '').toString().trim().toLowerCase() === 'available').length;
  const carsWithImages = cars.filter(car => {
    return [car.image_url, car.back_view_image, car.right_view_image, car.front_view_image, car.left_view_image, car.interior_image].some(v => v != null && String(v).trim() !== '');
  }).length;
  const averagePrice = totalCars > 0 ? Math.round(cars.reduce((sum, car) => sum + (Number(car.estimated_selling_price) || 0), 0) / totalCars) : 0;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('reportTotalCars', totalCars);
  setText('reportAvailableCars', availableCars);
  setText('reportCarsWithImages', carsWithImages);
  setText('reportAveragePrice', averagePrice ? `₹${averagePrice.toLocaleString('en-IN')}` : '₹0');

  const modelCounts = cars.reduce((acc, car) => {
    const model = (car.model || 'Unknown').trim();
    acc[model] = (acc[model] || 0) + 1;
    return acc;
  }, {});

  const brandCounts = cars.reduce((acc, car) => {
    const brand = (car.make || 'Unknown').trim();
    acc[brand] = (acc[brand] || 0) + 1;
    return acc;
  }, {});

  const fuelCounts = cars.reduce((acc, car) => {
    const fuel = (car.fuel_type || 'Unknown').trim();
    acc[fuel] = (acc[fuel] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = cars.reduce((acc, car) => {
    const status = (car.ready_for_sales || 'Available').toString().trim();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const renderChart = (containerId, data, limit = 10, isVertical = false) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Clear old class
    container.classList.remove('model-chart-grid', 'vertical-chart-grid');
    container.classList.add(isVertical ? 'vertical-chart-grid' : 'model-chart-grid');

    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:10px;text-align:center;font-size:0.8rem;">No data</div>';
      return;
    }

    const maxValue = Math.max(...entries.map(e => e[1]));

    if (isVertical) {
      container.innerHTML = entries.map(([label, count]) => {
        const height = (count / maxValue) * 100;
        return `
          <div class="vertical-bar-container">
            <div class="vertical-bar-wrapper">
              <div class="vertical-bar-fill" style="height:${height}%; background: ${getChartColor(containerId, label)};">
                <span class="vertical-bar-value">${count}</span>
              </div>
            </div>
            <div class="vertical-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
          </div>
        `;
      }).join('');
    } else {
      entries.forEach(([label, count]) => {
        const row = document.createElement('div');
        row.className = 'model-chart-row';
        if (containerId === 'usedCarFuelChart' || containerId === 'usedCarStatusChart') {
          row.style.gridTemplateColumns = '80px minmax(0, 1fr) 30px';
        }
        row.innerHTML = `
          <div class="model-chart-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
          <div class="model-chart-bar"><div class="model-chart-bar-fill" style="width:${(count / maxValue) * 100}%; background: ${getChartColor(containerId, label)};"></div></div>
          <div class="model-chart-value">${count}</div>
        `;
        container.appendChild(row);
      });
    }
  };

  const getChartColor = (id, label) => {
    if (id === 'usedCarStatusChart') {
      const l = label.toLowerCase();
      if (l.includes('sold')) return '#ef4444';
      if (l.includes('booked')) return '#3b82f6';
      return '#10b981';
    }
    if (id === 'usedCarFuelChart') {
      const l = label.toLowerCase();
      if (l === 'petrol') return '#f59e0b';
      if (l === 'diesel') return '#4b5563';
      if (l === 'ev' || l === 'electric') return '#10b981';
      return '#6366f1';
    }
    if (id.includes('TestDrive')) return '#6366f1'; // Indigo for Test Drives
    return '#4f46e5';
  };

  // Only render the Brand Wise Test Drive chart as requested
  renderEnquiryCharts(renderChart);


  async function renderEnquiryCharts(renderChartFn) {
    try {
      const resp = await fetch(`${API}/history/action-items?period=all&limit=200`);
      if (!resp.ok) return;
      const data = await resp.json();
      const items = data.items || [];
      const usedEnquiries = items.filter(item => item.module === 'used_cars');
      allActivityEnquiries = usedEnquiries;

      const brandEnqCounts = usedEnquiries.reduce((acc, item) => {
        const brand = (item.brand || 'Unknown').trim();
        acc[brand] = (acc[brand] || 0) + 1;
        return acc;
      }, {});

      renderChartFn('usedCarBrandTestDriveChart', brandEnqCounts, 15, true);

      if (currentReportTab === 'activity') {
        renderUsedCarActivityReport();
      }
    } catch (error) {
      console.warn('Failed to load enquiry charts:', error);
    }
  }

  const reportBody = document.getElementById('usedCarReportTableBody');
  const paginationContainer = document.getElementById('reportPagination');
  if (reportBody) {
    reportBody.innerHTML = '';
    if (!cars.length) {
      reportBody.innerHTML = '<tr><td colspan="7" class="empty-state">No report data available.</td></tr>';
      if (paginationContainer) paginationContainer.innerHTML = '';
    } else {
      // Pagination logic
      const totalPages = Math.ceil(cars.length / itemsPerReportPage);
      if (currentReportPage > totalPages) currentReportPage = totalPages;
      if (currentReportPage < 1) currentReportPage = 1;

      const start = (currentReportPage - 1) * itemsPerReportPage;
      const end = start + itemsPerReportPage;
      const paginatedCars = cars.slice(start, end);

      paginatedCars.forEach((car, index) => {
        const rowNum = start + index + 1;
        const reg = escapeHtml(car.registration_number || car.serial_number || '—');
        const make = escapeHtml(car.make || '—');
        const model = escapeHtml(car.model || '—');
        const status = escapeHtml(car.ready_for_sales || '—');
        const price = car.estimated_selling_price ? `₹${Number(car.estimated_selling_price).toLocaleString('en-IN')}` : '—';
        const createdAtRaw = car.CreatedAt || car.created_at || '—';
        const createdAt = createdAtRaw !== '—' ? escapeHtml(createdAtRaw.toString().split('T')[0]) : '—';

        reportBody.innerHTML += `
          <tr>
            <td>${rowNum}</td>
            <td>${reg}</td>
            <td>${make}</td>
            <td>${model}</td>
            <td>${price}</td>
            <td>${status}</td>
            <td>${createdAt}</td>
          </tr>
        `;
      });

      renderReportPagination(totalPages, cars);
    }
  }
}

function renderReportPagination(totalPages, allData) {
  const container = document.getElementById('reportPagination');
  if (!container) return;
  container.innerHTML = '';

  if (totalPages <= 1) return;

  const createBtn = (label, page, active = false, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = active ? 'primary btn-sm' : 'secondary btn-sm';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.style.minWidth = '40px';
    if (!disabled && !active) {
      btn.onclick = () => {
        currentReportPage = page;
        renderUsedCarReports(allData);
        document.getElementById('usedCarReportTableBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }
    return btn;
  };

  container.appendChild(createBtn('«', 1, false, currentReportPage === 1));
  container.appendChild(createBtn('‹', currentReportPage - 1, false, currentReportPage === 1));

  let startPage = Math.max(1, currentReportPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  for (let i = startPage; i <= endPage; i++) {
    container.appendChild(createBtn(i, i, i === currentReportPage));
  }

  container.appendChild(createBtn('›', currentReportPage + 1, false, currentReportPage === totalPages));
  container.appendChild(createBtn('»', totalPages, false, currentReportPage === totalPages));
}

function switchReportTab(tab) {
  currentReportTab = tab;
  document.getElementById('tabStock').classList.toggle('active', tab === 'stock');
  document.getElementById('tabActivity').classList.toggle('active', tab === 'activity');

  document.getElementById('stockReportSection').classList.toggle('hidden', tab !== 'stock');
  document.getElementById('activityReportSection').classList.toggle('hidden', tab !== 'activity');

  if (tab === 'activity') {
    if (allActivityEnquiries.length === 0) {
      refreshCurrentReport();
    } else {
      renderUsedCarActivityReport();
    }
  }
}

function refreshCurrentReport() {
  renderUsedCarReports(usedCarInventory);
}

function switchActivityType(type) {
  currentActivityType = type;
  currentActivityReportPage = 1;
  const buttons = {
    'Used Car Test Drive': 'subTabTestDrive',
    'Valuation': 'subTabValuation',
    'Valuation Selection': 'subTabSelection'
  };
  Object.entries(buttons).forEach(([k, id]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.toggle('active', k === type);
      btn.style.background = k === type ? '#ffffff' : 'transparent';
    }
  });
  renderUsedCarActivityReport();
}

function renderUsedCarActivityReport() {
  const tbody = document.getElementById('usedCarActivityReportTableBody');
  const paginationContainer = document.getElementById('activityReportPagination');
  if (!tbody) return;

  const filtered = allActivityEnquiries.filter(item => item.source === currentActivityType);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No ${currentActivityType.toLowerCase()} records found.</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  const start = (currentActivityReportPage - 1) * itemsPerReportPage;
  const end = start + itemsPerReportPage;
  const pageItems = filtered.slice(start, end);

  tbody.innerHTML = pageItems.map((item, index) => {
    const sn = start + index + 1;
    const vehicle = (item.brand && item.brand !== '-' ? `${item.brand} ${item.model || ''}` : item.model) || '-';
    const dateTime = item.appointment_date !== '-' ? `${item.appointment_date} ${item.appointment_time || ''}` : '—';
    const loc = item.location && item.location !== '-' ? item.location : '—';

    return `
      <tr>
        <td>${sn}</td>
        <td style="font-weight:600; color:#1e293b;">${escapeHtml(item.customer_name)}</td>
        <td>${escapeHtml(item.phone)}</td>
        <td>${escapeHtml(vehicle)}</td>
        <td style="font-size:0.9rem;">${dateTime}</td>
        <td style="color:#64748b; font-size:0.9rem;">${escapeHtml(loc)}</td>
      </tr>
    `;
  }).join('');

  renderActivityPagination(filtered.length);
}

function renderActivityPagination(totalItems) {
  const container = document.getElementById('activityReportPagination');
  if (!container) return;
  container.innerHTML = '';
  const totalPages = Math.ceil(totalItems / itemsPerReportPage);
  if (totalPages <= 1) return;

  const createBtn = (label, page, active = false, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = active ? 'primary btn-sm' : 'secondary btn-sm';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.style.minWidth = '40px';
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '10px';
    if (!disabled && !active) {
      btn.onclick = () => {
        currentActivityReportPage = page;
        renderUsedCarActivityReport();
        document.getElementById('usedCarActivityReportTableBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    }
    return btn;
  };

  container.appendChild(createBtn('«', 1, false, currentActivityReportPage === 1));
  container.appendChild(createBtn('‹', currentActivityReportPage - 1, false, currentActivityReportPage === 1));

  let startPage = Math.max(1, currentActivityReportPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

  for (let i = startPage; i <= endPage; i++) {
    container.appendChild(createBtn(i, i, i === currentActivityReportPage));
  }

  container.appendChild(createBtn('›', currentActivityReportPage + 1, false, currentActivityReportPage === totalPages));
  container.appendChild(createBtn('»', totalPages, false, currentActivityReportPage === totalPages));
}

window.switchReportTab = switchReportTab;
window.refreshCurrentReport = refreshCurrentReport;
window.switchActivityType = switchActivityType;

function checkPriceRange(price, rangeKey) {
  if (!price || Number.isNaN(price)) return false;
  switch (rangeKey) {
    case 'under-500000': return price < 500000;
    case '500000-1000000': return price >= 500000 && price <= 1000000;
    case '1000000-2000000': return price > 1000000 && price <= 2000000;
    case '2000000': return price > 2000000;
    default: return true;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const reportMode = params.get('reports') === '1';
  if (reportMode) {
    showUsedCarReports();
  } else {
    loadUsedCarStock();
  }
});
window.filterUsedCarInventory = filterUsedCarInventory;
window.loadUsedCarStock = loadUsedCarStock;
window.showUsedCarReports = showUsedCarReports;
window.updateImagePreviews = updateImagePreviews;
window.openViewUsedCarModal = openViewUsedCarModal;
window.openEditUsedCarModal = openEditUsedCarModal;
window.closeViewUsedCarModal = closeViewUsedCarModal;
window.closeEditUsedCarModal = closeEditUsedCarModal;
window.deleteUsedCar = deleteUsedCar;
window.saveUsedCarEdits = saveUsedCarEdits;
window.removeCarImage = removeCarImage;

// --- Bulk Upload & Template Functions ---

function toggleUsedExcelUpload() {
  const overlay = document.getElementById('usedExcelUploadSection');
  if (!overlay) return;
  const isOpen = overlay.classList.contains('drawer-open');
  if (isOpen) {
    overlay.classList.remove('drawer-open');
    document.body.style.overflow = '';
  } else {
    overlay.classList.remove('hidden');
    overlay.classList.add('drawer-open');
    document.body.style.overflow = 'hidden';
  }
}

function handleUsedFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    const nameEl = document.getElementById('usedFileName');
    const previewEl = document.getElementById('usedFilePreview');
    if (nameEl) nameEl.textContent = file.name;
    if (previewEl) previewEl.style.display = 'flex';
  }
}

function handleUsedDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    const inputEl = document.getElementById('usedExcelInput');
    const nameEl = document.getElementById('usedFileName');
    const previewEl = document.getElementById('usedFilePreview');
    if (inputEl) inputEl.files = e.dataTransfer.files;
    if (nameEl) nameEl.textContent = file.name;
    if (previewEl) previewEl.style.display = 'flex';
  } else {
    alert('Please drop a valid CSV file.');
  }
}

function downloadUsedTemplate() {
  const typeEl = document.getElementById('usedTemplateType');
  const type = typeEl ? typeEl.value : 'stock';
  let csvContent = "";
  let filename = "";

  if (type === 'stock') {
    const headers = ["registration_number", "make", "model", "variant", "car_type", "manufacturing_year", "fuel_type", "transmission", "mileage_km", "estimated_selling_price", "color", "cubic_cap", "rc_status", "rc_expiry_date", "engine_no", "chassis_no", "emission_norm", "insurance_exp", "insurance_company", "ready_for_sales", "category"];
    const sample = ["MH01AB1234", "Maruti", "Swift", "VXI", "Hatchback", "2022", "Petrol", "Manual", "12000", "650000", "White", "1197", "Active", "2037-01-01", "E1234567", "C7654321", "BS6", "2025-05-10", "HDFC ERGO", "Yes", "Budget"];
    csvContent = headers.join(",") + "\n" + sample.join(",");
    filename = "used_car_stock_template.csv";
  } else {
    const headers = ["registration_number", "status"];
    const sample = ["MH01AB1234", "Sold"];
    csvContent = headers.join(",") + "\n" + sample.join(",");
    filename = "used_car_status_template.csv";
  }

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function uploadUsedFile() {
  const fileInput = document.getElementById('usedExcelInput');
  const typeEl = document.getElementById('usedTemplateType');
  const type = typeEl ? typeEl.value : 'stock';
  const btn = document.getElementById('usedUploadBtn');

  if (!fileInput || !fileInput.files.length) {
    alert('Please select a CSV file first.');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const endpoint = type === 'stock' ? '/usedcar/bulk-upload-used-cars' : '/usedcar/bulk-update-used-status';

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Processing...';
    }

    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (res.ok) {
      alert('Success: ' + result.message);
      toggleUsedExcelUpload();
      loadUsedCarStock();
    } else {
      throw new Error(result.detail || 'Upload failed');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Upload';
    }
  }
}

// Expose to window
window.toggleUsedExcelUpload = toggleUsedExcelUpload;
window.downloadUsedTemplate = downloadUsedTemplate;
window.uploadUsedFile = uploadUsedFile;
window.handleUsedFileSelect = handleUsedFileSelect;
window.handleUsedDrop = handleUsedDrop;