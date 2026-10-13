/**
 * Jolardo — Global Configuration
 * All environment-specific values are read from window.__ENV__ (injected server-side)
 * or from meta tags to keep secrets out of committed code.
 */

const CONFIG = {
  // Supabase — loaded from env.js which is generated from .env
  SUPABASE_URL: window.__ENV__?.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: window.__ENV__?.SUPABASE_ANON_KEY || '',

  // App
  APP_NAME: 'Jolardo',
  APP_TAGLINE: 'Premium Web Development',
  VERSION: '1.0.0',

  // Roles
  ROLES: {
    ADMIN: 'admin',
    CLIENT: 'client',
  },

  // Routes
  ROUTES: {
    HOME: 'index.html',
    CONTACT: 'contact.html',
    LOGIN: 'login.html',
    REGISTER: 'create-account.html',
    DASHBOARD: 'dashboard.html',
    ADMIN: 'admin.html',
  },
};

Object.freeze(CONFIG);
