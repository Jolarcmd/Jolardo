/**
 * Jolardo — Shared UI Utilities
 * Toast notifications, theme toggle, navbar, reveal animations, etc.
 */

// ──────────────────────────────────────────────
// Theme
// ──────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('jolardo-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  return saved;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('jolardo-theme', next);
  updateThemeIcon(next);
  return next;
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('#theme-toggle-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ──────────────────────────────────────────────
// Toast Notifications
// ──────────────────────────────────────────────

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast({ type = 'info', title = '', message = '', duration = 4000 }) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      ${message ? `<div class="toast-msg">${escapeHtml(message)}</div>` : ''}
    </div>
    <span class="toast-close" role="button" aria-label="Close">✕</span>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }

  return toast;
}

function removeToast(toast) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(20px)';
  toast.style.transition = 'all 0.2s ease';
  setTimeout(() => toast.remove(), 200);
}

const toast = {
  success: (title, message, duration) => showToast({ type: 'success', title, message, duration }),
  error:   (title, message, duration) => showToast({ type: 'error',   title, message, duration }),
  info:    (title, message, duration) => showToast({ type: 'info',    title, message, duration }),
  warning: (title, message, duration) => showToast({ type: 'warning', title, message, duration }),
};

// ──────────────────────────────────────────────
// Page Loader
// ──────────────────────────────────────────────

function showLoader() {
  let loader = document.getElementById('page-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.className = 'page-loader';
    loader.innerHTML = `
      <img src="icons/1.png" alt="Jolardo" class="loader-logo" />
      <div class="spinner"></div>
    `;
    document.body.prepend(loader);
  }
  loader.classList.remove('hidden');
}

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => {
      if (loader && loader.parentNode) loader.remove();
    }, 400);
  }
}

// Safety timeout: Ensure page is never blocked indefinitely
setTimeout(() => {
  hideLoader();
}, 800);

// ──────────────────────────────────────────────
// Navbar
// ──────────────────────────────────────────────

function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  // Scroll effect
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });

  // Mobile menu elements
  const hamburger  = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  const overlay    = document.querySelector('.mobile-menu-overlay');
  const closeBtn   = document.querySelector('.mobile-menu-close');

  function openMobileMenu() {
    hamburger?.classList.add('open');
    mobileMenu?.classList.add('open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    hamburger?.classList.remove('open');
    mobileMenu?.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  hamburger?.addEventListener('click', () => {
    mobileMenu?.classList.contains('open') ? closeMobileMenu() : openMobileMenu();
  });

  closeBtn?.addEventListener('click', closeMobileMenu);
  overlay?.addEventListener('click', closeMobileMenu);

  // Close on link click
  mobileMenu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  // Theme toggle
  const themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = toggleTheme();
      const icon = themeBtn.querySelector('#theme-toggle-icon');
      if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
    });
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const icon = themeBtn.querySelector('#theme-toggle-icon');
    if (icon) icon.textContent = current === 'dark' ? '☀️' : '🌙';
  }

  // Active nav link
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// ──────────────────────────────────────────────
// Intersection Observer — Reveal on scroll
// ──────────────────────────────────────────────

function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ──────────────────────────────────────────────
// Sidebar (Dashboard)
// ──────────────────────────────────────────────

function initSidebar() {
  const sidebar    = document.querySelector('.sidebar');
  const overlay    = document.querySelector('.sidebar-overlay');
  const menuToggle = document.querySelector('.sidebar-toggle');

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  menuToggle?.addEventListener('click', () => {
    const open = sidebar?.classList.toggle('open');
    overlay?.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  overlay?.addEventListener('click', closeSidebar);

  // Active sidebar link
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const href = link.getAttribute('data-href') || link.getAttribute('href') || '';
    if (href === currentPage) link.classList.add('active');
  });
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(amount, currency = 'USD') {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function sanitizeInput(str) {
  if (!str) return '';
  return String(str).trim().replace(/<[^>]*>/g, '');
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return /^\+?[\d\s\-().]{7,20}$/.test(phone);
}

// ──────────────────────────────────────────────
// Modal helper
// ──────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  document.body.style.overflow = '';
}

function initModals() {
  if (window._modalsInitialized) return;
  window._modalsInitialized = true;

  // 1. Delegated click for any [data-modal-close] or .modal-close
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-modal-close], .modal-close');
    if (closeBtn) {
      e.preventDefault();
      const modal = closeBtn.closest('.modal-backdrop');
      if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
      return;
    }

    // 2. Click outside modal on backdrop
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.add('hidden');
      document.body.style.overflow = '';
    }
  });

  // 3. Escape key closes any active modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(modal => {
        modal.classList.add('hidden');
      });
      document.body.style.overflow = '';
    }
  });
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initModals);
} else {
  initModals();
}

// ──────────────────────────────────────────────
// Confirm dialog (lightweight)
// ──────────────────────────────────────────────

function confirmDialog(message) {
  return window.confirm(message);
}

// ──────────────────────────────────────────────
// Build navbar HTML
// ──────────────────────────────────────────────

function buildNavbar({ user = null, role = null } = {}) {
  const createAccountBtn = user
    ? ''
    : `<a href="create-account.html" class="btn btn-primary btn-sm navbar-cta" id="nav-create-account-btn">
         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
         Create Account
       </a>`;

  const authLinks = user
    ? `<a href="${role === 'admin' ? 'admin.html' : 'dashboard.html'}" class="nav-link">Dashboard</a>`
    : `<a href="login.html" class="nav-link">Login</a>`;

  const mobileAuthLinks = user
    ? `<a href="${role === 'admin' ? 'admin.html' : 'dashboard.html'}" class="mobile-nav-link" id="mobile-nav-dashboard">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        Dashboard
      </a>`
    : `<a href="login.html" class="mobile-nav-link" id="mobile-nav-login">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
        Login
      </a>
      <a href="create-account.html" class="mobile-nav-link mobile-cta" id="mobile-nav-create">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Create Account
      </a>`;

  return `
    <nav class="navbar" id="navbar">
      <div class="navbar-inner">
        <a href="index.html" class="navbar-logo">
          <img src="icons/1.png" alt="Jolardo" />
          <span>JOLARDO</span>
        </a>
        <div class="navbar-nav">
          <a href="index.html" class="nav-link">Home</a>
          <a href="contact.html" class="nav-link">Contact Us</a>
          ${authLinks}
        </div>
        <div class="navbar-actions">
          ${createAccountBtn}
          <button class="theme-toggle" aria-label="Toggle theme" title="Toggle theme">
            <span id="theme-toggle-icon">☀️</span>
          </button>
          <button class="hamburger" aria-label="Open menu" id="hamburger">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </nav>
    <div class="mobile-menu" id="mobile-menu">
      <div class="mobile-menu-header">
        <a href="index.html" class="navbar-logo" style="font-size:1.1rem;">
          <img src="icons/1.png" alt="Jolardo" style="width:32px;height:32px;" />
          <span>JOLARDO</span>
        </a>
        <button class="mobile-menu-close" id="mobile-menu-close" aria-label="Close menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="mobile-menu-links">
        <a href="index.html" class="mobile-nav-link" id="mobile-nav-home">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Home
        </a>
        <a href="contact.html" class="mobile-nav-link" id="mobile-nav-contact">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Contact Us
        </a>
        ${mobileAuthLinks}
      </div>
    </div>
    <div class="mobile-menu-overlay" id="mobile-menu-overlay"></div>
  `;
}

function buildFooter({ phone = '', email = '', whatsapp = '' } = {}) {
  const wa = whatsapp || phone;
  return `
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="logo">
              <img src="icons/1.png" alt="Jolardo" />
              <span class="serif">JOLARDO</span>
            </div>
            <p class="footer-desc">Premium web development and design services. We build websites that elevate your brand and drive results.</p>
          </div>
          <div>
            <h4 class="footer-heading">Navigation</h4>
            <div class="footer-links">
              <a href="index.html">Home</a>
              <a href="contact.html">Contact Us</a>
              <a href="login.html">Login</a>
              <a href="create-account.html">Create Account</a>
            </div>
          </div>
          <div>
            <h4 class="footer-heading">Contact</h4>
            <div class="footer-links">
              ${phone ? `<a href="tel:${phone}">📞 ${phone}</a>` : ''}
              ${email ? `<a href="mailto:${email}">✉️ ${email}</a>` : ''}
              ${wa    ? `<a href="https://wa.me/${wa.replace(/\D/g,'')}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
            </div>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Jolardo. All rights reserved.</span>
          <span>Premium Web Development</span>
        </div>
      </div>
    </footer>
  `;
}


// ──────────────────────────────────────────────
// Client Error Boundary & Network Resilience
// ──────────────────────────────────────────────

function initGlobalErrorBoundary() {
  window.addEventListener('error', function (event) {
    // Prevent sensitive info leaks in production while logging diagnostics
    console.error('[Jolardo Runtime Boundary]', event.message, event.filename, event.lineno);
    
    // If it's a critical fatal script error, show a discreet non-intrusive notification
    if (event.error && !event.error._handled) {
      event.error._handled = true;
      if (typeof toast !== 'undefined' && toast.warning) {
        toast.warning('Notice', 'A minor interface update occurred. If a button fails to respond, please refresh.');
      }
    }
  });

  window.addEventListener('unhandledrejection', function (event) {
    console.error('[Jolardo Async Boundary]', event.reason);
    
    // Check for common network or auth failures
    const reasonMsg = event.reason ? String(event.reason.message || event.reason) : '';
    if (reasonMsg.includes('Failed to fetch') || reasonMsg.includes('NetworkError')) {
      if (typeof toast !== 'undefined' && toast.error) {
        toast.error('Network Error', 'Unable to reach the server. Please check your internet connection.');
      }
    } else if (reasonMsg.includes('JWT') || reasonMsg.includes('session expired') || reasonMsg.includes('refresh_token_not_found')) {
      if (typeof toast !== 'undefined' && toast.warning) {
        toast.warning('Session Notice', 'Your session has expired. Redirecting to login...');
      }
      setTimeout(() => {
        if (!window.location.pathname.endsWith('login.html')) {
          window.location.href = 'login.html?expired=true';
        }
      }, 1500);
    }
  });

  // Offline / Online detection
  window.addEventListener('offline', function () {
    if (typeof toast !== 'undefined' && toast.warning) {
      toast.warning('Offline', 'You are currently working offline. Some features may be delayed.');
    }
  });

  window.addEventListener('online', function () {
    if (typeof toast !== 'undefined' && toast.success) {
      toast.success('Online', 'Connection restored successfully.');
    }
  });
}

function handleAuthError(err, redirect = true) {
  const msg = err ? (err.message || String(err)) : 'Authentication failed';
  console.warn('[Jolardo Auth Exception]', msg);
  if (typeof toast !== 'undefined' && toast.error) {
    toast.error('Authentication Error', msg);
  }
  if (redirect) {
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1200);
  }
}

// Auto-initialize error boundary
if (typeof window !== 'undefined') {
  initGlobalErrorBoundary();
}

window.JolardoUI = {
  initTheme,
  toggleTheme,
  updateThemeIcon,
  showToast,
  toast,
  showLoader,
  hideLoader,
  initNavbar,
  initReveal,
  initSidebar,
  escapeHtml,
  formatDate,
  formatCurrency,
  debounce,
  sanitizeInput,
  validateEmail,
  validatePhone,
  openModal,
  closeModal,
  initModals,
  confirmDialog,
  buildNavbar,
  buildFooter,
  handleAuthError,
  initGlobalErrorBoundary
};

