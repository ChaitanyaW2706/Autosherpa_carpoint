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
