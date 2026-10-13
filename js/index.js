(function() {
  const { supabase, getSession, getUserRole, getSettings, subscribeTable } = window.JolardoAuth || {};
  const { initTheme, initNavbar, initReveal, hideLoader, buildNavbar, buildFooter, toast } = window.JolardoUI || {};

/**
 * index.js — Home Page
 */



// ── Init ──
initTheme();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  try {
    // Render navbar with auth state
    let user = null;
    let role = null;
    try {
      const session = await getSession();
      if (session) {
        user = session.user;
        role = await getUserRole(user.id);
      }
    } catch (_) {}

    const navContainer = document.getElementById('navbar-container');
    if (navContainer) navContainer.innerHTML = buildNavbar({ user, role });

    // Load footer settings
    let settings = {};
    try {
      settings = await getSettings(['contact_phone', 'contact_email', 'whatsapp_number']);
    } catch (_) {}
    const footerContainer = document.getElementById('footer-container');
    if (footerContainer) {
      footerContainer.innerHTML = buildFooter({
        phone:    settings.contact_phone    || '',
        email:    settings.contact_email    || '',
        whatsapp: settings.whatsapp_number  || '',
      });
    }

    // Live sync settings via Realtime
    if (typeof subscribeTable === 'function') {
      subscribeTable('admin_settings', (payload) => {
        if (payload.new?.setting_key) {
          settings[payload.new.setting_key] = payload.new.setting_value;
          if (footerContainer) {
            footerContainer.innerHTML = buildFooter({
              phone:    settings.contact_phone    || '',
              email:    settings.contact_email    || '',
              whatsapp: settings.whatsapp_number  || '',
            });
          }
        }
      });
    }

    initNavbar();
    initReveal();
    initCounters();
  } catch (err) {
    console.warn('[Jolardo] Init warning:', err);
  } finally {
    hideLoader();
  }
}

// ── Counter animation ──
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      const duration = 1800;
      const step = target / (duration / 16);
      let current = 0;
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = Math.round(current);
        if (current >= target) clearInterval(timer);
      }, 16);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  counters.forEach(el => observer.observe(el));
}
})();
