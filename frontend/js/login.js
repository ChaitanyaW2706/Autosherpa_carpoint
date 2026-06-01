const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');

// ── Helper: show inline message ──────────────────────────────────────────────
function showMessage(elementId, message, type = 'error') {
  if (window.showToast) {
    window.showToast(message, type);
  }
}

function clearMessage(elementId) {
  // Toasts auto dismiss, nothing needed here
}
// ─────────────────────────────────────────────────────────────────────────────

loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
});

registerTab.addEventListener('click', () => {
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

loginForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  clearMessage('loginError');

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const btn = loginForm.querySelector('.btn-submit');

  if (!email || !password) {
    showMessage('loginError', 'Please enter both email and password.');
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Signing In...';

  try {
    const response = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userEmail', email);
      showMessage('loginError', 'Login successful! Redirecting to dashboard...', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1200);
    } else {
      const error = await response.json();
      showMessage('loginError', error.detail || 'Login failed. Please check your credentials.');
    }
  } catch (error) {
    showMessage('loginError', 'Network error: ' + (error.message || error));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

registerForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  clearMessage('registerMessage');

  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  const btn = registerForm.querySelector('.btn-submit');

  if (!email || !password) {
    showMessage('registerMessage', 'Please enter both email and password.');
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Registering...';

  try {
    const response = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      showMessage('registerMessage', 'Registration successful! Redirecting to login…', 'success');
      setTimeout(() => {
        loginTab.click(); // Switch to login tab
        clearMessage('registerMessage');
      }, 2000);
    } else {
      const error = await response.json();
      showMessage('registerMessage', error.detail || 'Registration failed.');
    }
  } catch (error) {
    showMessage('registerMessage', 'Network error: ' + (error.message || error));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
