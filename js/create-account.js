(function() {
  const { supabase, getSession, getUserRole } = window.JolardoAuth || {};
  const {
    initTheme, toggleTheme, toast, hideLoader,
    validateEmail, sanitizeInput, escapeHtml
  } = window.JolardoUI || {};

/**
 * create-account.js — Registration Page
 */



initTheme();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  try {
    // Redirect if already logged in
    try {
      const session = await getSession();
      if (session) {
        const role = await getUserRole(session.user.id);
        window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
        return;
      }
    } catch (_) {}

    // Theme toggle
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      const next = toggleTheme();
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
    });
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';

    initPasswordToggles();
    initPasswordStrength();
    initRegisterForm();
  } catch (err) {
    console.warn('[Jolardo] Create account init warning:', err);
  } finally {
    hideLoader();
  }
}

// ── Password toggles ──
function initPasswordToggles() {
  [['toggle-pw', 'reg-password'], ['toggle-confirm', 'reg-confirm']].forEach(([btnId, inputId]) => {
    const btn   = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    btn?.addEventListener('click', () => {
      const isText = input.type === 'text';
      input.type   = isText ? 'password' : 'text';
      btn.textContent = isText ? '👁️' : '🙈';
    });
  });
}

// ── Password strength ──
function initPasswordStrength() {
  const input    = document.getElementById('reg-password');
  const bar      = document.getElementById('pw-bar-fill');
  const label    = document.getElementById('pw-label');
  const strength = document.getElementById('pw-strength');

  input?.addEventListener('input', () => {
    const pw = input.value;
    if (!pw) { strength.style.display = 'none'; return; }
    strength.style.display = 'flex';
    const score = getStrengthScore(pw);
    const map = [
      { pct: '25%', color: '#ef5350', text: 'Weak' },
      { pct: '50%', color: '#ffa726', text: 'Fair' },
      { pct: '75%', color: '#29b6f6', text: 'Good' },
      { pct: '100%', color: '#4caf78', text: 'Strong' },
    ];
    const s = map[score - 1] || map[0];
    bar.style.width        = s.pct;
    bar.style.background   = s.color;
    label.textContent      = s.text;
    label.style.color      = s.color;
  });
}

function getStrengthScore(pw) {
  let score = 0;
  if (pw.length >= 8)                   score++;
  if (pw.length >= 12)                  score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw))                score++;
  if (/[^A-Za-z0-9]/.test(pw))         score++;
  return Math.min(4, Math.max(1, Math.ceil(score / 1.25)));
}

// ── Register Form ──
function initRegisterForm() {
  const form       = document.getElementById('register-form');
  const submitBtn  = document.getElementById('reg-submit');
  const submitText = document.getElementById('submit-text');
  const submitSpin = document.getElementById('submit-spinner');
  const formError  = document.getElementById('form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    // Honeypot
    const hp = form.querySelector('[name="website"]');
    if (hp && hp.value) return;

    const name     = sanitizeInput(document.getElementById('reg-name').value);
    const email    = sanitizeInput(document.getElementById('reg-email').value);
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const terms    = document.getElementById('reg-terms').checked;

    let valid = true;

    if (!name || name.length < 2) {
      showError('err-name', 'Please enter your full name.'); valid = false;
    }
    if (!email || !validateEmail(email)) {
      showError('err-email', 'Please enter a valid email address.'); valid = false;
    }
    if (!password || password.length < 8) {
      showError('err-password', 'Password must be at least 8 characters.'); valid = false;
    }
    if (password !== confirm) {
      showError('err-confirm', 'Passwords do not match.'); valid = false;
    }
    if (!terms) {
      showError('err-terms', 'You must accept the Terms of Service to continue.'); valid = false;
    }

    if (!valid) return;

    setLoading(true, submitBtn, submitText, submitSpin);

    try {
      // Sign up with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
        },
      });

      if (error) throw error;

      // The profile is created automatically by the database trigger.
      // Show success message
      document.getElementById('register-form-wrap').style.display = 'none';
      document.getElementById('success-email').textContent = email;
      document.getElementById('register-success').style.display = 'block';

    } catch (err) {
      console.error(err);
      let msg = 'Registration failed. Please try again.';
      if (err.message?.includes('already registered') || err.message?.includes('User already registered')) {
        msg = 'An account with this email already exists. Please log in.';
      } else if (err.message?.includes('Password should be at least')) {
        msg = 'Password is too weak. Use at least 8 characters with a mix of letters and numbers.';
      }
      formError.textContent = msg;
      formError.style.display = 'block';
    } finally {
      setLoading(false, submitBtn, submitText, submitSpin);
    }
  });
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(e => e.textContent = '');
  document.getElementById('form-error').style.display = 'none';
}

function setLoading(loading, btn, text, spinner) {
  btn.classList.toggle('loading', loading);
  text.style.display    = loading ? 'none' : '';
  spinner.style.display  = loading ? 'inline-block' : 'none';
}
})();
