(function() {
  const { supabase, getSession, getUserRole, getSettings, subscribeTable } = window.JolardoAuth || {};
  const {
    initTheme, initNavbar, initReveal, hideLoader,
    buildNavbar, buildFooter, toast, sanitizeInput,
    validateEmail, validatePhone
  } = window.JolardoUI || {};

/**
 * contact.js — Contact Page
 */



initTheme();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  try {
    let user = null, role = null;
    try {
      const session = await getSession();
      if (session) { user = session.user; role = await getUserRole(user.id); }
    } catch (_) {}

    const nav = document.getElementById('navbar-container');
    if (nav) nav.innerHTML = buildNavbar({ user, role });

    // Load settings
    let settings = {};
    try {
      settings = await getSettings(['contact_phone', 'contact_email', 'whatsapp_number']);
    } catch (_) {}

    renderContactInfo(settings);
    const foot = document.getElementById('footer-container');
    if (foot) {
      foot.innerHTML = buildFooter({
        phone: settings.contact_phone || '',
        email: settings.contact_email || '',
        whatsapp: settings.whatsapp_number || '',
      });
    }

    // Live sync settings via Realtime
    if (typeof subscribeTable === 'function') {
      subscribeTable('admin_settings', (payload) => {
        if (payload.new?.setting_key) {
          settings[payload.new.setting_key] = payload.new.setting_value;
          renderContactInfo(settings);
          if (foot) {
            foot.innerHTML = buildFooter({
              phone: settings.contact_phone || '',
              email: settings.contact_email || '',
              whatsapp: settings.whatsapp_number || '',
            });
          }
        }
      });
    }

    initNavbar();
    initReveal();
    initForm();
    initCharCounter();
  } catch (err) {
    console.warn('[Jolardo] Contact init error:', err);
  } finally {
    hideLoader();
  }
}

// ── Contact Info ──
function renderContactInfo(s) {
  const items = [];
  if (s.contact_phone) {
    items.push(`
      <div class="info-item">
        <div class="info-icon">📞</div>
        <div class="info-item-content">
          <div class="info-item-label">Phone</div>
          <div class="info-item-value"><a href="tel:${escapeHtml(s.contact_phone)}">${escapeHtml(s.contact_phone)}</a></div>
        </div>
      </div>`);
  }
  if (s.contact_email) {
    items.push(`
      <div class="info-item">
        <div class="info-icon">✉️</div>
        <div class="info-item-content">
          <div class="info-item-label">Email</div>
          <div class="info-item-value"><a href="mailto:${escapeHtml(s.contact_email)}">${escapeHtml(s.contact_email)}</a></div>
        </div>
      </div>`);
  }
  if (s.whatsapp_number) {
    const wa = s.whatsapp_number.replace(/\D/g, '');
    items.push(`
      <div class="info-item">
        <div class="info-icon">💬</div>
        <div class="info-item-content">
          <div class="info-item-label">WhatsApp</div>
          <div class="info-item-value"><a href="https://wa.me/${wa}" target="_blank" rel="noopener">Message us on WhatsApp</a></div>
        </div>
      </div>`);
  }

  if (!items.length) {
    items.push(`
      <div class="info-item">
        <div class="info-icon">💬</div>
        <div class="info-item-content">
          <div class="info-item-label">Reach Out</div>
          <div class="info-item-value">Use the form and we'll reply promptly.</div>
        </div>
      </div>`);
  }

  document.getElementById('contact-info-items').innerHTML = items.join('');
}

// ── Form ──
function initForm() {
  const form   = document.getElementById('contact-form');
  const submit = document.getElementById('contact-submit');
  const btnText    = document.getElementById('submit-text');
  const btnSpinner = document.getElementById('submit-spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot check
    const hp = form.querySelector('[name="website"]');
    if (hp && hp.value) return;

    // Gather & sanitize values
    const name    = sanitizeInput(form.querySelector('#contact-name').value);
    const email   = sanitizeInput(form.querySelector('#contact-email').value);
    const subject = sanitizeInput(form.querySelector('#contact-subject').value);
    const message = sanitizeInput(form.querySelector('#contact-message').value);

    // Validate
    let valid = true;
    clearErrors();

    if (!name || name.length < 2) {
      showError('err-name', 'Please enter your full name.'); valid = false;
    }
    if (!email || !validateEmail(email)) {
      showError('err-email', 'Please enter a valid email address.'); valid = false;
    }
    if (!subject || subject.length < 3) {
      showError('err-subject', 'Please enter a subject.'); valid = false;
    }
    if (!message || message.length < 10) {
      showError('err-message', 'Please enter a message (at least 10 characters).'); valid = false;
    }

    if (!valid) return;

    // Submit
    setLoading(true, btnText, btnSpinner);

    try {
      const { error } = await supabase.from('contact_messages').insert({
        name,
        email,
        subject,
        message,
        status: 'unread',
      });

      if (error) throw error;

      toast.success('Message Sent!', 'Thank you — we\'ll be in touch within 24 hours.');
      form.reset();
      document.getElementById('char-count').textContent = '0 / 5000';
    } catch (err) {
      console.error(err);
      toast.error('Submission Failed', 'Something went wrong. Please try again or contact us directly.');
    } finally {
      setLoading(false, btnText, btnSpinner);
    }
  });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.previousElementSibling?.classList.add('error'); }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(e => { e.textContent = ''; });
  document.querySelectorAll('.form-control.error').forEach(e => e.classList.remove('error'));
}

function setLoading(loading, btnText, btnSpinner) {
  const btn = document.getElementById('contact-submit');
  if (loading) {
    btn.classList.add('loading');
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
  } else {
    btn.classList.remove('loading');
    btnText.style.display = '';
    btnSpinner.style.display = 'none';
  }
}

// ── Char counter ──
function initCharCounter() {
  const msg     = document.getElementById('contact-message');
  const counter = document.getElementById('char-count');
  msg?.addEventListener('input', () => {
    const len = msg.value.length;
    counter.textContent = `${len} / 5000`;
    counter.style.color = len > 4800 ? '#e55' : '';
  });
}
})();
