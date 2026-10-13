(function() {
  const { supabase, requireAuth, getUserRole, signOut, subscribeTable } = window.JolardoAuth || {};
  const {
    initTheme, toggleTheme, toast, initSidebar,
    hideLoader, formatDate, formatCurrency, escapeHtml,
    openModal, closeModal, initModals, confirmDialog
  } = window.JolardoUI || {};

/**
 * dashboard.js — Client Dashboard
 */



initTheme();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.openModal = openModal;
window.closeModal = closeModal;

let currentUser = null;
let clientData  = { profile: null, websites: [], subscriptions: [], payments: [], instapaySettings: {} };

async function init() {
  try {
    const session = await requireAuth('client');
    if (!session) return;
    currentUser = session.user;

    // Set up theme toggle
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      const next = toggleTheme();
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) icon.textContent = next === 'dark' ? '☀️' : '🌙';
    });
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';

    initSidebar();
    initSidebarNav();
    initLogout();
    initModals();
    initInstaPayModalEvents();

    await loadClientData();
    renderSidebarUser();
    renderOverview();
    initRealtime();
  } catch (err) {
    console.warn('[Jolardo] Dashboard init warning:', err);
  } finally {
    hideLoader();
  }
}

// ── Realtime Subscriptions ──
function initRealtime() {
  if (typeof subscribeTable !== 'function' || !currentUser?.id) return;

  // 1. Client Website updates
  subscribeTable('websites', async (payload) => {
    await loadClientData();
    renderOverview();
    if (typeof renderWebsite === 'function') renderWebsite();
    if (typeof renderBrand === 'function') renderBrand();
    toast.info('Websites Updated', 'Your website details were updated by Jolardo team.');
  }, `client_id=eq.${currentUser.id}`);

  // 2. Client Subscription updates
  subscribeTable('subscriptions', async (payload) => {
    const prevSub = clientData.subscriptions.find(s => s.id === payload.new?.id);
    const wasPending = prevSub && prevSub.payment_status === 'pending';
    const isNowPaid  = payload.new && payload.new.payment_status === 'paid';

    await loadClientData();
    renderOverview();
    if (typeof renderSubscription === 'function') renderSubscription();

    if (wasPending && isNowPaid) {
      toast.success('🎉 Payment Confirmed!', 'Your subscription is now Paid & Active. Thank you!');
    } else {
      toast.info('Subscription Updated', 'Your subscription status has been updated.');
    }
  }, `client_id=eq.${currentUser.id}`);

  // 3. Client Payment updates
  subscribeTable('payments', async (payload) => {
    await loadClientData();
    renderPaymentsTable(clientData.payments);
    if (payload.eventType === 'INSERT') {
      toast.success('Payment Recorded', `Payment of ${payload.new.amount} ${payload.new.currency || 'EGP'} was confirmed.`);
    }
  });

  // 4. Client Profile updates
  subscribeTable('profiles', (payload) => {
    if (payload.new) {
      clientData.profile = payload.new;
      renderSidebarUser();
    }
  }, `id=eq.${currentUser.id}`);
}

// ── Load Data ──
async function loadClientData() {
  try {
    // Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();
    clientData.profile = profile;

    // Multiple Websites
    const { data: websites } = await supabase
      .from('websites')
      .select('*')
      .eq('client_id', currentUser.id)
      .order('created_at', { ascending: false });
    clientData.websites = websites || [];

    // Multiple Subscriptions
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('*, subscription_plans(*), websites(*)')
      .eq('client_id', currentUser.id)
      .order('created_at', { ascending: false });
    clientData.subscriptions = subs || [];

    // Payments for all client's subscriptions
    const subIds = clientData.subscriptions.map(s => s.id);
    if (subIds.length > 0) {
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .in('subscription_id', subIds)
        .order('created_at', { ascending: false });
      clientData.payments = payments || [];
    } else {
      clientData.payments = [];
    }

    // InstaPay settings
    try {
      clientData.instapaySettings = await getSettings([
        'instapay_username', 'instapay_link', 'instapay_phone', 'instapay_notes'
      ]);
    } catch (_) {
      clientData.instapaySettings = {};
    }
  } catch (err) {
    console.error('Error loading client data:', err);
    toast.error('Load Error', 'Some data could not be loaded. Please refresh.');
  }
}

// ── Sidebar Nav ──
function initSidebarNav() {
  const sections = ['overview', 'brand', 'website', 'subscription', 'account'];
  sections.forEach(s => {
    const btn = document.getElementById(`nav-${s}`);
    btn?.addEventListener('click', () => switchSection(s));
  });
}

function switchSection(name) {
  const titles = {
    overview:     'Overview',
    brand:        'Brand Information',
    website:      'My Websites',
    subscription: 'Subscriptions & Billing',
    account:      'Account Settings',
  };

  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`nav-${name}`)?.classList.add('active');

  document.querySelectorAll('.dash-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${name}`)?.classList.remove('hidden');

  document.getElementById('topbar-title').textContent = titles[name] || 'Dashboard';

  // Render on switch
  switch (name) {
    case 'overview':     renderOverview(); break;
    case 'brand':        renderBrand(); break;
    case 'website':      renderWebsite(); break;
    case 'subscription': renderSubscription(); break;
    case 'account':      renderAccount(); break;
  }

  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }
}
window.switchSection = switchSection;

// ── Logout ──
function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await signOut();
      window.location.href = 'login.html';
    } catch (err) {
      toast.error('Logout failed', err.message);
    }
  });
}

// ── Render: Sidebar User ──
function renderSidebarUser() {
  const name = clientData.profile?.full_name || currentUser.email || 'Client';
  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
}

// ── Render: Overview ──
function renderOverview() {
  const { websites, subscriptions } = clientData;
  const profile = clientData.profile;

  const name = profile?.full_name || currentUser.email || 'Client';
  document.getElementById('greeting-title').textContent = `Welcome back, ${name.split(' ')[0]}`;
  document.getElementById('greeting-sub').textContent   = `Account: ${currentUser.email}`;

  // Stat: Websites count
  document.getElementById('ov-websites-count').innerHTML = `
    <span style="font-size:1.4rem;font-weight:700;">${websites.length}</span>
    <span style="font-size:0.75rem;color:var(--text-muted);margin-left:4px;">active</span>
  `;

  // Stat: Active subs
  const activeSubs = subscriptions.filter(s => s.status === 'active');
  document.getElementById('ov-subs-count').innerHTML = `
    <span style="font-size:1.4rem;font-weight:700;">${activeSubs.length}</span>
    <span style="font-size:0.75rem;color:var(--text-muted);margin-left:4px;">/ ${subscriptions.length}</span>
  `;

  // Stat: Pending bills
  const pendingSubs = subscriptions.filter(s => s.payment_status === 'pending');
  const pendingEl = document.getElementById('ov-pending-count');
  if (pendingSubs.length > 0) {
    pendingEl.innerHTML = `<span class="badge badge-warning" style="font-size:0.85rem;padding:4px 10px;">⚠️ ${pendingSubs.length} Due</span>`;
  } else {
    pendingEl.innerHTML = `<span class="badge badge-success" style="font-size:0.85rem;padding:4px 10px;">✓ All Paid</span>`;
  }

  // Stat: Next Renewal date
  const upcomingRenewals = subscriptions
    .filter(s => s.renewal_date)
    .sort((a, b) => new Date(a.renewal_date) - new Date(b.renewal_date));
  document.getElementById('ov-renewal-date').textContent = upcomingRenewals.length > 0
    ? formatDate(upcomingRenewals[0].renewal_date)
    : '—';

  // Pending Bills Alert Banner
  const banner = document.getElementById('pending-bills-banner');
  if (banner) {
    if (pendingSubs.length > 0) {
      const firstPending = pendingSubs[0];
      const amount = firstPending.amount != null ? firstPending.amount : (firstPending.subscription_plans?.price || 0);
      const curr = firstPending.currency || 'EGP';
      banner.style.display = 'block';
      banner.innerHTML = `
        <div style="background:linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05));border:1px solid var(--clr-gold);border-radius:var(--radius-md);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:1.6rem;">📱</span>
            <div>
              <div style="font-weight:700;color:var(--clr-gold);font-size:0.95rem;">Pending Invoice: ${amount} ${curr}</div>
              <div style="font-size:0.8rem;color:var(--text-secondary);">You have ${pendingSubs.length} subscription invoice(s) awaiting payment via InstaPay.</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openInstaPayModal('${firstPending.id}')" style="box-shadow:0 0 15px rgba(212,175,55,0.4);">
            💳 Pay via InstaPay Now
          </button>
        </div>
      `;
    } else {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
  }

  // Quick Access: Websites list
  const listWrap = document.getElementById('ov-websites-list');
  if (!websites.length) {
    listWrap.innerHTML = `
      <div class="empty-state" style="padding:24px 16px;">
        <div class="empty-state-icon">🌐</div>
        <h3>No Websites Yet</h3>
        <p>Your websites will appear here once Jolardo sets up your projects.</p>
        <a href="contact.html" class="btn btn-outline btn-sm" style="margin-top:12px;">Contact Jolardo</a>
      </div>`;
  } else {
    listWrap.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:16px;">
        ${websites.map(w => `
          <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);padding:16px;background:var(--bg-glass);display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${w.logo_url ? `<img src="${escapeHtml(w.logo_url)}" alt="Logo" style="width:40px;height:40px;object-fit:contain;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-glass);padding:2px;" />` : `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--bg-glass);border-radius:6px;border:1px solid var(--border-color);font-weight:700;color:var(--clr-gold);">${escapeHtml((w.website_name||'W').charAt(0))}</div>`}
              <div style="overflow:hidden;">
                <div style="font-weight:600;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(w.website_name||w.brand_name||'Unnamed Website')}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">${escapeHtml(w.domain||'No custom domain')}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:6px;border-top:1px solid var(--border-color);">
              <span class="badge ${statusBadge(w.website_status)}">${escapeHtml(w.website_status||'development')}</span>
              ${w.website_url ? `
                <a href="${escapeHtml(w.website_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:0.75rem;">
                  🌐 Visit ↗
                </a>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
  }
}

// ── Render: Brand ──
function renderBrand() {
  const { websites } = clientData;
  const wrap = document.getElementById('brand-content');

  if (!websites.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎨</div>
        <h3>No Brand Assigned</h3>
        <p>Your brand information will appear here once Jolardo sets up your account.</p>
        <a href="contact.html" class="btn btn-outline" style="margin-top:12px;">Contact Jolardo</a>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px;">
      ${websites.map(w => {
        const logoHtml = w.logo_url
          ? `<img src="${escapeHtml(w.logo_url)}" alt="Brand logo" />`
          : `<div class="brand-logo-placeholder">${escapeHtml((w.brand_name || w.website_name || '?').charAt(0))}</div>`;
        return `
          <div class="card">
            <div class="brand-layout">
              <div class="brand-logo-wrap">${logoHtml}</div>
              <div class="brand-details">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap;">
                  <h3 class="brand-name serif" style="margin:0;">${escapeHtml(w.brand_name || w.website_name || 'Unnamed Brand')}</h3>
                  <span class="badge ${statusBadge(w.website_status)}">${escapeHtml(w.website_status||'—')}</span>
                </div>
                ${w.domain ? `<p style="color:var(--clr-gold);font-size:0.85rem;margin-bottom:8px;">🌐 ${escapeHtml(w.domain)}</p>` : ''}
                <p class="brand-desc">${escapeHtml(w.brand_description || 'No brand description provided yet.')}</p>
                ${w.website_url ? `
                  <div style="margin-top:12px;">
                    <a href="${escapeHtml(w.website_url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Visit Website ↗</a>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>`;
}

// ── Render: Websites (Multiple) ──
function renderWebsite() {
  const { websites } = clientData;
  const wrap = document.getElementById('websites-grid');

  if (!websites.length) {
    wrap.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🌐</div>
        <h3>No Websites Assigned</h3>
        <p>You don't have any websites set up yet. Contact the Jolardo team to get started.</p>
        <a href="contact.html" class="btn btn-primary" style="margin-top:14px;">Contact Jolardo</a>
      </div>`;
    return;
  }

  wrap.innerHTML = websites.map(w => {
    return `
      <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;border:1px solid var(--border-color);transition:transform 0.2s, border-color 0.2s;">
        <div>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:12px;">
              ${w.logo_url ? `
                <img src="${escapeHtml(w.logo_url)}" alt="Logo" style="width:48px;height:48px;object-fit:contain;border-radius:var(--radius-sm);background:var(--bg-glass);padding:3px;border:1px solid var(--border-color);" />
              ` : `
                <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--bg-glass);border-radius:var(--radius-sm);border:1px solid var(--border-color);font-size:1.5rem;color:var(--clr-gold);font-weight:700;">
                  ${escapeHtml((w.website_name||'W').charAt(0))}
                </div>
              `}
              <div>
                <h3 class="serif" style="margin:0;font-size:1.1rem;">${escapeHtml(w.website_name||'Website')}</h3>
                ${w.brand_name ? `<div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(w.brand_name)}</div>` : ''}
              </div>
            </div>
            <span class="badge ${statusBadge(w.website_status)}">${escapeHtml(w.website_status||'development')}</span>
          </div>

          <div style="margin-bottom:14px;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
            ${escapeHtml(w.brand_description || 'Website project managed by Jolardo.')}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;background:var(--bg-glass);padding:10px 12px;border-radius:var(--radius-sm);margin-bottom:16px;">
            <div>
              <span style="color:var(--text-muted);display:block;font-size:0.7rem;text-transform:uppercase;">Domain</span>
              <strong>${escapeHtml(w.domain || 'Not set')}</strong>
            </div>
            <div>
              <span style="color:var(--text-muted);display:block;font-size:0.7rem;text-transform:uppercase;">Created</span>
              <strong>${formatDate(w.created_at)}</strong>
            </div>
          </div>
        </div>

        <div>
          ${w.website_url ? `
            <a href="${escapeHtml(w.website_url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="width:100%;justify-content:center;display:flex;align-items:center;gap:6px;">
              🌐 Open Website ↗
            </a>
          ` : `
            <button class="btn btn-outline btn-sm" disabled style="width:100%;opacity:0.6;">
              In Development
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// ── Render: Subscriptions (Multiple) & Billing ──
function renderSubscription() {
  const { subscriptions, payments } = clientData;
  const wrap = document.getElementById('subscriptions-list');

  if (!subscriptions.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💳</div>
        <h3>No Subscriptions Found</h3>
        <p>You don't have any subscription plans assigned yet. Contact Jolardo to activate your plan.</p>
        <a href="contact.html" class="btn btn-outline" style="margin-top:12px;">Contact Jolardo</a>
      </div>`;
    renderPaymentsTable([]);
    return;
  }

  wrap.innerHTML = subscriptions.map(sub => {
    const plan = sub.subscription_plans;
    const site = sub.websites;
    const price = sub.amount != null ? sub.amount : (plan?.price || 0);
    const curr  = sub.currency || 'EGP';
    const isPaid = sub.payment_status === 'paid';
    const invoiceRef = sub.payment_reference || `INV-${sub.id.slice(0, 8).toUpperCase()}`;

    return `
      <div class="card" style="border:1px solid ${isPaid ? 'var(--border-color)' : 'var(--clr-gold)'};background:var(--bg-card);position:relative;overflow:hidden;">
        ${!isPaid ? `<div style="position:absolute;top:0;right:0;background:var(--clr-gold);color:#000;font-size:0.7rem;font-weight:700;padding:2px 10px;border-bottom-left-radius:6px;text-transform:uppercase;letter-spacing:0.05em;">Payment Due</div>` : ''}

        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">
              <h3 class="serif" style="margin:0;font-size:1.25rem;">${escapeHtml(plan?.name || 'Custom Plan')}</h3>
              ${site ? `<span class="badge badge-info" style="font-size:0.75rem;">🌐 ${escapeHtml(site.website_name||site.domain)}</span>` : ''}
              <span class="badge ${subStatusBadge(sub.status)}">${escapeHtml(sub.status)}</span>
              <span class="badge ${paymentBadge(sub.payment_status)}">${isPaid ? '✓ Paid' : '⏳ Pending Payment'}</span>
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);">Invoice: <strong>${escapeHtml(invoiceRef)}</strong></div>
          </div>

          <div style="text-align:right;">
            <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">
              ${price} <span style="font-size:0.85rem;color:var(--clr-gold);">${escapeHtml(curr)}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${plan?.duration || 'monthly'} billing</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;background:var(--bg-glass);padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:0.85rem;">
          <div>
            <span style="color:var(--text-muted);display:block;font-size:0.7rem;text-transform:uppercase;">Start Date</span>
            <strong>${formatDate(sub.start_date)}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted);display:block;font-size:0.7rem;text-transform:uppercase;">Next Renewal</span>
            <strong>${formatDate(sub.renewal_date)}</strong>
          </div>
          ${sub.expiry_date ? `
            <div>
              <span style="color:var(--text-muted);display:block;font-size:0.7rem;text-transform:uppercase;">Expiry Date</span>
              <strong>${formatDate(sub.expiry_date)}</strong>
            </div>
          ` : ''}
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-top:12px;border-top:1px solid var(--border-color);">
          <div style="font-size:0.825rem;color:var(--text-muted);">
            ${isPaid ? '✓ Subscription active & up to date.' : '⚠️ Payment is pending. Click below to pay via InstaPay.'}
          </div>

          <div>
            ${!isPaid ? `
              <button class="btn btn-primary" onclick="openInstaPayModal('${sub.id}')" style="box-shadow:0 0 15px rgba(212,175,55,0.3);display:flex;align-items:center;gap:8px;">
                <span>📱</span> Pay with InstaPay
              </button>
            ` : `
              <button class="btn btn-outline btn-sm" onclick="openInstaPayModal('${sub.id}')" style="opacity:0.8;">
                View Bill / Receipt
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');

  renderPaymentsTable(payments);
}

// ── InstaPay Modal Logic ──
let activeModalSub = null;

window.openInstaPayModal = function(subId) {
  const sub = clientData.subscriptions.find(s => s.id === subId);
  if (!sub) return;
  activeModalSub = sub;

  const plan = sub.subscription_plans;
  const site = sub.websites;
  const price = sub.amount != null ? sub.amount : (plan?.price || 0);
  const curr  = sub.currency || 'EGP';
  const ref   = sub.payment_reference || `INV-${sub.id.slice(0, 8).toUpperCase()}`;

  const settings = clientData.instapaySettings || {};
  const ipUsername = settings.instapay_username || 'jolardo@instapay';
  const ipPhone    = settings.instapay_phone || '';
  const ipLink     = sub.instapay_link || settings.instapay_link || 'https://ipn.eg/';

  document.getElementById('ip-modal-title').textContent = sub.payment_status === 'paid' ? 'InstaPay Invoice Receipt' : 'Pay via InstaPay';
  document.getElementById('ip-bill-plan').textContent   = plan?.name || 'Custom Plan';
  document.getElementById('ip-bill-website').textContent = site ? `Website: ${site.website_name || site.domain}` : '';
  document.getElementById('ip-bill-amount').textContent  = `${price} ${curr}`;
  document.getElementById('ip-bill-ref').textContent     = ref;
  document.getElementById('ip-bill-date').textContent    = sub.renewal_date ? `Due: ${formatDate(sub.renewal_date)}` : '';
  document.getElementById('ip-inst-ref').textContent     = ref;

  // Account details
  document.getElementById('ip-account-username').textContent = ipUsername;
  const phoneRow = document.getElementById('ip-phone-row');
  if (ipPhone) {
    phoneRow.style.display = 'flex';
    document.getElementById('ip-account-phone').textContent = ipPhone;
  } else {
    phoneRow.style.display = 'none';
  }

  // Link button
  const directLinkBtn = document.getElementById('ip-direct-link');
  if (ipLink) {
    directLinkBtn.href = ipLink;
    document.getElementById('ip-link-wrapper').style.display = 'block';
  } else {
    document.getElementById('ip-link-wrapper').style.display = 'none';
  }

  // Confirm Paid button state
  const confirmBtn = document.getElementById('ip-confirm-paid-btn');
  if (sub.payment_status === 'paid') {
    confirmBtn.style.display = 'none';
  } else {
    confirmBtn.style.display = 'inline-flex';
  }

  openModal('instapay-modal');
};

function initInstaPayModalEvents() {
  const ipModal = document.getElementById('instapay-modal');
  if (ipModal) {
    ipModal.querySelectorAll('[data-modal-close], .modal-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('instapay-modal');
      });
    });
    ipModal.addEventListener('click', (e) => {
      if (e.target === ipModal) closeModal('instapay-modal');
    });
  }

  // Copy Username
  document.getElementById('ip-copy-username-btn')?.addEventListener('click', async () => {
    const user = document.getElementById('ip-account-username')?.textContent;
    if (user) {
      await navigator.clipboard.writeText(user);
      toast.success('Copied!', `InstaPay IPA "${user}" copied to clipboard.`);
    }
  });

  // Copy Phone
  document.getElementById('ip-copy-phone-btn')?.addEventListener('click', async () => {
    const phone = document.getElementById('ip-account-phone')?.textContent;
    if (phone) {
      await navigator.clipboard.writeText(phone);
      toast.success('Copied!', `Phone number "${phone}" copied to clipboard.`);
    }
  });

  // Confirm payment transferred
  document.getElementById('ip-confirm-paid-btn')?.addEventListener('click', async () => {
    if (!activeModalSub) return;
    const txRefInput = document.getElementById('ip-client-tx-ref');
    const clientRef = (txRefInput?.value || '').trim();

    const btn = document.getElementById('ip-confirm-paid-btn');
    const txt = document.getElementById('ip-confirm-text');
    const spinner = document.getElementById('ip-confirm-spinner');
    if (btn) btn.disabled = true;
    if (txt) txt.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const updatedRef = clientRef ? `${activeModalSub.payment_reference || 'INV'} [Tx: ${clientRef}]` : activeModalSub.payment_reference;
      const { error } = await supabase.from('subscriptions').update({
        payment_reference: updatedRef,
        client_notes: `Client clicked Paid on ${new Date().toLocaleString('en-US')}. Transfer note: ${clientRef || 'None'}`,
        updated_at: new Date().toISOString()
      }).eq('id', activeModalSub.id);

      if (error) throw error;

      toast.success('Notice Sent!', 'Thank you! Jolardo admin has been notified and will verify your payment shortly.');
      closeModal('instapay-modal');
      await loadClientData();
      renderSubscription();
      renderOverview();
    } catch (err) {
      toast.error('Submission failed', err.message);
    } finally {
      if (btn) btn.disabled = false;
      if (txt) txt.style.display = '';
      if (spinner) spinner.style.display = 'none';
    }
  });
}

function renderPaymentsTable(payments) {
  const wrap = document.getElementById('payments-table-wrap');
  if (!payments.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🧾</div>
        <h3>No Payments Yet</h3>
        <p>Your payment history will appear here once payments are recorded.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>
        ${payments.map(p => `
          <tr>
            <td>${formatDate(p.paid_at || p.created_at)}</td>
            <td>${formatCurrency(p.amount, p.currency || 'USD')}</td>
            <td><span class="badge ${paymentBadge(p.status)}">${escapeHtml(p.status || '—')}</span></td>
            <td style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(p.payment_reference || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Render: Account Settings ──
function renderAccount() {
  const profile = clientData.profile;
  document.getElementById('profile-name').value  = profile?.full_name || '';
  document.getElementById('profile-email').value = currentUser.email || '';

  initProfileForm();
  initPasswordForm();
  initPasswordToggle('toggle-new', 'pw-new');
  initPasswordToggle('toggle-confirm', 'pw-confirm');
}

function initProfileForm() {
  const form = document.getElementById('profile-form');
  if (form._initialized) return;
  form._initialized = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('profile-name').value.trim();
    if (!name || name.length < 2) {
      document.getElementById('profile-error').textContent = 'Please enter your full name.';
      document.getElementById('profile-error').style.display = 'block';
      return;
    }
    document.getElementById('profile-error').style.display = 'none';
    setLoading('profile', true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: name, updated_at: new Date().toISOString() })
        .eq('id', currentUser.id);
      if (error) throw error;
      clientData.profile = { ...clientData.profile, full_name: name };
      renderSidebarUser();
      toast.success('Profile Updated', 'Your name has been saved.');
    } catch (err) {
      toast.error('Update Failed', err.message);
    } finally {
      setLoading('profile', false);
    }
  });
}

function initPasswordForm() {
  const form = document.getElementById('password-form');
  if (form._initialized) return;
  form._initialized = true;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw      = document.getElementById('pw-new').value;
    const confirm = document.getElementById('pw-confirm').value;
    const errEl   = document.getElementById('pw-error');
    errEl.style.display = 'none';

    if (!pw || pw.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters.';
      errEl.style.display = 'block'; return;
    }
    if (pw !== confirm) {
      errEl.textContent = 'Passwords do not match.';
      errEl.style.display = 'block'; return;
    }
    setLoading('pw', true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success('Password Changed', 'Your password has been updated successfully.');
      form.reset();
    } catch (err) {
      errEl.textContent = err.message || 'Failed to update password.';
      errEl.style.display = 'block';
    } finally {
      setLoading('pw', false);
    }
  });
}

function initPasswordToggle(btnId, inputId) {
  const btn   = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input || btn._init) return;
  btn._init = true;
  btn.addEventListener('click', () => {
    const isText = input.type === 'text';
    input.type   = isText ? 'password' : 'text';
    btn.textContent = isText ? '👁️' : '🙈';
  });
}

function setLoading(prefix, on) {
  const btn     = document.getElementById(`${prefix}-submit`);
  const txt     = document.getElementById(`${prefix}-text`);
  const spinner = document.getElementById(`${prefix}-spinner`);
  if (!btn) return;
  btn.classList.toggle('loading', on);
  if (txt) txt.style.display = on ? 'none' : '';
  if (spinner) spinner.style.display = on ? 'inline-block' : 'none';
}

// ── Badge Helpers ──
function statusBadge(status) {
  const map = { live:'badge-success', active:'badge-success', development:'badge-info', maintenance:'badge-warning', offline:'badge-danger', suspended:'badge-danger' };
  return map[(status || '').toLowerCase()] || 'badge-muted';
}

function subStatusBadge(status) {
  const map = { active:'badge-success', pending:'badge-warning', expired:'badge-danger', cancelled:'badge-danger' };
  return map[(status || '').toLowerCase()] || 'badge-muted';
}

function paymentBadge(status) {
  const map = { paid:'badge-success', pending:'badge-warning', failed:'badge-danger', refunded:'badge-info' };
  return map[(status || '').toLowerCase()] || 'badge-muted';
}
})();
