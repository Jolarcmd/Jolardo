(function() {
  const { supabase, getSession, getUserRole } = window.JolardoAuth || {};
  const {
    initTheme, toggleTheme, toast, hideLoader,
    validateEmail, sanitizeInput, openModal, closeModal, initModals
  } = window.JolardoUI || {};

/**
 * login.js — Login Page
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

    initModals();
    initLoginForm();
    initPasswordToggle();
    initForgotPassword();
  } catch (err) {
    console.warn('[Jolardo] Login init warning:', err);
  } finally {
    hideLoader();
  }
}

// ── Login Form ──
function initLoginForm() {
  const form       = document.getElementById('login-form');
  const submitBtn  = document.getElementById('login-submit');
  const submitText = document.getElementById('submit-text');
  const submitSpin = document.getElementById('submit-spinner');
  const formError  = document.getElementById('form-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email    = sanitizeInput(document.getElementById('login-email').value);
    const password = document.getElementById('login-password').value;

    let valid = true;
    if (!email || !validateEmail(email)) {
      showError('err-email', 'Please enter a valid email address.'); valid = false;
    }
    if (!password || password.length < 6) {
      showError('err-password', 'Please enter your password.'); valid = false;
    }
    if (!valid) return;

    setLoading(true, submitBtn, submitText, submitSpin);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const role = await getUserRole(data.user.id);
      toast.success('Welcome back!', 'Redirecting to your dashboard…');

      setTimeout(() => {
        window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
      }, 800);
    } catch (err) {
      console.error(err);
      let msg = 'Login failed. Please check your credentials.';
      if (err.message?.includes('Email not confirmed')) {
        msg = 'Please verify your email before logging in.';
      } else if (err.message?.includes('Invalid login credentials')) {
        msg = 'Invalid email or password. Please try again.';
      }
      formError.textContent = msg;
      formError.style.display = 'block';
    } finally {
      setLoading(false, submitBtn, submitText, submitSpin);
    }
  });
}

// ── Password toggle ──
function initPasswordToggle() {
  const toggle = document.getElementById('toggle-pw');
  const input  = document.getElementById('login-password');
  toggle?.addEventListener('click', () => {
    const isText = input.type === 'text';
    input.type   = isText ? 'password' : 'text';
    toggle.textContent = isText ? '👁️' : '🙈';
  });
}

// ── Forgot Password ──
function initForgotPassword() {
  document.getElementById('forgot-btn')?.addEventListener('click', () => {
    openModal('forgot-modal');
    document.getElementById('reset-success').style.display = 'none';
    document.getElementById('reset-email').value = '';
    document.getElementById('err-reset-email').textContent = '';
  });

  document.getElementById('reset-submit')?.addEventListener('click', async () => {
    const email = sanitizeInput(document.getElementById('reset-email').value);
    document.getElementById('err-reset-email').textContent = '';

    if (!email || !validateEmail(email)) {
      document.getElementById('err-reset-email').textContent = 'Please enter a valid email.';
      return;
    }

    const resetText = document.getElementById('reset-text');
    const resetSpin = document.getElementById('reset-spinner');
    resetText.style.display = 'none';
    resetSpin.style.display = 'inline-block';

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/login.html`,
      });
      if (error) throw error;
      document.getElementById('reset-success').style.display = 'block';
    } catch (err) {
      document.getElementById('err-reset-email').textContent = 'Could not send reset email. Please try again.';
    } finally {
      resetText.style.display = '';
      resetSpin.style.display = 'none';
    }
  });
}

// ── Helpers ──
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
  text.style.display   = loading ? 'none' : '';
  spinner.style.display = loading ? 'inline-block' : 'none';
}
})();
