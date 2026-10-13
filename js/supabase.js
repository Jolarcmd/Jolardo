/**
 * Jolardo - Supabase Client
 */
(function() {
  const url = window.__ENV__?.SUPABASE_URL || 'https://ascvflnrsqwyebbmucmx.supabase.co';
  const key = window.__ENV__?.SUPABASE_ANON_KEY || '';

  let client = null;
  const createClientFn = window.supabase?.createClient;
  if (typeof createClientFn === 'function') {
    try {
      client = createClientFn(url, key, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      });
    } catch (e) {
      console.warn('[Jolardo] Supabase init warning:', e);
    }
  }

  async function getSession() {
    if (!client?.auth) return null;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) return null;
      return data?.session ?? null;
    } catch (_) {
      return null;
    }
  }

  async function getUser() {
    if (!client?.auth) return null;
    try {
      const { data, error } = await client.auth.getUser();
      if (error) return null;
      return data?.user ?? null;
    } catch (_) {
      return null;
    }
  }

  async function getUserRole(userId) {
    if (!client) return 'client';
    try {
      const { data, error } = await client
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (error) return 'client';
      return data?.role ?? 'client';
    } catch (_) {
      return 'client';
    }
  }

  async function signOut() {
    if (!client?.auth) return;
    try {
      await client.auth.signOut();
    } catch (_) {}
  }

  async function requireAuth(requiredRole = null) {
    const session = await getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    if (requiredRole) {
      const role = await getUserRole(session.user.id);
      if (role !== requiredRole) {
        window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
        return null;
      }
    }
    return session;
  }

  async function getSetting(key) {
    if (!client) return null;
    try {
      const { data } = await client
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', key)
        .single();
      return data?.setting_value ?? null;
    } catch (_) {
      return null;
    }
  }

  async function getSettings(keys) {
    if (!client) return {};
    try {
      const { data } = await client
        .from('admin_settings')
        .select('setting_key, setting_value')
        .in('setting_key', keys);
      return Object.fromEntries((data || []).map(r => [r.setting_key, r.setting_value]));
    } catch (_) {
      return {};
    }
  }

  function subscribeTable(table, callback, filter = null) {
    if (!client) return null;
    try {
      const channelId = `rt-${table}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const options = { event: '*', schema: 'public', table };
      if (filter) options.filter = filter;

      const channel = client.channel(channelId)
        .on('postgres_changes', options, (payload) => {
          try { callback(payload); } catch (e) { console.warn('[Jolardo Realtime callback error]', e); }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[Jolardo Realtime] Connected to table: ${table}`);
          }
        });
      return channel;
    } catch (err) {
      console.warn(`[Jolardo Realtime] Error subscribing to ${table}:`, err);
      return null;
    }
  }

  function unsubscribe(channel) {
    if (!client || !channel) return;
    try {
      client.removeChannel(channel);
    } catch (_) {}
  }

  function onAuthStateChange(callback) {
    if (!client?.auth) return { data: { subscription: { unsubscribe: () => {} } } };
    return client.auth.onAuthStateChange(callback);
  }

  window.JolardoAuth = {
    client,
    supabase: client,
    getSession,
    getUser,
    getUserRole,
    signOut,
    requireAuth,
    getSetting,
    getSettings,
    subscribeTable,
    unsubscribe,
    onAuthStateChange,
  };
})();
