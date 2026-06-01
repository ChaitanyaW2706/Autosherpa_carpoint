// Authentication Check (Immediate Execution)
(function () {
  const path = window.location.pathname;
  const page = path.split("/").pop() || "index.html";
  const isLoginPage = page === 'login.html';
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

  console.log("Auth Check:", { path, page, isLoginPage, isLoggedIn });

  if (!isLoggedIn && !isLoginPage) {
    console.warn("Unauthorized access attempt. Redirecting to login.html...");
    window.location.href = 'login.html';
  } else if (isLoggedIn && isLoginPage) {
    console.log("User already logged in. Redirecting to dashboard...");
    window.location.href = 'index.html';
  }
})();

/**
 * AutoSherpa Global Configuration
 * Centralized API URL management for easy deployment.
 */
// const CONFIG = {
//   API_BASE_URL: "https://console.autosherpas.com"
// };

// local configuration
const CONFIG = {
  API_BASE_URL: "http://127.0.0.1:8990"
};

// Also export as a global API variable for backward compatibility with existing scripts
window.API = CONFIG.API_BASE_URL;

// Global Logout Function
function logout() {
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userEmail');
  window.location.href = 'login.html';
}

// Global Sidebar Toggle Function
window.toggleSidebar = function () {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar && overlay) {
    const isActive = sidebar.classList.toggle("active");
    overlay.classList.toggle("active");
    document.body.style.overflow = isActive ? "hidden" : "";
    console.log("Sidebar toggled. Active:", isActive);
  } else {
    console.error("Sidebar or overlay not found!");
  }
};

// Global Mobile Sidebar Logic
document.addEventListener("DOMContentLoaded", () => {
  // Hook into logout button
  const logoutBtn = document.querySelector('.logout-item');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  // Close on nav item click (mobile)
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", () => {
        if (window.innerWidth <= 768 && sidebar.classList.contains("active")) {
          window.toggleSidebar();
        }
      });
    });
  }

  // Also bind the existing id-based toggle if it exists (for backward compatibility)
  const menuToggle = document.getElementById("menuToggle");
  const overlay = document.getElementById("sidebarOverlay");
  if (menuToggle) menuToggle.addEventListener("click", window.toggleSidebar);
  if (overlay) overlay.addEventListener("click", window.toggleSidebar);
});
// --- Global Toast Notification System ---
(function initGlobalToast() {
  const style = document.createElement('style');
  style.innerHTML = `
    #toast-container {
      position: fixed; top: 40px; left: 50%; transform: translateX(-50%); z-index: 999999;
      display: flex; flex-direction: column; gap: 15px; pointer-events: none;
      align-items: center;
    }
    .custom-toast {
      background: white; color: #1e293b; min-width: 320px; max-width: 450px;
      padding: 16px 20px; border-radius: 12px;
      box-shadow: 0 10px 30px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1);
      display: flex; align-items: flex-start; gap: 14px;
      font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 500;
      opacity: 0; transform: translateY(-20px) scale(0.95);
      animation: toastPopIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      pointer-events: auto;
      position: relative;
      overflow: hidden;
      border: 1px solid #f1f5f9;
    }
    .custom-toast::before {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
    }
    .custom-toast.toast-error::before { background-color: #ef4444; }
    .custom-toast.toast-success::before { background-color: #10b981; }
    .custom-toast.toast-warning::before { background-color: #f59e0b; }
    
    .toast-icon { font-size: 22px; margin-top: -2px; }
    .toast-content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .toast-title { font-weight: 700; font-size: 15px; color: #0f172a; }
    .toast-message { line-height: 1.5; color: #475569; }
    
    .toast-close { 
      cursor: pointer; color: #94a3b8; font-size: 20px; line-height: 1; 
      transition: color 0.2s; background: none; border: none; padding: 0;
    }
    .toast-close:hover { color: #1e293b; }
    
    .toast-progress {
      position: absolute; bottom: 0; left: 0; height: 3px; background: rgba(0,0,0,0.1); width: 100%;
    }
    .toast-progress-bar {
      height: 100%; width: 100%; transform-origin: left;
      animation: progressShrink 4s linear forwards;
    }
    .toast-error .toast-progress-bar { background: #ef4444; }
    .toast-success .toast-progress-bar { background: #10b981; }
    .toast-warning .toast-progress-bar { background: #f59e0b; }

    @keyframes toastPopIn { to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes toastPopOut { to { opacity: 0; transform: translateY(-20px) scale(0.95); margin-top: -80px; } }
    @keyframes progressShrink { to { transform: scaleX(0); } }
  `;
  document.head.appendChild(style);

  // Dedicated JavaScript showToast Function
  window.showToast = function(message, forceType = null) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    
    let type = 'success';
    let icon = '✅';
    let title = 'Success';
    const msgLower = String(message).toLowerCase();
    
    if (forceType) {
      type = forceType;
      if (type === 'error') { icon = '❌'; title = 'Error'; }
      else if (type === 'warning') { icon = '⚠️'; title = 'Warning'; }
    } else {
      if (msgLower.includes('error') || msgLower.includes('fail') || msgLower.includes('unable') || msgLower.includes('no cars') || msgLower.includes('not found')) {
        type = 'error'; icon = '❌'; title = 'Error';
      } else if (msgLower.includes('please') || msgLower.includes('warning') || msgLower.includes('required') || msgLower.includes('select') || msgLower.includes('missing')) {
        type = 'warning'; icon = '⚠️'; title = 'Warning';
      }
    }

    toast.classList.add('toast-' + type);
    
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <span class="toast-title">${title}</span>
        <span class="toast-message">${message}</span>
      </div>
      <button class="toast-close">&times;</button>
      <div class="toast-progress"><div class="toast-progress-bar"></div></div>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').onclick = () => removeToast(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => { if (toast.parentElement) removeToast(toast); }, 4000);
  };

  function removeToast(toast) {
    toast.style.animation = 'toastPopOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }
})();
