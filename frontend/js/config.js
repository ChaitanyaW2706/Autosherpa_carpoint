// Authentication Check (Immediate Execution)
(function() {
  const path = window.location.pathname;
  const isLoginPage = path.endsWith('login.html');
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

  console.log("Auth Check:", { path, isLoginPage, isLoggedIn });

  if (!isLoggedIn && !isLoginPage) {
    console.warn("User not logged in. Redirecting to login.html...");
    window.location.href = 'login.html';
  }
})();

/**
 * AutoSherpa Global Configuration
 * Centralized API URL management for easy deployment.
 */
const CONFIG = {
    // Detect environment and set API URL accordingly
    API_BASE_URL: (
        window.location.protocol === "file:" || 
        !window.location.hostname || 
        window.location.hostname === "localhost" || 
        window.location.hostname === "127.0.0.1"
    ) 
    ? "http://127.0.0.1:8990" 
    : window.location.origin
};

// Also export as a global API variable for backward compatibility with existing scripts
window.API = CONFIG.API_BASE_URL;

// Global Logout Function
function logout() {
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userEmail');
  window.location.href = 'login.html';
}

// Global Mobile Sidebar Logic
document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  // Hook into logout button
  const logoutBtn = document.querySelector('.logout-item');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  if (menuToggle && sidebar && overlay) {
    const toggleMenu = () => {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
      document.body.style.overflow = sidebar.classList.contains("active") ? "hidden" : "";
    };

    menuToggle.addEventListener("click", toggleMenu);
    overlay.addEventListener("click", toggleMenu);

    // Close on nav item click (mobile)
    sidebar.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
          toggleMenu();
        }
      });
    });
  }
});
