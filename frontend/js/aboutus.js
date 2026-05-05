// Using global API from config.js

async function loadAboutUs() {
  try {
    const res = await fetch(`${API}/aboutus/aboutus`);
    if (!res.ok) {
      if (res.status === 404) {
        console.log("No About Us data found. Starting fresh.");
        return;
      }
      throw new Error(`Server ${res.status}`);
    }

    const data = await res.json();
    document.getElementById('dealershipName').value = data.dealership_name || '';
    document.getElementById('tagline').value = data.tagline || '';
    document.getElementById('aboutDescription').value = data.about_description || '';
    document.getElementById('brand').value = data.brand || '';

    // Check module checkboxes
    if (data.modules && Array.isArray(data.modules)) {
      data.modules.forEach(module => {
        const checkbox = document.getElementById(`module-${module}`);
        if (checkbox) checkbox.checked = true;
      });
    } else if (data.modules && typeof data.modules === 'string') {
      // Handle comma-separated string
      const modules = data.modules.split(',').map(m => m.trim());
      modules.forEach(module => {
        const checkbox = document.getElementById(`module-${module}`);
        if (checkbox) checkbox.checked = true;
      });
    }
  } catch (error) {
    console.error('Failed to load About Us:', error);
  }
}

function validateForm() {
  const dealershipName = document.getElementById('dealershipName').value.trim();
  const tagline = document.getElementById('tagline').value.trim();
  const aboutDescription = document.getElementById('aboutDescription').value.trim();
  const brand = document.getElementById('brand').value;
  
  const modules = getSelectedModules();

  if (!dealershipName) {
    showError('Dealership Name is required');
    return false;
  }
  if (!tagline) {
    showError('Tagline is required');
    return false;
  }
  if (!aboutDescription) {
    showError('About Description is required');
    return false;
  }
  if (!brand) {
    showError('Brand is required');
    return false;
  }
  if (modules.length === 0) {
    showError('Please select at least one module');
    return false;
  }

  return true;
}

function getSelectedModules() {
  const checkboxes = document.querySelectorAll('.module-checkbox input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

async function saveAboutUs() {
  if (!validateForm()) return;

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.classList.add('loading');

  try {
    const modules = getSelectedModules();

    const body = {
      dealership_name: document.getElementById('dealershipName').value.trim(),
      tagline: document.getElementById('tagline').value.trim(),
      about_description: document.getElementById('aboutDescription').value.trim(),
      brand: document.getElementById('brand').value,
      modules: modules.join(','), // Send as comma-separated string
    };

    const res = await fetch(`${API}/aboutus/aboutus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server ${res.status}`);
    }

    const result = await res.json();
    showSuccess('About Us saved successfully');
    await loadAboutUs(); // Reload to confirm
  } catch (error) {
    console.error('Failed to save About Us:', error);
    showError('Error: ' + error.message);
  } finally {
    saveBtn.classList.remove('loading');
  }
}

function resetForm() {
  if (confirm('Reset form to last saved values?')) {
    loadAboutUs();
    hideMessages();
  }
}

function showSuccess(msg) {
  const el = document.getElementById('successMsg');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

function hideMessages() {
  document.getElementById('successMsg').style.display = 'none';
  document.getElementById('errorMsg').style.display = 'none';
}

window.addEventListener('DOMContentLoaded', () => {
  loadAboutUs();
});

window.saveAboutUs = saveAboutUs;
window.resetForm = resetForm;
