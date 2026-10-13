-- =====================================================
-- Jolardo Website — Complete Database Migration
-- PostgreSQL via Supabase
-- Run this in your Supabase SQL Editor
-- =====================================================

-- ─────────────────────────────────────────────────────
-- SECTION 1: Extensions
-- ─────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────
-- SECTION 2: TABLES
-- ─────────────────────────────────────────────────────

-- 2.1 profiles
-- Extends Supabase auth.users. One row per authenticated user.
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client', 'editor', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 subscription_plans
-- Reusable plan templates.
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    price       NUMERIC(12, 2),
    currency    TEXT NOT NULL DEFAULT 'USD',
    duration    TEXT,                        -- e.g. 'monthly', 'yearly', '6 months'
    features    JSONB,                       -- array of feature strings
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3 websites
-- One website record per client project.
CREATE TABLE IF NOT EXISTS public.websites (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    website_name      TEXT,
    brand_name        TEXT,
    brand_description TEXT,
    logo_url          TEXT,
    website_url       TEXT,
    domain            TEXT,
    website_status    TEXT NOT NULL DEFAULT 'development'
                      CHECK (website_status IN ('development','live','maintenance','offline','suspended')),
    admin_notes       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4 subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    website_id         UUID REFERENCES public.websites(id) ON DELETE SET NULL,
    plan_id            UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    amount             NUMERIC(12, 2),
    currency           TEXT NOT NULL DEFAULT 'EGP',
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('active','pending','expired','cancelled')),
    start_date         DATE,
    renewal_date       DATE,
    expiry_date        DATE,
    payment_status     TEXT NOT NULL DEFAULT 'pending'
                       CHECK (payment_status IN ('paid','pending','failed','refunded')),
    payment_reference  TEXT,
    instapay_link      TEXT,
    client_notes       TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations in case table already existed
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EGP';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS instapay_link TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS client_notes TEXT;

-- 2.5 payments
CREATE TABLE IF NOT EXISTS public.payments (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id    UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    amount             NUMERIC(12, 2) NOT NULL,
    currency           TEXT NOT NULL DEFAULT 'USD',
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('paid','pending','failed','refunded')),
    payment_reference  TEXT,
    paid_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.6 contact_messages
CREATE TABLE IF NOT EXISTS public.contact_messages (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    subject     TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'unread'
                CHECK (status IN ('unread','read','archived','deleted')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 admin_settings
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key   TEXT NOT NULL UNIQUE,
    setting_value TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- SECTION 3: INDEXES
-- ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_role         ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email        ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_websites_client_id    ON public.websites(client_id);
CREATE INDEX IF NOT EXISTS idx_websites_status       ON public.websites(website_status);
CREATE INDEX IF NOT EXISTS idx_subs_client_id        ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subs_website_id       ON public.subscriptions(website_id);
CREATE INDEX IF NOT EXISTS idx_subs_status           ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payments_sub_id       ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_messages_status       ON public.contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at   ON public.contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_key          ON public.admin_settings(setting_key);

-- ─────────────────────────────────────────────────────
-- SECTION 4: FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────────────────

-- 4.1 Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['profiles','websites','subscriptions','admin_settings']
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_updated_at ON public.%I;
             CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();',
            tbl, tbl
        );
    END LOOP;
END;
$$;

-- 4.2 Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'client'           -- NEW users are always 'client'; role can only be changed server-side
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_user ON auth.users;
CREATE TRIGGER trg_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.3 Prevent users from elevating their own role via the profiles table
CREATE OR REPLACE FUNCTION public.prevent_role_elevation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Allow direct SQL editor / Supabase Dashboard updates where auth.uid() is null
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Allow service_role key
    IF coalesce(current_setting('request.jwt.claims', TRUE)::json->>'role', '') = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- If called by an authenticated user, prevent elevating role unless already admin
    IF NEW.role <> OLD.role THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Insufficient permissions to change role';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_elevation ON public.profiles;
CREATE TRIGGER trg_prevent_role_elevation
    BEFORE UPDATE OF role ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_role_elevation();

-- ─────────────────────────────────────────────────────
-- SECTION 5: VIEWS
-- ─────────────────────────────────────────────────────

-- Admin-readable dashboard statistics view
CREATE OR REPLACE VIEW public.admin_stats AS
SELECT
    (SELECT COUNT(*) FROM public.profiles WHERE role = 'client')         AS total_clients,
    (SELECT COUNT(*) FROM public.websites)                               AS total_websites,
    (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'active')  AS active_subscriptions,
    (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'expired') AS expired_subscriptions,
    (SELECT COUNT(*) FROM public.subscriptions WHERE payment_status = 'pending') AS pending_payments,
    (SELECT COUNT(*) FROM public.contact_messages WHERE status = 'unread') AS unread_messages;

-- ─────────────────────────────────────────────────────
-- SECTION 6: ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────

-- 6.1 Enable RLS on all public tables
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.websites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- ─── Helper: is_admin() ───
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- ─── profiles ───
DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

CREATE POLICY "profiles_select_own"
    ON public.profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "profiles_select_admin"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "profiles_update_admin"
    ON public.profiles FOR UPDATE
    USING (public.is_admin());

-- ─── websites ───
DROP POLICY IF EXISTS "websites_select_own"   ON public.websites;
DROP POLICY IF EXISTS "websites_select_admin" ON public.websites;
DROP POLICY IF EXISTS "websites_all_admin"    ON public.websites;

CREATE POLICY "websites_select_own"
    ON public.websites FOR SELECT
    USING (client_id = auth.uid());

CREATE POLICY "websites_select_admin"
    ON public.websites FOR SELECT
    USING (public.is_admin());

CREATE POLICY "websites_all_admin"
    ON public.websites FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ─── subscriptions ───
DROP POLICY IF EXISTS "subs_select_own"   ON public.subscriptions;
DROP POLICY IF EXISTS "subs_select_admin" ON public.subscriptions;
DROP POLICY IF EXISTS "subs_all_admin"    ON public.subscriptions;

CREATE POLICY "subs_select_own"
    ON public.subscriptions FOR SELECT
    USING (client_id = auth.uid());

CREATE POLICY "subs_all_admin"
    ON public.subscriptions FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ─── payments ───
DROP POLICY IF EXISTS "payments_select_own"   ON public.payments;
DROP POLICY IF EXISTS "payments_all_admin"    ON public.payments;

CREATE POLICY "payments_select_own"
    ON public.payments FOR SELECT
    USING (
        subscription_id IN (
            SELECT id FROM public.subscriptions WHERE client_id = auth.uid()
        )
    );

CREATE POLICY "payments_all_admin"
    ON public.payments FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ─── contact_messages ───
-- Anyone (including anonymous) can INSERT (submit a contact form).
-- Only admins can SELECT, UPDATE, DELETE.
DROP POLICY IF EXISTS "messages_insert_anon"  ON public.contact_messages;
DROP POLICY IF EXISTS "messages_all_admin"    ON public.contact_messages;

CREATE POLICY "messages_insert_anon"
    ON public.contact_messages FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "messages_all_admin"
    ON public.contact_messages FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ─── admin_settings ───
-- Everyone can SELECT settings (for contact info on the public site).
-- Only admins can write.
DROP POLICY IF EXISTS "settings_select_all"  ON public.admin_settings;
DROP POLICY IF EXISTS "settings_write_admin" ON public.admin_settings;

CREATE POLICY "settings_select_all"
    ON public.admin_settings FOR SELECT
    USING (TRUE);

CREATE POLICY "settings_write_admin"
    ON public.admin_settings FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ─── subscription_plans ───
DROP POLICY IF EXISTS "plans_select_all"  ON public.subscription_plans;
DROP POLICY IF EXISTS "plans_all_admin"   ON public.subscription_plans;

CREATE POLICY "plans_select_all"
    ON public.subscription_plans FOR SELECT
    USING (TRUE);

CREATE POLICY "plans_all_admin"
    ON public.subscription_plans FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────
-- SECTION 7: STORAGE BUCKETS
-- (Run these manually in the Supabase Storage UI or via the API)
-- ─────────────────────────────────────────────────────

-- Bucket: logos
-- Bucket: websites (client website screenshots / assets)
-- Bucket: uploads  (general uploads)
-- All buckets: authenticated admins can upload; public can read logos

-- Example SQL for buckets (Supabase handles this via the Storage UI):
/*
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('logos',    'logos',    TRUE),
    ('websites', 'websites', FALSE),
    ('uploads',  'uploads',  FALSE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (logos bucket — public read)
CREATE POLICY "logos_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "logos_admin_write" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'logos' AND public.is_admin());
*/

-- ─────────────────────────────────────────────────────
-- SECTION 8: SEED DATA
-- ─────────────────────────────────────────────────────

-- 8.1 Default admin settings
INSERT INTO public.admin_settings (setting_key, setting_value)
VALUES
    ('contact_phone',         ''),
    ('whatsapp_number',       ''),
    ('contact_email',         ''),
    ('site_name',             'Jolardo'),
    ('site_tagline',          'Premium Web Development'),
    ('instapay_username',     'jolardo@instapay'),
    ('instapay_link',         'https://ipn.eg/'),
    ('instapay_phone',        ''),
    ('instapay_instructions', 'Please transfer via InstaPay to our username or phone with your Invoice / Reference code as the transfer note.')
ON CONFLICT (setting_key) DO NOTHING;

-- 8.2 Default subscription plans
INSERT INTO public.subscription_plans (name, description, price, currency, duration, features, is_active)
VALUES
    ('Starter',  'Perfect for small businesses.',    299.00, 'USD', 'monthly', '["Custom Design","5 Pages","Responsive","SEO Basics","1 Month Support"]', TRUE),
    ('Standard', 'Great for growing businesses.',    599.00, 'USD', 'monthly', '["Custom Design","Up to 15 Pages","Responsive","Full SEO","3 Months Support","CMS"]', TRUE),
    ('Premium',  'For established brands.',         1199.00, 'USD', 'monthly', '["Custom Design","Unlimited Pages","Responsive","Advanced SEO","12 Months Support","CMS","Analytics","Priority Support"]', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────
-- SECTION 9: GRANT ADMIN ROLE
-- Replace the UUID below with your admin user ID from auth.users
-- ─────────────────────────────────────────────────────

-- IMPORTANT: Run this AFTER signing up as admin via the website.
-- Find your user ID in Supabase Dashboard > Authentication > Users
-- Then run:
--
--   UPDATE public.profiles SET role = 'admin' WHERE id = 'YOUR-ADMIN-UUID-HERE';
--
-- This must be done using the Supabase service role key or directly in the SQL editor.
-- NEVER allow the frontend to set role = 'admin'.

-- ─────────────────────────────────────────────────────
-- SECTION 10: REALTIME CONFIGURATION
-- ─────────────────────────────────────────────────────

-- Full replica identity for complete row payload on UPDATE and DELETE
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.subscription_plans REPLICA IDENTITY FULL;
ALTER TABLE public.websites REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.contact_messages REPLICA IDENTITY FULL;
ALTER TABLE public.admin_settings REPLICA IDENTITY FULL;

-- Add all tables to supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'subscription_plans') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_plans;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'websites') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.websites;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'subscriptions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payments') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contact_messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_settings') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_settings;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────
-- END OF MIGRATION
-- ─────────────────────────────────────────────────────
