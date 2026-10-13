(function() {
  const { supabase, requireAuth, signOut, getSettings, subscribeTable } = window.JolardoAuth || {};
  const {
    initTheme, toggleTheme, toast, initSidebar,
    hideLoader, formatDate, formatCurrency, escapeHtml,
    openModal, closeModal, initModals, confirmDialog,
    sanitizeInput, validateEmail, debounce
  } = window.JolardoUI || {};

/**
 * admin.js — Admin Panel
 */



initTheme();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

let currentUser = null;
let allClients  = [];
let allWebsites = [];
let allSubs     = [];
let allMessages = [];
let selectedMessage = null;

async function init() {
  try {
    const session = await requireAuth('admin');
    if (!session) return;
    currentUser = session.user;

    // Theme
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      const next = toggleTheme();
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
    });
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';

    initSidebar();
    initModals();
    initSidebarNav();
    initLogout();

    await Promise.all([loadClients(), loadWebsites(), loadSubscriptions(), loadMessages()]);

    renderOverview();
    renderSidebarUser();
    loadSettings();
    initRealtime();
  } catch (err) {
    console.warn('[Jolardo] Admin init warning:', err);
  } finally {
    hideLoader();
  }
}

// ── Realtime Subscriptions ──
function initRealtime() {
  if (typeof subscribeTable !== 'function') return;

  // 1. Contact Messages
  subscribeTable('contact_messages', (payload) => {
    if (payload.eventType === 'INSERT') {
      allMessages.unshift(payload.new);
      renderMessages();
      renderOverview();
      toast.info({
        title: 'New Contact Message',
        message: `${escapeHtml(payload.new.name || 'Visitor')}: ${escapeHtml(payload.new.subject || payload.new.message?.slice(0, 30) || 'New message')}`
      });
    } else if (payload.eventType === 'UPDATE') {
      const idx = allMessages.findIndex(m => m.id === payload.new.id);
      if (idx !== -1) {
        allMessages[idx] = payload.new;
        renderMessages();
      }
    } else if (payload.eventType === 'DELETE') {
      allMessages = allMessages.filter(m => m.id !== payload.old.id);
      renderMessages();
      renderOverview();
    }
  });

  // 2. Client Profiles
  subscribeTable('profiles', (payload) => {
    if (payload.eventType === 'INSERT') {
      allClients.unshift(payload.new);
      renderClientsTable(allClients);
      renderOverview();
      toast.success({
        title: 'New Client Registered',
        message: `${escapeHtml(payload.new.full_name || payload.new.email)} has joined.`
      });
    } else if (payload.eventType === 'UPDATE') {
      const idx = allClients.findIndex(c => c.id === payload.new.id);
      if (idx !== -1) {
        allClients[idx] = payload.new;
        renderClientsTable(allClients);
      }
    } else if (payload.eventType === 'DELETE') {
      allClients = allClients.filter(c => c.id !== payload.old.id);
      renderClientsTable(allClients);
      renderOverview();
    }
  });

  // 3. Websites
  subscribeTable('websites', async () => {
    await loadWebsites();
    renderWebsitesTable(allWebsites);
    renderOverview();
  });

  // 4. Subscriptions
  subscribeTable('subscriptions', async () => {
    await loadSubscriptions();
    renderSubscriptionsTable(allSubs);
    renderOverview();
  });

  // 5. Payments
  subscribeTable('payments', (payload) => {
    renderOverview();
    if (payload.eventType === 'INSERT') {
      toast.success({
        title: 'Payment Recorded',
        message: `$${payload.new.amount} received.`
      });
    }
  });

  // 6. Settings
  subscribeTable('admin_settings', (payload) => {
    if (payload.new?.setting_key) {
      const input = document.getElementById(`setting-${payload.new.setting_key}`);
      if (input && document.activeElement !== input) {
        input.value = payload.new.setting_value || '';
      }
    }
  });
}

// ── Data Loading ──
async function loadClients() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  allClients = data || [];
}

async function loadWebsites() {
  const { data } = await supabase
    .from('websites')
    .select('*, profiles(full_name, email)')
    .order('created_at', { ascending: false });
  allWebsites = data || [];
}

async function loadSubscriptions() {
  const { data } = await supabase
    .from('subscriptions')
    .select('*, profiles(full_name, email), websites(website_name), subscription_plans(name, price)')
    .order('created_at', { ascending: false });
  allSubs = data || [];
}

async function loadMessages() {
  const { data } = await supabase
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false });
  allMessages = data || [];
  const unread = allMessages.filter(m => m.status === 'unread').length;
  const badge  = document.getElementById('msg-badge');
  if (badge) {
    badge.textContent = unread > 0 ? unread : '';
    badge.style.display = unread > 0 ? 'inline-flex' : 'none';
  }
}

// ── Sidebar User ──
function renderSidebarUser() {
  const client = allClients.find(c => c.id === currentUser.id);
  const name   = client?.full_name || currentUser.email || 'Admin';
  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
}

// ── Sidebar Nav ──
function initSidebarNav() {
  const sections = ['overview', 'clients', 'websites', 'subscriptions', 'messages', 'settings'];
  sections.forEach(s => {
    const btn = document.getElementById(`nav-${s}`);
    btn?.addEventListener('click', () => switchSection(s));
  });
}

function switchSection(name) {
  const titles = {
    overview: 'Dashboard Overview', clients: 'Client Management',
    websites: 'Website Management', subscriptions: 'Subscription Management',
    messages: 'Contact Messages', settings: 'Admin Settings',
  };
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`nav-${name}`)?.classList.add('active');
  document.querySelectorAll('.dash-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${name}`)?.classList.remove('hidden');
  document.getElementById('topbar-title').textContent = titles[name] || 'Admin';

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  switch (name) {
    case 'clients':       renderClientsTable(allClients); initClientSearch(); break;
    case 'websites':      renderWebsitesTable(allWebsites); initWebsiteActions(); break;
    case 'subscriptions': renderSubsTable(allSubs); initSubActions(); break;
    case 'messages':      renderMessagesList(allMessages); break;
    case 'settings':      loadSettings(); initSettingsForms(); break;
  }
}

// ── Logout ──
function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await signOut(); window.location.href = 'login.html'; }
    catch (err) { toast.error('Logout failed', err.message); }
  });
}

// ── OVERVIEW ──
function renderOverview() {
  document.getElementById('stat-clients').textContent    = allClients.filter(c => c.role === 'client').length;
  document.getElementById('stat-websites').textContent   = allWebsites.length;
  document.getElementById('stat-active-subs').textContent  = allSubs.filter(s => s.status === 'active').length;
  document.getElementById('stat-expired-subs').textContent = allSubs.filter(s => s.status === 'expired').length;
  document.getElementById('stat-pending-payments').textContent = allSubs.filter(s => s.payment_status === 'pending').length;
  const unread = allMessages.filter(m => m.status === 'unread').length;
  document.getElementById('stat-unread-msgs').textContent = unread;

  // Recent messages
  const recentMsgs = allMessages.slice(0, 5);
  document.getElementById('recent-messages-list').innerHTML = recentMsgs.length
    ? recentMsgs.map(m => `
        <div class="message-item ${m.status === 'unread' ? 'unread' : ''}" style="cursor:pointer;" onclick="switchToMessages('${m.id}')">
          <div class="msg-sender">${escapeHtml(m.name)} <span style="color:var(--text-muted);font-size:0.78rem;">— ${escapeHtml(m.email)}</span></div>
          <div class="msg-subject">${escapeHtml(m.subject)}</div>
          <div class="msg-date">${formatDate(m.created_at)}</div>
        </div>`).join('')
    : `<div class="empty-state"><div class="empty-state-icon">✉️</div><p>No messages yet.</p></div>`;

  // Recent clients
  const recentClients = allClients.filter(c => c.role !== 'admin').slice(0, 5);
  document.getElementById('recent-clients-list').innerHTML = recentClients.length
    ? recentClients.map(c => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px;">
          <div class="sidebar-avatar" style="width:32px;height:32px;font-size:0.8rem;">${(c.full_name||'?').charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-size:0.875rem;font-weight:600;">${escapeHtml(c.full_name||'Unnamed')}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(c.email)}</div>
          </div>
          <div style="margin-left:auto;font-size:0.75rem;color:var(--text-muted);">${formatDate(c.created_at)}</div>
        </div>`).join('')
    : `<div class="empty-state"><div class="empty-state-icon">👥</div><p>No clients yet.</p></div>`;
}

// For overview quick link to messages
window.switchToMessages = function(msgId) {
  switchSection('messages');
  document.getElementById('nav-messages')?.click();
};

// ── CLIENTS TABLE ──
function renderClientsTable(clients) {
  const wrap = document.getElementById('clients-table-wrap');
  const list = clients.filter(c => c.role !== 'admin');
  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>No Clients</h3><p>Registered clients will appear here.</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Website</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${list.map(c => {
          const site = allWebsites.find(w => w.client_id === c.id);
          return `
            <tr>
              <td>
                <div class="client-row-name">${escapeHtml(c.full_name || 'Unnamed')}</div>
              </td>
              <td><div class="client-row-email">${escapeHtml(c.email)}</div></td>
              <td><span class="badge badge-info">${escapeHtml(c.role || 'client')}</span></td>
              <td style="font-size:0.8rem;">${formatDate(c.created_at)}</td>
              <td style="font-size:0.85rem;">${site ? `<a href="${escapeHtml(site.website_url||'#')}" target="_blank" style="color:var(--clr-silver);">${escapeHtml(site.website_name||site.domain||'—')}</a>` : '<span style="color:var(--text-muted);">—</span>'}</td>
              <td>
                <div class="action-group">
                  <button class="btn-icon" title="View details" onclick="viewClient('${c.id}')">👁️</button>
                </div>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function initClientSearch() {
  const input = document.getElementById('client-search');
  if (!input || input._init) return;
  input._init = true;
  input.addEventListener('input', debounce(() => {
    const q = input.value.toLowerCase();
    const filtered = allClients.filter(c =>
      (c.full_name||'').toLowerCase().includes(q) ||
      (c.email||'').toLowerCase().includes(q)
    );
    renderClientsTable(filtered);
  }, 250));
}

window.viewClient = function(id) {
  const c = allClients.find(c => c.id === id);
  if (!c) return;
  const sites = allWebsites.filter(w => w.client_id === id);
  const subs  = allSubs.filter(s => s.client_id === id);

  document.getElementById('client-modal-title').textContent = c.full_name || 'Client Details';
  document.getElementById('client-modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div><div class="form-label">Full Name</div><div style="font-weight:600;">${escapeHtml(c.full_name||'—')}</div></div>
      <div><div class="form-label">Email</div><div>${escapeHtml(c.email||'—')}</div></div>
      <div><div class="form-label">Role</div><span class="badge badge-info">${escapeHtml(c.role||'client')}</span></div>
      <div><div class="form-label">Joined</div><div>${formatDate(c.created_at)}</div></div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin:20px 0 10px;">
      <h4 class="serif" style="margin:0;font-size:1.05rem;">Websites (${sites.length})</h4>
      <button class="btn btn-outline btn-sm" onclick="closeModal('client-modal'); openWebsiteModal(null, '${c.id}')">+ Add Website</button>
    </div>
    ${sites.length ? `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${sites.map(site => `
          <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-glass);">
            <div style="display:flex;align-items:center;gap:12px;">
              ${site.logo_url ? `<img src="${escapeHtml(site.logo_url)}" style="width:36px;height:36px;object-fit:contain;border-radius:4px;border:1px solid var(--border-color);" />` : '<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--bg-glass);border-radius:4px;font-size:1.2rem;">🌐</div>'}
              <div>
                <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(site.website_name||site.domain||'Unnamed Website')}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${site.domain || site.website_url || 'No domain'}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge ${statusBadge(site.website_status)}">${escapeHtml(site.website_status||'—')}</span>
              <button class="btn-icon" title="Edit" onclick="closeModal('client-modal'); editWebsite('${site.id}')">✏️</button>
            </div>
          </div>
        `).join('')}
      </div>` : `<p style="color:var(--text-muted);font-size:0.9rem;">No websites assigned yet.</p>`}

    <div style="display:flex;align-items:center;justify-content:space-between;margin:24px 0 10px;">
      <h4 class="serif" style="margin:0;font-size:1.05rem;">Subscriptions & Bills (${subs.length})</h4>
      <button class="btn btn-outline btn-sm" onclick="closeModal('client-modal'); openSubModal(null, '${c.id}')">+ Add Subscription</button>
    </div>
    ${subs.length ? `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${subs.map(sub => {
          const site = allWebsites.find(w => w.id === sub.website_id);
          const price = sub.amount != null ? sub.amount : (sub.subscription_plans?.price || 0);
          const curr = sub.currency || 'EGP';
          return `
            <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-glass);flex-wrap:wrap;">
              <div>
                <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(sub.subscription_plans?.name || 'Subscription')} ${site ? `— <span style="font-size:0.8rem;color:var(--clr-gold);">${escapeHtml(site.website_name||site.domain)}</span>` : ''}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">Amount: <strong style="color:var(--text-primary);">${price} ${curr}</strong> | Renewal: ${formatDate(sub.renewal_date)}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="badge ${subStatusBadge(sub.status)}">${escapeHtml(sub.status||'—')}</span>
                <span class="badge ${paymentBadge(sub.payment_status)}">${escapeHtml(sub.payment_status||'—')}</span>
                ${sub.payment_status !== 'paid' ? `
                  <button class="btn btn-sm" style="background:#2e7d32;color:#fff;border:none;padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:4px;" onclick="quickMarkPaid('${sub.id}')">✓ Mark Paid</button>
                ` : `
                  <button class="btn btn-sm" style="background:transparent;color:var(--text-muted);border:1px solid var(--border-color);padding:4px 8px;font-size:0.75rem;cursor:pointer;border-radius:4px;" onclick="quickMarkUnpaid('${sub.id}')">↩ Unpaid</button>
                `}
                <button class="btn-icon" title="Edit" onclick="closeModal('client-modal'); editSub('${sub.id}')">✏️</button>
              </div>
            </div>`;
        }).join('')}
      </div>` : `<p style="color:var(--text-muted);font-size:0.9rem;">No subscriptions assigned yet.</p>`}
  `;

  openModal('client-modal');
};

// ── WEBSITES TABLE ──
function renderWebsitesTable(websites) {
  const wrap = document.getElementById('websites-table-wrap');
  if (!websites.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🌐</div><h3>No Websites</h3><p>Add website records using the button above.</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Website & Logo</th><th>Client</th><th>Domain</th><th>Status</th><th>Updated</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${websites.map(w => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                ${w.logo_url ? `<img src="${escapeHtml(w.logo_url)}" alt="Logo" style="width:34px;height:34px;object-fit:contain;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-glass);" />` : '<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:var(--bg-glass);border-radius:4px;border:1px solid var(--border-color);font-size:1.1rem;">🌐</div>'}
                <div>
                  <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(w.website_name||'—')}</div>
                  ${w.website_url ? `<a href="${escapeHtml(w.website_url)}" target="_blank" style="font-size:0.78rem;color:var(--clr-silver);">${escapeHtml(w.website_url)}</a>` : ''}
                </div>
              </div>
            </td>
            <td style="font-size:0.85rem;">${escapeHtml(w.profiles?.full_name||w.profiles?.email||'—')}</td>
            <td style="font-size:0.85rem;">${escapeHtml(w.domain||'—')}</td>
            <td><span class="badge ${statusBadge(w.website_status)}">${escapeHtml(w.website_status||'—')}</span></td>
            <td style="font-size:0.78rem;color:var(--text-muted);">${formatDate(w.updated_at)}</td>
            <td>
              <div class="action-group">
                <button class="btn-icon" title="Edit" onclick="editWebsite('${w.id}')">✏️</button>
                <button class="btn-icon danger" title="Delete" onclick="deleteWebsite('${w.id}')">🗑️</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function initWebsiteActions() {
  const addBtn = document.getElementById('add-website-btn');
  if (addBtn && !addBtn._init) {
    addBtn._init = true;
    addBtn.addEventListener('click', () => openWebsiteModal(null));
  }

  const saveBtn = document.getElementById('website-save-btn');
  if (saveBtn && !saveBtn._init) {
    saveBtn._init = true;
    saveBtn.addEventListener('click', saveWebsite);
  }

  // Logo file upload dropzone
  const dropzone = document.getElementById('wf-logo-dropzone');
  const fileInput = document.getElementById('wf-logo-file');
  const removeBtn = document.getElementById('wf-logo-remove-btn');

  if (dropzone && fileInput && !dropzone._init) {
    dropzone._init = true;
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--clr-gold)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-color)';
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-color)';
      if (e.dataTransfer.files?.length) {
        handleLogoFileUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        handleLogoFileUpload(fileInput.files[0]);
      }
    });
  }

  if (removeBtn && !removeBtn._init) {
    removeBtn._init = true;
    removeBtn.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      const urlInput = document.getElementById('wf-logo');
      if (urlInput) urlInput.value = '';
      const previewWrap = document.getElementById('wf-logo-preview-wrapper');
      const previewImg  = document.getElementById('wf-logo-preview');
      if (previewWrap) previewWrap.style.display = 'none';
      if (previewImg) previewImg.src = '';
      if (dropzone) dropzone.style.display = 'block';
    });
  }
}

async function handleLogoFileUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast.error('Invalid File', 'Please select an image file (PNG, JPG, SVG, WebP).');
    return;
  }
  const uploadingIndicator = document.getElementById('wf-logo-uploading');
  const dropzone = document.getElementById('wf-logo-dropzone');
  const previewWrap = document.getElementById('wf-logo-preview-wrapper');
  const previewImg  = document.getElementById('wf-logo-preview');
  const urlInput    = document.getElementById('wf-logo');

  if (uploadingIndicator) uploadingIndicator.style.display = 'block';

  let finalUrl = '';
  try {
    const ext = file.name.split('.').pop() || 'png';
    const filePath = `website-logos/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

    // Try Supabase Storage
    if (supabase?.storage) {
      const { data, error } = await supabase.storage.from('logos').upload(filePath, file, { upsert: true });
      if (!error && data) {
        const { data: pubData } = supabase.storage.from('logos').getPublicUrl(filePath);
        if (pubData?.publicUrl) finalUrl = pubData.publicUrl;
      }
    }
  } catch (err) {
    console.warn('[Logo Upload Storage warning, falling back to data URL]', err);
  }

  // Fallback to Base64 Data URL if storage bucket fails or not configured
  if (!finalUrl) {
    finalUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  if (uploadingIndicator) uploadingIndicator.style.display = 'none';
  if (urlInput) urlInput.value = finalUrl;
  if (previewImg) previewImg.src = finalUrl;
  if (previewWrap) previewWrap.style.display = 'flex';
  if (dropzone) dropzone.style.display = 'none';

  toast.success('Logo Ready', 'Image loaded successfully.');
}

function openWebsiteModal(website, preselectedClientId = null) {
  initWebsiteActions();
  document.getElementById('website-modal-title').textContent = website ? 'Edit Website' : 'New Website';
  document.getElementById('wf-id').value      = website?.id || '';
  document.getElementById('wf-name').value    = website?.website_name || '';
  document.getElementById('wf-brand').value   = website?.brand_name || '';
  document.getElementById('wf-domain').value  = website?.domain || '';
  document.getElementById('wf-url').value     = website?.website_url || '';
  document.getElementById('wf-desc').value    = website?.brand_description || '';
  document.getElementById('wf-status').value  = website?.website_status || 'development';

  const logoVal = website?.logo_url || '';
  document.getElementById('wf-logo').value = logoVal;
  const previewWrap = document.getElementById('wf-logo-preview-wrapper');
  const previewImg  = document.getElementById('wf-logo-preview');
  const dropzone    = document.getElementById('wf-logo-dropzone');
  const fileInput   = document.getElementById('wf-logo-file');
  if (fileInput) fileInput.value = '';

  if (logoVal) {
    if (previewImg) previewImg.src = logoVal;
    if (previewWrap) previewWrap.style.display = 'flex';
    if (dropzone) dropzone.style.display = 'none';
  } else {
    if (previewWrap) previewWrap.style.display = 'none';
    if (dropzone) dropzone.style.display = 'block';
  }

  // Populate client select
  const activeClientId = website?.client_id || preselectedClientId;
  const sel = document.getElementById('wf-client');
  sel.innerHTML = allClients.filter(c => c.role !== 'admin').map(c =>
    `<option value="${c.id}" ${activeClientId === c.id ? 'selected' : ''}>${escapeHtml(c.full_name||c.email)}</option>`
  ).join('');

  openModal('website-modal');
}

window.editWebsite = function(id) {
  const w = allWebsites.find(w => w.id === id);
  if (w) { initWebsiteActions(); openWebsiteModal(w); }
};

window.deleteWebsite = async function(id) {
  if (!confirm('Delete this website? This cannot be undone.')) return;
  const { error } = await supabase.from('websites').delete().eq('id', id);
  if (error) { toast.error('Delete failed', error.message); return; }
  toast.success('Website deleted');
  await loadWebsites();
  renderWebsitesTable(allWebsites);
};

async function saveWebsite() {
  const id        = document.getElementById('wf-id').value;
  const client_id = document.getElementById('wf-client').value;
  const name      = sanitizeInput(document.getElementById('wf-name').value);
  if (!name) { toast.error('Validation', 'Website name is required.'); return; }

  const payload = {
    client_id,
    website_name:      name,
    brand_name:        sanitizeInput(document.getElementById('wf-brand').value),
    domain:            sanitizeInput(document.getElementById('wf-domain').value),
    website_url:       sanitizeInput(document.getElementById('wf-url').value),
    logo_url:          sanitizeInput(document.getElementById('wf-logo').value),
    brand_description: sanitizeInput(document.getElementById('wf-desc').value),
    website_status:    document.getElementById('wf-status').value,
    updated_at:        new Date().toISOString(),
  };

  setLoading2('ws', true);
  try {
    let error;
    if (id) {
      ({ error } = await supabase.from('websites').update(payload).eq('id', id));
    } else {
      ({ error } = await supabase.from('websites').insert(payload));
    }
    if (error) throw error;
    toast.success('Saved!', 'Website record updated.');
    closeModal('website-modal');
    await loadWebsites();
    renderWebsitesTable(allWebsites);
  } catch (err) {
    toast.error('Save failed', err.message);
  } finally {
    setLoading2('ws', false);
  }
}

// ── SUBSCRIPTIONS TABLE ──
function renderSubsTable(subs) {
  const wrap = document.getElementById('subs-table-wrap');
  if (!subs.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💳</div><h3>No Subscriptions</h3><p>Create subscriptions using the button above.</p></div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Client</th>
          <th>Website</th>
          <th>Plan</th>
          <th>Price / Bill</th>
          <th>Status</th>
          <th>Payment</th>
          <th>Renewal</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${subs.map(s => {
          const price = s.amount != null ? s.amount : (s.subscription_plans?.price || 0);
          const curr  = s.currency || 'EGP';
          const isPaid = s.payment_status === 'paid';
          return `
          <tr>
            <td>
              <div style="font-size:0.875rem;font-weight:600;">${escapeHtml(s.profiles?.full_name||s.profiles?.email||'—')}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(s.profiles?.email||'')}</div>
            </td>
            <td style="font-size:0.85rem;">
              ${s.websites?.website_name ? `<span style="color:var(--clr-gold);font-weight:500;">${escapeHtml(s.websites.website_name)}</span>` : '<span style="color:var(--text-muted);">—</span>'}
            </td>
            <td>
              <div style="font-weight:600;font-size:0.875rem;">${escapeHtml(s.subscription_plans?.name||'—')}</div>
              ${s.payment_reference ? `<div style="font-size:0.72rem;color:var(--text-muted);">Ref: ${escapeHtml(s.payment_reference)}</div>` : ''}
            </td>
            <td>
              <span style="font-weight:700;color:var(--text-primary);font-size:0.9rem;">${price}</span>
              <span style="font-size:0.75rem;color:var(--clr-gold);margin-left:2px;">${escapeHtml(curr)}</span>
            </td>
            <td><span class="badge ${subStatusBadge(s.status)}">${escapeHtml(s.status||'—')}</span></td>
            <td>
              <span class="badge ${paymentBadge(s.payment_status)}">
                ${isPaid ? '✓ Paid' : (s.payment_status === 'pending' ? '⏳ Pending' : escapeHtml(s.payment_status||'—'))}
              </span>
            </td>
            <td style="font-size:0.8rem;">${formatDate(s.renewal_date)}</td>
            <td>
              <div class="action-group">
                ${!isPaid ? `
                  <button class="btn btn-sm" style="background:#2e7d32;color:#fff;border:none;padding:5px 9px;font-size:0.75rem;cursor:pointer;border-radius:4px;font-weight:600;white-space:nowrap;" onclick="quickMarkPaid('${s.id}')" title="Confirm Payment Received">
                    ✓ Paid
                  </button>
                ` : `
                  <button class="btn btn-sm" style="background:transparent;color:var(--text-muted);border:1px solid var(--border-color);padding:5px 9px;font-size:0.75rem;cursor:pointer;border-radius:4px;white-space:nowrap;" onclick="quickMarkUnpaid('${s.id}')" title="Mark Unpaid">
                    ↩ Unpaid
                  </button>
                `}
                <button class="btn-icon" title="Copy InstaPay Bill info" onclick="copyInstaPayBill('${s.id}')">📋</button>
                <button class="btn-icon" title="Edit" onclick="editSub('${s.id}')">✏️</button>
                <button class="btn-icon danger" title="Delete" onclick="deleteSub('${s.id}')">🗑️</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function initSubActions() {
  const addBtn = document.getElementById('add-sub-btn');
  if (addBtn && !addBtn._init) {
    addBtn._init = true;
    addBtn.addEventListener('click', () => openSubModal(null));
  }
  const saveBtn = document.getElementById('sub-save-btn');
  if (saveBtn && !saveBtn._init) {
    saveBtn._init = true;
    saveBtn.addEventListener('click', saveSub);
  }
}

function openSubModal(sub, preselectedClientId = null) {
  initSubActions();
  document.getElementById('sub-modal-title').textContent = sub ? 'Edit Subscription' : 'New Subscription';
  document.getElementById('sf-id').value              = sub?.id || '';
  document.getElementById('sf-plan-name').value       = sub?.subscription_plans?.name || '';
  document.getElementById('sf-price').value           = (sub?.amount != null ? sub.amount : sub?.subscription_plans?.price) || '';
  document.getElementById('sf-currency').value        = sub?.currency || 'EGP';
  document.getElementById('sf-status').value          = sub?.status || 'pending';
  document.getElementById('sf-payment-status').value  = sub?.payment_status || 'pending';
  document.getElementById('sf-start').value           = sub?.start_date ? sub.start_date.slice(0,10) : '';
  document.getElementById('sf-renewal').value         = sub?.renewal_date ? sub.renewal_date.slice(0,10) : '';
  document.getElementById('sf-ref').value             = sub?.payment_reference || '';
  document.getElementById('sf-instapay-link').value   = sub?.instapay_link || '';

  const activeClientId = sub?.client_id || preselectedClientId;
  const clientSel = document.getElementById('sf-client');
  clientSel.innerHTML = allClients.filter(c => c.role !== 'admin').map(c =>
    `<option value="${c.id}" ${activeClientId === c.id ? 'selected' : ''}>${escapeHtml(c.full_name||c.email)}</option>`
  ).join('');

  const webSel = document.getElementById('sf-website');
  webSel.innerHTML = `<option value="">— General / None —</option>` + allWebsites.map(w =>
    `<option value="${w.id}" ${sub?.website_id === w.id ? 'selected' : ''}>${escapeHtml(w.website_name||w.domain||w.id)}</option>`
  ).join('');

  openModal('sub-modal');
}

window.editSub = function(id) {
  const s = allSubs.find(s => s.id === id);
  if (s) { initSubActions(); openSubModal(s); }
};

window.deleteSub = async function(id) {
  if (!confirm('Delete this subscription? This cannot be undone.')) return;
  const { error } = await supabase.from('subscriptions').delete().eq('id', id);
  if (error) { toast.error('Delete failed', error.message); return; }
  toast.success('Subscription deleted');
  await loadSubscriptions();
  renderSubsTable(allSubs);
  renderOverview();
};

window.quickMarkPaid = async function(id) {
  const sub = allSubs.find(s => s.id === id);
  if (!sub) return;

  try {
    const { error } = await supabase.from('subscriptions').update({
      payment_status: 'paid',
      status: 'active',
      updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) throw error;

    // Record payment entry
    const amount = sub.amount != null ? sub.amount : (sub.subscription_plans?.price || 0);
    const currency = sub.currency || 'EGP';
    await supabase.from('payments').insert({
      subscription_id: id,
      amount: amount,
      currency: currency,
      status: 'paid',
      payment_reference: sub.payment_reference || `INSTAPAY-${Date.now().toString(36).toUpperCase()}`,
      paid_at: new Date().toISOString()
    });

    toast.success('Payment Confirmed!', 'Subscription marked as Paid & Active.');
    await loadSubscriptions();
    renderSubsTable(allSubs);
    renderOverview();
  } catch (err) {
    toast.error('Failed to update payment', err.message);
  }
};

window.quickMarkUnpaid = async function(id) {
  try {
    const { error } = await supabase.from('subscriptions').update({
      payment_status: 'pending',
      updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) throw error;

    toast.info('Marked Pending', 'Subscription payment status set to pending.');
    await loadSubscriptions();
    renderSubsTable(allSubs);
    renderOverview();
  } catch (err) {
    toast.error('Update failed', err.message);
  }
};

window.copyInstaPayBill = async function(id) {
  const sub = allSubs.find(s => s.id === id);
  if (!sub) return;

  const client = allClients.find(c => c.id === sub.client_id);
  const site   = allWebsites.find(w => w.id === sub.website_id);
  const amount = sub.amount != null ? sub.amount : (sub.subscription_plans?.price || 0);
  const curr   = sub.currency || 'EGP';
  const ref    = sub.payment_reference || `INV-${sub.id.slice(0, 8).toUpperCase()}`;

  // Fetch InstaPay settings
  const settings = await getSettings(['instapay_username', 'instapay_link', 'instapay_phone']);
  const ipUser = settings.instapay_username || 'jolardo@instapay';
  const ipLink = sub.instapay_link || settings.instapay_link || 'https://ipn.eg/';

  const billText = `💎 JOLARDO INVOICE
-----------------------------
Client: ${client?.full_name || client?.email || 'Valued Client'}
Service: ${sub.subscription_plans?.name || 'Subscription'}${site ? ` (${site.website_name})` : ''}
Invoice Ref: ${ref}
Total Amount: ${amount} ${curr}

📱 Pay via InstaPay:
IPA: ${ipUser}
${settings.instapay_phone ? `Phone: ${settings.instapay_phone}\n` : ''}Link: ${ipLink}
-----------------------------
Please include ref "${ref}" in payment note.`;

  try {
    await navigator.clipboard.writeText(billText);
    toast.success('Invoice Copied!', 'InstaPay bill summary copied to clipboard.');
  } catch (_) {
    prompt('Copy InstaPay Bill:', billText);
  }
};

async function saveSub() {
  const id         = document.getElementById('sf-id').value;
  const client_id  = document.getElementById('sf-client').value;
  const website_id = document.getElementById('sf-website').value || null;
  const planName   = sanitizeInput(document.getElementById('sf-plan-name').value);
  const price      = parseFloat(document.getElementById('sf-price').value) || null;
  const currency   = document.getElementById('sf-currency').value || 'EGP';
  const status     = document.getElementById('sf-status').value;
  const payStatus  = document.getElementById('sf-payment-status').value;
  const startDate  = document.getElementById('sf-start').value || null;
  const renewal    = document.getElementById('sf-renewal').value || null;
  const ref        = sanitizeInput(document.getElementById('sf-ref').value);
  const instaLink  = sanitizeInput(document.getElementById('sf-instapay-link').value);

  if (!planName) { toast.error('Validation', 'Plan name is required.'); return; }

  setLoading2('sub-save', true);
  try {
    // Upsert plan
    let plan_id = null;
    if (planName) {
      const { data: planData, error: pe } = await supabase
        .from('subscription_plans')
        .upsert({ name: planName, price, currency, is_active: true }, { onConflict: 'name' })
        .select('id').single();
      if (!pe && planData) plan_id = planData.id;
    }

    const payload = {
      client_id, website_id, plan_id,
      amount: price,
      currency: currency,
      status, payment_status: payStatus,
      start_date: startDate, renewal_date: renewal,
      payment_reference: ref || null,
      instapay_link: instaLink || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (id) {
      ({ error } = await supabase.from('subscriptions').update(payload).eq('id', id));
    } else {
      ({ error } = await supabase.from('subscriptions').insert(payload));
    }
    if (error) throw error;
    toast.success('Saved!', 'Subscription updated.');
    closeModal('sub-modal');
    await loadSubscriptions();
    renderSubsTable(allSubs);
    renderOverview();
  } catch (err) {
    toast.error('Save failed', err.message);
  } finally {
    setLoading2('sub-save', false);
  }
}

// ── MESSAGES ──
function renderMessagesList(messages) {
  const list = document.getElementById('messages-list');
  if (!messages.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✉️</div><h3>No Messages</h3><p>Contact form submissions appear here.</p></div>`;
    return;
  }
  list.innerHTML = messages.map(m => `
    <div class="message-item ${m.status === 'unread' ? 'unread' : ''}" data-id="${m.id}" onclick="openMessage('${m.id}')">
      <div class="msg-sender">${escapeHtml(m.name)}</div>
      <div class="msg-subject">${escapeHtml(m.subject)}</div>
      <div class="msg-date">${formatDate(m.created_at)}</div>
    </div>`).join('');
}

window.openMessage = async function(id) {
  const msg = allMessages.find(m => m.id === id);
  if (!msg) return;

  // Mark active in list
  document.querySelectorAll('.message-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  // Mark as read
  if (msg.status === 'unread') {
    await supabase.from('contact_messages').update({ status: 'read' }).eq('id', id);
    msg.status = 'read';
    document.querySelector(`.message-item[data-id="${id}"]`)?.classList.remove('unread');
    await loadMessages();
  }

  document.getElementById('message-detail').innerHTML = `
    <div class="msg-detail-header">
      <h3 class="msg-detail-title serif">${escapeHtml(msg.subject)}</h3>
      <div class="msg-meta">
        <span>From: <strong>${escapeHtml(msg.name)}</strong></span>
        <span><a href="mailto:${escapeHtml(msg.email)}" style="color:var(--clr-silver);">${escapeHtml(msg.email)}</a></span>
        <span>${formatDate(msg.created_at)}</span>
        <span><span class="badge ${msg.status === 'unread' ? 'badge-warning' : 'badge-muted'}">${msg.status}</span></span>
      </div>
    </div>
    <div class="msg-body">${escapeHtml(msg.message)}</div>
    <div class="msg-actions">
      <a href="mailto:${escapeHtml(msg.email)}?subject=Re: ${encodeURIComponent(msg.subject)}" class="btn btn-primary btn-sm">Reply via Email</a>
      <button class="btn btn-outline btn-sm" onclick="archiveMessage('${msg.id}')">Archive</button>
      <button class="btn btn-outline btn-sm" style="color:#ef5350;border-color:#ef5350;" onclick="deleteMessage('${msg.id}')">Delete</button>
    </div>`;
};

window.archiveMessage = async function(id) {
  await supabase.from('contact_messages').update({ status: 'archived' }).eq('id', id);
  toast.info('Message archived');
  await loadMessages();
  renderMessagesList(allMessages.filter(m => m.status !== 'archived'));
  document.getElementById('message-detail').innerHTML = `<div class="empty-state"><div class="empty-state-icon">✉️</div><h3>Select a Message</h3><p>Click on a message to read it here.</p></div>`;
};

window.deleteMessage = async function(id) {
  if (!confirm('Delete this message permanently?')) return;
  await supabase.from('contact_messages').delete().eq('id', id);
  toast.success('Message deleted');
  allMessages = allMessages.filter(m => m.id !== id);
  renderMessagesList(allMessages);
  document.getElementById('message-detail').innerHTML = `<div class="empty-state"><div class="empty-state-icon">✉️</div><h3>Select a Message</h3><p>Click on a message to read it here.</p></div>`;
};

// ── SETTINGS ──
async function loadSettings() {
  try {
    const settings = await getSettings([
      'contact_phone', 'whatsapp_number', 'contact_email',
      'site_name', 'site_tagline',
      'instapay_username', 'instapay_link', 'instapay_phone', 'instapay_notes'
    ]);
    document.getElementById('set-phone').value          = settings.contact_phone         || '';
    document.getElementById('set-whatsapp').value       = settings.whatsapp_number       || '';
    document.getElementById('set-email').value          = settings.contact_email         || '';
    document.getElementById('set-site-name').value      = settings.site_name             || '';
    document.getElementById('set-tagline').value        = settings.site_tagline          || '';
    document.getElementById('set-instapay-user').value  = settings.instapay_username      || 'jolardo@instapay';
    document.getElementById('set-instapay-link').value  = settings.instapay_link          || 'https://ipn.eg/';
    document.getElementById('set-instapay-phone').value = settings.instapay_phone         || '';
    document.getElementById('set-instapay-notes').value = settings.instapay_notes         || '';
  } catch (_) {}
}

function initSettingsForms() {
  initSettingsForm('settings-form', [
    { id: 'set-phone',    key: 'contact_phone' },
    { id: 'set-whatsapp', key: 'whatsapp_number' },
    { id: 'set-email',    key: 'contact_email' },
  ], 'settings');

  initSettingsForm('brand-settings-form', [
    { id: 'set-site-name', key: 'site_name' },
    { id: 'set-tagline',   key: 'site_tagline' },
  ], 'brand-settings');

  initSettingsForm('instapay-settings-form', [
    { id: 'set-instapay-user',  key: 'instapay_username' },
    { id: 'set-instapay-link',  key: 'instapay_link' },
    { id: 'set-instapay-phone', key: 'instapay_phone' },
    { id: 'set-instapay-notes', key: 'instapay_notes' },
  ], 'instapay-settings');
}

function initSettingsForm(formId, fields, prefix) {
  const form = document.getElementById(formId);
  if (!form || form._init) return;
  form._init = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading2(prefix, true);
    try {
      for (const { id, key } of fields) {
        const value = sanitizeInput(document.getElementById(id).value);
        await supabase.from('admin_settings').upsert(
          { setting_key: key, setting_value: value, updated_at: new Date().toISOString() },
          { onConflict: 'setting_key' }
        );
      }
      toast.success('Settings Saved', 'Your settings have been updated.');
    } catch (err) {
      toast.error('Save failed', err.message);
    } finally {
      setLoading2(prefix, false);
    }
  });
}

// ── Helpers ──
function setLoading2(prefix, on) {
  const btn     = document.getElementById(`${prefix}-submit`) || document.getElementById(`${prefix}-btn`);
  const txt     = document.getElementById(`${prefix}-text`);
  const spinner = document.getElementById(`${prefix}-spinner`);
  if (btn) btn.classList.toggle('loading', on);
  if (txt) txt.style.display = on ? 'none' : '';
  if (spinner) spinner.style.display = on ? 'inline-block' : 'none';
}

function statusBadge(status) {
  const map = { live:'badge-success', active:'badge-success', development:'badge-info', maintenance:'badge-warning', offline:'badge-danger', suspended:'badge-danger' };
  return map[(status||'').toLowerCase()] || 'badge-muted';
}

function subStatusBadge(status) {
  const map = { active:'badge-success', pending:'badge-warning', expired:'badge-danger', cancelled:'badge-danger' };
  return map[(status||'').toLowerCase()] || 'badge-muted';
}

function paymentBadge(status) {
  const map = { paid:'badge-success', pending:'badge-warning', failed:'badge-danger', refunded:'badge-info' };
  return map[(status||'').toLowerCase()] || 'badge-muted';
}
})();
