/* eslint-disable @next/next/no-img-element */
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
// Recharts imported by sub-components (OverviewTab, AnalyticsTab)
import { Badge } from '@/components/ui/Badge';
import DashboardTutorial from '@/components/DashboardTutorial';
import PlanSelection from '@/components/PlanSelection';
import LoyaltyTab from '@/components/LoyaltyTab';
import OverviewTab, { RETURN_GRACE_DAYS, DEFAULT_GRACE_DAYS } from '@/components/OverviewTab';
import AnalyticsTab from '@/components/AnalyticsTab';
import MobileBottomNav from '@/components/MobileBottomNav';
import MobileHeader from '@/components/MobileHeader';
import CustomerDetailModal from '@/components/CustomerDetailModal';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';

/* ─── Design System tokens (CSS vars for inline styles / Recharts) ─ */
const DS = {
  primary: 'var(--color-primary-600)',
  purple:  'var(--color-purple-600)',
  success: 'var(--color-success-600)',
  warning: 'var(--color-warning-600)',
  danger:  'var(--color-danger-600)',
  gray100: 'var(--color-gray-100)',
  gray200: 'var(--color-gray-200)',
  gray400: 'var(--color-gray-400)',
} as const;

/* ─── Types ──────────────────────────────────────────────── */
interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  total_points: number;
  total_visits: number;
  birth_date: string | null;
  last_visit_at: string | null;
  created_at: string;
  restaurant_id: string;
  stamps_count: number;
  completed_cards: number;
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  logo_url: string | null;
  business_type: string | null;
  plan: string;
  plan_id: string | null;
  plans: { name: string; key: string } | null;
  subscription_status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  tutorial_completed_at: string | null;
}

interface Transaction {
  id: string;
  created_at: string;
  points_delta: number;
  type: string;
  customer_id: string;
}

interface LoyaltySettings {
  points_per_scan: number;
  reward_threshold: number;
  reward_message: string;
  program_type: 'points' | 'stamps';
  stamps_total: number;
  mode_changed_at: string | null;
  previous_program_type: string | null;
  vip_threshold_points: number;
  vip_threshold_stamps: number;
  return_grace_days: number | null;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  recipients_count: number;
  status: string;
  sent_at: string | null;
  scheduled_at: string | null;
}

type Tab = 'overview' | 'clients' | 'loyalty' | 'campaigns' | 'analytics' | 'settings';

interface GrowthTrigger {
  key:            string;
  type:           'upgrade' | 'risk' | 'opportunity';
  severity:       'low' | 'medium' | 'high';
  title:          string;
  message:        string;
  suggested_plan?: string;
}

interface RestaurantMetrics {
  // Tier 0 — free+
  total_customers:       number;
  visits_30d:            number;
  last_computed_at:      string;
  // Tier 1 — growth+ (analytics feature)
  new_customers_30d?:    number;
  active_customers_30d?: number;
  repeat_rate?:          number;
  wallet_passes_issued?: number;
  wallet_active_passes?: number;
  // Tier 2 — pro+
  completed_cards?:       number;
  estimated_revenue_30d?: number | null;
}

const BUSINESS_TYPE_EMOJI: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  salon_beaute: '💅',
  salon_coiffure: '💇',
  boutique: '🛍️',
};

/* Business types that can use the Booking module */
const BOOKING_ELIGIBLE_TYPES = new Set([
  'salon_coiffure',
  'salon_beaute',
  'barbershop',
  'spa',
  'bien_etre',
]);

/* ─── Helpers ────────────────────────────────────────────── */
function getCustomerStatus(
  c: Customer,
  programType: 'points' | 'stamps',
  vipThreshold: number
): 'vip' | 'active' | 'inactive' {
  const inactiveDays = 30;
  const lastVisit = c.last_visit_at ? new Date(c.last_visit_at) : null;
  if (!lastVisit || (Date.now() - lastVisit.getTime()) > inactiveDays * 86400000) return 'inactive';

  if (programType === 'stamps') {
    if ((c.stamps_count ?? 0) >= vipThreshold) return 'vip';
  } else {
    if (c.total_points >= vipThreshold) return 'vip';
  }
  return 'active';
}

function StatusBadge({ status, t }: { status: 'vip' | 'active' | 'inactive'; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (status === 'vip')      return <Badge variant="vip">{t('clients.statusVip')}</Badge>;
  if (status === 'active')   return <Badge variant="success">{t('clients.statusActive')}</Badge>;
  return <Badge variant="neutral">{t('clients.statusInactive')}</Badge>;
}

/* ─── Inline SVG icons (zero deps) ──────────────────────── */
const IGrid    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
const IUsers   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IGift    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>;
const IMail    = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 19-9-9 19-2-8-8-2z"/></svg>;
const IChart   = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>;
const ISettings= () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const ICamera  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const ILogOut  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const ISearch  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const IChevL   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>;
const IChevR   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>;
const IWallet  = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>;
const ICalendar= () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>;

/* ─── Constants ──────────────────────────────────────────── */
const NOW   = Date.now();
const TODAY = new Date();

/* ═══════════════════════════════════════════════════════════
   DASHBOARD PAGE
═══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { t, locale } = useTranslation();
  const router = useLocaleRouter();

  /* State */
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [restaurant, setRestaurant]     = useState<Restaurant | null>(null);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState('all');
  const [clientsPage, setClientsPage]   = useState(1);
  const CLIENTS_PER_PAGE = 50;
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [session, setSession]           = useState<Session | null>(null);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    points_per_scan: 1,
    reward_threshold: 100,
    reward_message: t('dashboard.defaultRewardMessage'),
    program_type: 'points',
    stamps_total: 10,
    mode_changed_at: null,
    previous_program_type: null,
    vip_threshold_points: 100,
    vip_threshold_stamps: 10,
    return_grace_days: null,
  });
  const [savingSettings, setSavingSettings]   = useState(false);
  const [logoFile,       setLogoFile]         = useState<File | null>(null);
  const [logoPreview,    setLogoPreview]       = useState<string | null>(null);
  const [logoUploading,  setLogoUploading]     = useState(false);
  const [logoError,      setLogoError]         = useState('');
  const [logoSaved,      setLogoSaved]         = useState(false);
  const [campaignModal, setCampaignModal]     = useState(false);
  const [campaignPreview, setCampaignPreview] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [sentCampaigns, setSentCampaigns]     = useState<Campaign[]>([]);
  const [newCampaign, setNewCampaign] = useState({
    name: '', type: 'custom', subject: '', body: '', segment: 'all', scheduled_at: '',
  });
  // Wallet push campaign state
  const [walletPushModal, setWalletPushModal] = useState(false);
  const [walletPushPreview, setWalletPushPreview] = useState(false);
  const [sendingWalletPush, setSendingWalletPush] = useState(false);
  const [walletPush, setWalletPush] = useState({ name: '', message: '', segment: 'all' });
  // Impersonation state (admin demo mode)
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedId, setImpersonatedId] = useState<string | null>(null);
  const [demoPlans, setDemoPlans] = useState<{ id: string; key: string; name: string }[]>([]);
  const [restaurantSettings, setRestaurantSettings] = useState<Record<string, string>>({});
  const [savingRestaurantSettings, setSavingRestaurantSettings] = useState(false);
  const [restaurantSettingsMsg, setRestaurantSettingsMsg] = useState('');
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const [growthTriggers, setGrowthTriggers] = useState<GrowthTrigger[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  // undefined = not yet fetched, null = fetched but no row yet (cron hasn't run)
  const [restaurantMetrics, setRestaurantMetrics] = useState<RestaurantMetrics | null | undefined>(undefined);
  // Prevents hydration mismatch caused by browser extensions injecting DOM nodes
  // between SSR and React hydration. The dashboard is auth-gated so SSR has no value.
  const [mounted, setMounted] = useState(false);
  // KPI keys enabled for this restaurant's plan (from plan_kpis via /api/restaurant-metrics — no hardcoded checks)
  const [enabledKpiKeys, setEnabledKpiKeys] = useState<string[]>([]);
  // Customer IDs that have at least one active wallet pass
  const [walletPassCustomerIds, setWalletPassCustomerIds] = useState<Set<string>>(new Set());
  // First-visit tutorial + plan selection
  const [showTutorial, setShowTutorial] = useState(false);
  const [showPlanSelection, setShowPlanSelection] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [hasTemplates, setHasTemplates] = useState(true); // assume true until checked
  const [templateBannerDismissed, setTemplateBannerDismissed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('wallet-banner-dismissed') === '1';
    return false;
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);

  /* Data load */
  useEffect(() => {
    async function load() {
      // 1. getSession reads from localStorage — instant, never invalidates tokens.
      //    refreshSession makes a network call and CAN clear localStorage on failure,
      //    so we only use it as a fallback.
      let session: Session | null = null;
      const { data: { session: cached } } = await supabase.auth.getSession();
      session = cached;

      // 2. If cached session exists, silently refresh token in background
      //    (keeps the access_token fresh without risking session loss)
      if (session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        if (refreshed) session = refreshed;
        // If refresh fails, keep using the cached session — Supabase client
        // will auto-retry on next API call
      }

      // 3. No cached session — try refreshSession as last resort
      if (!session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }

      if (!session) { router.replace('/dashboard/login'); return; }
      setSession(session);

      // ── Check for admin impersonation cookie ──────────────────────────────
      const impersonateCookie = document.cookie
        .split(';')
        .find(c => c.trim().startsWith('x-admin-impersonate='));
      const impersonateId = impersonateCookie?.split('=')[1]?.trim() || null;

      if (impersonateId) {
        // Load all data from server proxy (bypasses RLS)
        const proxyRes = await fetch('/api/admin/impersonate/dashboard-data', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (proxyRes.ok) {
          const data = await proxyRes.json();
          setIsImpersonating(true);
          setImpersonatedId(impersonateId);
          // Load available plans for the plan switcher
          fetch('/api/admin/plans', { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then(r => r.json())
            .then(d => setDemoPlans(d.plans ?? []))
            .catch(() => {});
          setRestaurant(data.restaurant as unknown as Restaurant);
          setEditName(data.restaurant.name ?? '');
          setEditSlug(data.restaurant.slug ?? '');
          setCustomers(data.customers ?? []);
          setTransactions(data.transactions ?? []);
          if (data.loyaltySettings) setLoyaltySettings(data.loyaltySettings);
          setSentCampaigns(data.campaigns ?? []);
          setRestaurantSettings(data.restaurantSettings ?? {});
          if (data.templateCount === 0) setHasTemplates(false);
          setLoading(false);
          return;
        }
        // If proxy fails, fall through to normal loading
      }

      const { data: resto } = await supabase
        .from('restaurants').select('id, name, slug, primary_color, logo_url, business_type, plan, plan_id, scanner_token, subscription_status, current_period_end, stripe_customer_id, tutorial_completed_at, plans(name, key)')
        .eq('owner_id', session.user.id).eq('is_demo', false).maybeSingle();
      if (!resto) { router.replace('/onboarding'); return; }

      // Gate: require active subscription
      // After Stripe checkout, the webhook may not have fired yet — poll for up to 10s
      const isBillingReturn = new URLSearchParams(window.location.search).has('billing');
      if (resto.subscription_status !== 'active') {
        if (isBillingReturn) {
          let attempts = 0;
          while (attempts < 10) {
            await new Promise(r => setTimeout(r, 1000));
            const { data: fresh } = await supabase
              .from('restaurants')
              .select('subscription_status')
              .eq('id', resto.id)
              .maybeSingle();
            if (fresh?.subscription_status === 'active') {
              resto.subscription_status = 'active';
              break;
            }
            attempts++;
          }
        }
        if (resto.subscription_status !== 'active') {
          router.replace('/choose-plan');
          return;
        }
      }
      setRestaurant(resto as unknown as Restaurant);
      setEditName(resto.name ?? '');
      setEditSlug(resto.slug ?? '');

      const { data: clients } = await supabase
        .from('customers').select('*')
        .eq('restaurant_id', resto.id)
        .order('created_at', { ascending: false });
      setCustomers(clients ?? []);

      const { data: txs } = await supabase
        .from('transactions').select('*')
        .eq('restaurant_id', resto.id)
        .order('created_at', { ascending: false })
        .limit(500);
      setTransactions(txs ?? []);

      const { data: ls, error: lsError } = await supabase
        .from('loyalty_settings').select('*')
        .eq('restaurant_id', resto.id).maybeSingle();
      if (lsError) {
        console.warn('loyalty_settings fetch failed:', lsError.message);
      } else if (ls) {
        setLoyaltySettings(ls);
      }

      const { data: camps } = await supabase
        .from('campaigns').select('*')
        .eq('restaurant_id', resto.id)
        .order('created_at', { ascending: false });
      setSentCampaigns(camps ?? []);

      // Load restaurant settings (average_ticket etc.)
      if (session) {
        const settingsRes = await fetch('/api/restaurant-settings', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (settingsRes.ok) {
          const { settings } = await settingsRes.json();
          setRestaurantSettings(settings ?? {});
        }
      }

      // Check if restaurant has any wallet templates
      const { count: templateCount } = await supabase
        .from('wallet_pass_templates')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', resto.id);
      if (templateCount === 0) setHasTemplates(false);

      setLoading(false);

      // Auto-launch tutorial if never completed
      if (!resto.tutorial_completed_at) {
        // Clean billing param from URL if present
        const params = new URLSearchParams(window.location.search);
        if (params.has('billing')) {
          window.history.replaceState({}, '', `/${locale}/dashboard`);
        }
        setShowTutorial(true);
      }
    }
    load();
  }, [router, locale]);

  /* Load pre-computed KPI metrics + enabled KPI keys (DB-driven, no hardcoded plan checks) */
  useEffect(() => {
    if (!session || !restaurant) return;
    fetch('/api/restaurant-metrics', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setRestaurantMetrics(json.metrics ?? null);
        setEnabledKpiKeys(json.enabledKpiKeys ?? []);
      })
      .catch(() => setRestaurantMetrics(null));
  }, [session, restaurant]);

  /* Load growth triggers once restaurant + session are available */
  useEffect(() => {
    if (!session || !restaurant) return;
    setTriggersLoading(true);
    fetch('/api/growth/triggers', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const { triggers } = await res.json();
        setGrowthTriggers(triggers ?? []);
      })
      .catch(() => {/* non-blocking */})
      .finally(() => setTriggersLoading(false));
  }, [session, restaurant]);

  /* Load wallet pass customer IDs when the wallet_pass_rate KPI is enabled for this plan */
  useEffect(() => {
    if (!session || !enabledKpiKeys.includes('wallet_pass_rate')) return;
    fetch('/api/restaurant-wallet/active-customers', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const { customerIds } = await res.json();
        setWalletPassCustomerIds(new Set(customerIds ?? []));
      })
      .catch(() => {/* non-blocking */});
  }, [session, enabledKpiKeys]);

  /* Refresh customers on window focus — scanner runs on a separate page/tab,
     so when the owner switches back the client list would otherwise show stale
     stamps_count / total_points values. */
  useEffect(() => {
    if (!restaurant) return;
    const onFocus = async () => {
      const [{ data: clients }, { data: txs }] = await Promise.all([
        supabase.from('customers').select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false }),
        supabase.from('transactions').select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);
      if (clients) setCustomers(clients);
      if (txs) setTransactions(txs);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [restaurant]);

  /* Computed values */
  const now   = NOW;
  const day30 = 30 * 86400000;
  const day45 = 45 * 86400000;
  const today = TODAY;

  const totalCustomers   = customers.length;
  const newThisMonth     = customers.filter(c => {
    const d = new Date(c.created_at);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;
  const activeCustomers  = customers.filter(c => c.last_visit_at && (now - new Date(c.last_visit_at).getTime()) < day30).length;
  const inactiveCustomers= customers.filter(c => !c.last_visit_at || (now - new Date(c.last_visit_at).getTime()) > day45).length;
  const returnRate       = totalCustomers > 0 ? Math.round((customers.filter(c => c.total_visits > 1).length / totalCustomers) * 100) : 0;

  const isPaidPlan = (restaurant?.plan ?? 'starter') !== 'starter';

  const inactives45  = customers.filter(c => !c.last_visit_at || (now - new Date(c.last_visit_at).getTime()) > day45);
  const in7days      = new Date(); in7days.setDate(today.getDate() + 7);
  const birthdaysSoon = customers.filter(c => {
    if (!c.birth_date) return false;
    const b = new Date(c.birth_date);
    const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
    return next >= today && next <= in7days;
  });
  const nearReward   = customers.filter(c =>
    c.total_points >= (loyaltySettings.reward_threshold * 0.8) &&
    c.total_points < loyaltySettings.reward_threshold
  );

  const filteredCustomers = customers.filter(c => {
    const matchSearch = search === '' || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(search.toLowerCase());
    const vipThreshold = loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points;
    const status      = getCustomerStatus(c, loyaltySettings.program_type, vipThreshold);
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'inactive' ? status === 'inactive' :
      filter === 'vip'      ? status === 'vip' :
      filter === 'birthday' ? (() => { if (!c.birth_date) return false; const b = new Date(c.birth_date); return b.getMonth() === today.getMonth(); })() :
      filter === 'new'      ? new Date(c.created_at) >= new Date(today.getFullYear(), today.getMonth(), 1) : true;
    return matchSearch && matchFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / CLIENTS_PER_PAGE));
  const paginatedCustomers = filteredCustomers.slice(
    (clientsPage - 1) * CLIENTS_PER_PAGE,
    clientsPage * CLIENTS_PER_PAGE,
  );

  /* Handlers */
  async function addPoint(customerId: string, delta: number) {
    const key = `add-${customerId}-${delta}`;
    if (busyAction === key) return;
    const customer = customers.find(c => c.id === customerId);
    if (!customer || !restaurant) return;
    if (delta < 0) {
      const confirmed = window.confirm(t('dashboard.confirmRemovePoints', { delta: Math.abs(delta), firstName: customer.first_name, lastName: customer.last_name }));
      if (!confirmed) return;
    }
    setBusyAction(key);
    const { data: newTx } = await supabase.from('transactions').insert({
      customer_id: customerId, restaurant_id: restaurant.id,
      type: 'manual', points_delta: delta,
      balance_after: customer.total_points + delta,
      metadata: { reason: t('dashboard.manualAddLabel') },
    }).select('*').single();
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, total_points: Math.max(0, c.total_points + delta) } : c));
    if (newTx) setTransactions(prev => [newTx, ...prev].slice(0, 500));
    toast.success(delta > 0 ? t('dashboard.toastPointsAdded', { delta }) : t('dashboard.toastPointsRemoved', { delta }));

    // Fire-and-forget: trigger Apple Wallet push notification for updated pass
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!s) return;
      fetch('/api/wallet/push-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ customer_id: customerId }),
      }).catch(() => { toast.error(t('dashboard.toastWalletPushFailed')); });
    });
    setBusyAction(null);
  }

  function copyWalletUrl(customerId: string) {
    const url = `${window.location.origin}/api/wallet/${customerId}`;
    navigator.clipboard?.writeText?.(url);
    toast.success(t('dashboard.toastLinkCopied'));
  }

  async function deleteCustomer(customerId: string) {
    if (busyAction === `del-${customerId}`) return;
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    const confirmed = window.confirm(
      t('dashboard.confirmDeleteCustomer', { firstName: customer.first_name, lastName: customer.last_name })
    );
    if (!confirmed) return;
    setBusyAction(`del-${customerId}`);
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) { setBusyAction(null); return; }
    const res = await fetch(`/api/customers/${customerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    if (res.ok) {
      setCustomers(prev => prev.filter(c => c.id !== customerId));
      toast.success(t('dashboard.toastCustomerDeleted'));
    } else {
      const data = await res.json();
      toast.error(data.error || t('dashboard.toastDeleteError'));
    }
    setBusyAction(null);
  }

  async function saveLoyaltySettings() {
    if (!restaurant) return;
    setSavingSettings(true);
    const { error } = await supabase.from('loyalty_settings').upsert({
      restaurant_id: restaurant.id,
      points_per_scan: loyaltySettings.points_per_scan,
      reward_threshold: loyaltySettings.reward_threshold,
      reward_message: loyaltySettings.reward_message,
      program_type: loyaltySettings.program_type,
      stamps_total: loyaltySettings.stamps_total,
      mode_changed_at: loyaltySettings.mode_changed_at,
      previous_program_type: loyaltySettings.previous_program_type,
      vip_threshold_points: loyaltySettings.vip_threshold_points,
      vip_threshold_stamps: loyaltySettings.vip_threshold_stamps,
    }, { onConflict: 'restaurant_id' });
    setSavingSettings(false);
    if (error) {
      toast.error(t('dashboard.toastSaveError'));
      return;
    }
    toast.success(t('dashboard.toastLoyaltySaved'));
  }

  async function uploadLogo() {
    if (!logoFile || !session || !restaurant) return;
    setLogoUploading(true);
    setLogoError('');
    setLogoSaved(false);

    const fd = new FormData();
    fd.append('file', logoFile);

    const res  = await fetch('/api/upload-logo', {
      method:  'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body:    fd,
    });
    const json = await res.json();

    if (!res.ok) {
      setLogoError(json.error ?? t('settings.logoUploadError'));
      setLogoUploading(false);
      return;
    }

    // Persist the URL to the restaurants row
    await supabase
      .from('restaurants')
      .update({ logo_url: json.url })
      .eq('id', restaurant.id);

    setRestaurant(prev => prev ? { ...prev, logo_url: json.url } : prev);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoUploading(false);
    setLogoSaved(true);
    setTimeout(() => setLogoSaved(false), 3000);
    toast.success(t('dashboard.toastLogoUpdated'));
  }

  function getSegmentCount(segment: string): number {
    switch (segment) {
      case 'inactive_45':  return inactives45.length;
      case 'birthday':     return birthdaysSoon.length;
      case 'near_reward':  return nearReward.length;
      case 'active':       return activeCustomers;
      case 'vip':          { const vt = loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points; return customers.filter(c => getCustomerStatus(c, loyaltySettings.program_type, vt) === 'vip').length; }
      default:             return totalCustomers;
    }
  }

  async function sendCampaign() {
    if (!session) return;
    setSendingCampaign(true);
    try {
      const res  = await fetch('/api/compaigns', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCampaign, bodyText: newCampaign.body }),
      });
      const data = await res.json();
      if (data.success) {
        setCampaignModal(false);
        setCampaignPreview(false);
        const newEntry: Campaign = {
          id: data.campaign_id,
          name: newCampaign.name,
          type: newCampaign.type,
          recipients_count: data.sent ?? data.recipients,
          status: data.scheduled ? 'scheduled' : 'sent',
          sent_at: data.scheduled ? null : new Date().toISOString(),
          scheduled_at: newCampaign.scheduled_at || null,
        };
        setSentCampaigns(prev => [newEntry, ...prev]);
        toast.success(data.scheduled ? t('dashboard.toastCampaignScheduled') : t('dashboard.toastCampaignSent', { count: data.sent }));
      } else {
        toast.error(t('dashboard.toastCampaignError', { error: data.error ?? 'Inconnu' }));
      }
    } catch {
      toast.error(t('dashboard.toastNetworkError'));
    }
    setSendingCampaign(false);
  }

  async function sendWalletPush() {
    if (!session) return;
    setSendingWalletPush(true);
    try {
      const res = await fetch('/api/compaigns/wallet-push', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(walletPush),
      });
      const data = await res.json();
      if (data.success) {
        setWalletPushModal(false);
        setWalletPushPreview(false);
        const newEntry: Campaign = {
          id: data.campaign_id ?? crypto.randomUUID(),
          name: walletPush.name,
          type: 'wallet_push',
          recipients_count: data.pushed ?? data.passes,
          status: 'sent',
          sent_at: new Date().toISOString(),
          scheduled_at: null,
        };
        setSentCampaigns(prev => [newEntry, ...prev]);
        toast.success(t('dashboard.toastCampaignSent', { count: data.pushed }));
      } else {
        toast.error(t('dashboard.toastCampaignError', { error: data.error ?? 'Inconnu' }));
      }
    } catch {
      toast.error(t('dashboard.toastNetworkError'));
    }
    setSendingWalletPush(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/dashboard/login');
  }

  // Set mounted on first client render — must come after all other hooks
  useEffect(() => { setMounted(true); }, []);

  /* ─── SSR guard — returns null on server, client takes over immediately ─ */
  if (!mounted) return null;

  /* ─── Loading screen ──────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar skeleton (desktop) */}
      <aside className="hidden lg:flex flex-col w-[240px] border-r border-gray-100 bg-white p-4 gap-3">
        <div className="h-8 w-28 bg-gray-100 rounded-lg animate-pulse mb-4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 bg-gray-50 rounded-xl animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </aside>
      {/* Main content skeleton */}
      <div className="flex-1 p-4 sm:p-6 space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-2">
          <div className="h-7 w-48 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-9 bg-gray-100 rounded-full animate-pulse" />
        </div>
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
              <div className="h-7 w-16 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="h-5 w-32 bg-gray-100 rounded animate-pulse mb-2" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 items-center" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="h-9 w-9 bg-gray-50 rounded-full animate-pulse" />
              <div className="flex-1 h-4 bg-gray-50 rounded animate-pulse" />
              <div className="h-4 w-16 bg-gray-50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /* ─── Nav items ───────────────────────────────────────── */
  const navItems: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'overview',  icon: <IGrid />,     label: t('nav.overview') },
    { id: 'clients',   icon: <IUsers />,    label: t('nav.clients') },
    { id: 'loyalty',   icon: <IGift />,     label: t('nav.loyalty') },
    { id: 'campaigns', icon: <IMail />,     label: t('nav.campaigns') },
    { id: 'analytics', icon: <IChart />,    label: t('nav.analytics') },
    { id: 'settings',  icon: <ISettings />, label: t('nav.settings') },
  ];

  /* ─── Campaign templates ──────────────────────────────── */
  const campaignTemplates = [
    { type: 'reengagement', name: t('campaigns.tplReengagementName'),   segment: 'inactive_45', icon: '😴', colorClass: 'bg-warning-100 text-warning-700', count: inactives45.length,    subject: t('campaigns.tplReengagementSubject'),              body: t('campaigns.tplReengagementBody') },
    { type: 'birthday',     name: t('campaigns.tplBirthdayName'),        segment: 'birthday',    icon: '🎂', colorClass: 'bg-pink-50 text-pink-700',           count: birthdaysSoon.length,  subject: t('campaigns.tplBirthdaySubject'),          body: t('campaigns.tplBirthdayBody') },
    { type: 'near_reward',  name: t('campaigns.tplNearRewardName'),        segment: 'near_reward', icon: '🏆', colorClass: 'bg-success-50 text-success-700',     count: nearReward.length,     subject: t('campaigns.tplNearRewardSubject'),         body: t('campaigns.tplNearRewardBody') },
    { type: 'double_points',name: t('campaigns.tplDoublePointsName'),            segment: 'all',         icon: '⚡', colorClass: 'bg-primary-50 text-primary-700',    count: totalCustomers,        subject: t('campaigns.tplDoublePointsSubject'), body: t('campaigns.tplDoublePointsBody') },
    { type: 'promo',        name: t('campaigns.tplPromoName'),           segment: 'all',         icon: '🎁', colorClass: 'bg-vip-50 text-vip-600',            count: totalCustomers,        subject: t('campaigns.tplPromoSubject'),body: t('campaigns.tplPromoBody') },
    { type: 'custom',       name: t('campaigns.tplCustomName'),            segment: 'all',         icon: '✏️', colorClass: 'bg-gray-100 text-gray-600',         count: totalCustomers,        subject: '', body: '' },
  ];

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div className={`flex min-h-screen bg-surface no-overscroll ${isImpersonating ? 'pt-[44px]' : ''}`}>

      {/* ── IMPERSONATION BANNER (admin demo mode) ───── */}
      {isImpersonating && restaurant && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3" style={{ minHeight: 44 }}>
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </span>
            <span className="font-semibold text-amber-900">{t('demo.bannerLabel')}</span>
            <span className="text-amber-700">{restaurant.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-medium">{restaurant.plan}</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={restaurant.plan_id ?? ''}
              onChange={async (e) => {
                if (!session || !impersonatedId) return;
                const planId = e.target.value;
                if (!planId) return;
                const res = await fetch(`/api/admin/restaurants/${impersonatedId}`, {
                  method: 'PATCH',
                  headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ plan_id: planId }),
                });
                if (!res.ok) { toast.error(t('demo.planSwitchError')); return; }
                toast.success(t('demo.planSwitchSuccess'));
                window.location.reload();
              }}
              className="text-xs bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-amber-900"
            >
              {demoPlans.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
              ))}
            </select>
            <button
              onClick={async () => {
                await fetch('/api/admin/impersonate', { method: 'DELETE', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } });
                window.location.href = `/${locale}/admin`;
              }}
              className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-700 transition-colors"
            >
              {t('demo.exitBtn')}
            </button>
          </div>
        </div>
      )}

      {/* ── TUTORIAL (first visit) ───────────────────── */}
      {showTutorial && (
        <DashboardTutorial
          onComplete={async () => {
            setShowTutorial(false);
            setActiveTab('overview');
            // Mark tutorial as completed in DB
            if (restaurant) {
              await supabase
                .from('restaurants')
                .update({ tutorial_completed_at: new Date().toISOString() })
                .eq('id', restaurant.id);
            }
          }}
          onTabChange={(tab: Tab) => setActiveTab(tab)}
        />
      )}

      {/* ── PLAN SELECTION ─────────────────────────────── */}
      {showPlanSelection && restaurant && session && (
        <PlanSelection
          restaurantId={restaurant.id}
          accessToken={session.access_token}
          onComplete={() => {
            setShowPlanSelection(false);
            if (restaurant) localStorage.setItem(`onboarding_done_${restaurant.id}`, '1');
            // Reload to reflect new plan
            window.location.reload();
          }}
        />
      )}

      {/* ── CUSTOMER DETAIL MODAL ────────────────────────── */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          transactions={transactions}
          loyaltySettings={loyaltySettings}
          locale={locale}
          t={t}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* ── SIDEBAR (hidden on mobile) ───────────────── */}
      <aside
        className={[
          'relative flex-col bg-white border-r border-gray-100 flex-shrink-0',
          'shadow-[1px_0_0_rgba(17,24,39,0.04)] sticky top-0 h-screen z-10',
          'transition-[width] duration-200 ease-in-out',
          'hidden lg:flex',
          sidebarOpen ? 'w-60' : 'w-20',
        ].join(' ')}
      >
        {/* Brand header */}
        <div className={`flex items-center gap-3 py-4 border-b border-gray-100 ${sidebarOpen ? 'px-3' : 'justify-center px-2'}`}>
          <div
            className={`rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center text-2xl shadow-sm ${sidebarOpen ? 'w-14 h-14' : 'w-12 h-12'}`}
            style={{ background: `color-mix(in srgb, ${restaurant?.primary_color ?? DS.primary} 15%, white)` }}
          >
            {restaurant?.logo_url
              ? <img src={restaurant.logo_url} alt="" className="w-full h-full object-contain" />
              : (BUSINESS_TYPE_EMOJI[restaurant?.business_type ?? ''] ?? '🏪')}
          </div>
          {sidebarOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-gray-900 truncate">{restaurant?.name}</p>
              <span className={[
                'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md',
                (restaurant?.plans?.key ?? restaurant?.plan) === 'pro'     ? 'bg-purple-100 text-purple-700' :
                (restaurant?.plans?.key ?? restaurant?.plan) === 'growth' ? 'bg-primary-100 text-primary-700' :
                                                                              'bg-gray-100 text-gray-500',
              ].join(' ')}>
                {restaurant?.plans?.name ?? restaurant?.plan ?? 'starter'}
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                data-tutorial-tab={item.id}
                onClick={() => setActiveTab(item.id)}
                aria-label={item.label}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                  !sidebarOpen && 'justify-center px-0',
                ].join(' ')}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {sidebarOpen && (
                  <span className={`text-sm whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}

          {/* Scanner */}
          <Link
            href={`/${locale}/dashboard/scanner`}
            aria-label={t('nav.scannerQr')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all mt-1${!sidebarOpen ? ' justify-center px-0' : ''}`}
          >
            <span className="flex-shrink-0"><ICamera /></span>
            {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{t('nav.scannerQr')}</span>}
          </Link>

          {/* Wallet Studio — visible when wallet_pass_rate KPI is enabled for this plan */}
          {enabledKpiKeys.includes('wallet_pass_rate') && (
            <Link
              href={`/${locale}/dashboard/wallet`}
              aria-label={t('nav.walletStudio')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all${!sidebarOpen ? ' justify-center px-0' : ''}`}
            >
              <span className="flex-shrink-0"><IWallet /></span>
              {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{t('nav.walletStudio')}</span>}
            </Link>
          )}

          {/* Billing */}
          <Link
            href={`/${locale}/dashboard/billing`}
            aria-label={t('nav.billing')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all${!sidebarOpen ? ' justify-center px-0' : ''}`}
          >
            <span className="flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </span>
            {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{t('nav.billing')}</span>}
          </Link>

          {/* Booking Rebites — visible for salons, spas, beauty & wellness */}
          {BOOKING_ELIGIBLE_TYPES.has(restaurant?.business_type ?? '') && (
            <Link
              href={`/${locale}/dashboard/appointments`}
              aria-label={t('nav.booking')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all${!sidebarOpen ? ' justify-center px-0' : ''}`}
            >
              <span className="flex-shrink-0"><ICalendar /></span>
              {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{t('nav.booking')}</span>}
            </Link>
          )}

          {/* Aide */}
          <Link
            href={`/${locale}/support`}
            aria-label={t('nav.help')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all mt-1${!sidebarOpen ? ' justify-center px-0' : ''}`}
          >
            <span className="flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
            {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{t('nav.help')}</span>}
          </Link>
        </nav>

        {/* Bottom section */}
        <div className="p-2 border-t border-gray-100">
          {/* Upgrade card — free plan only */}
          {sidebarOpen && (restaurant?.plans?.key ?? restaurant?.plan) === 'starter' && (
            <div className="rounded-xl p-3 mb-2 bg-gradient-to-br from-purple-600 to-primary-600 text-white">
              <p className="text-xs font-bold mb-0.5">{t('nav.upgradeTitle')}</p>
              <p className="text-[11px] text-white/70 mb-2.5">{t('nav.upgradeSubtitle')}</p>
              <button onClick={() => setShowPlanSelection(true)} className="w-full bg-white text-purple-700 text-xs font-bold py-1.5 rounded-xl hover:bg-white/90 transition-colors">
                {t('nav.upgradeBtn')}
              </button>
            </div>
          )}
          {/* Sign out */}
          <button
            onClick={handleSignOut}
            aria-label={t('nav.signOut')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-all${!sidebarOpen ? ' justify-center px-0' : ''}`}
          >
            <span className="flex-shrink-0"><ILogOut /></span>
            {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">{t('nav.signOut')}</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? t('nav.collapseSidebar') : t('nav.expandSidebar')}
          className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors z-10"
        >
          {sidebarOpen ? <IChevL /> : <IChevR />}
        </button>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile header */}
        <MobileHeader
          restaurantName={restaurant?.name ?? ''}
          logoUrl={restaurant?.logo_url ?? null}
          primaryColor={restaurant?.primary_color ?? '#4f6bed'}
          businessType={restaurant?.business_type ?? null}
          planName={restaurant?.plans?.name ?? restaurant?.plan ?? 'starter'}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSignOut={handleSignOut}
          drawerOpen={mobileDrawerOpen}
          onDrawerToggle={setMobileDrawerOpen}
          enabledKpiKeys={enabledKpiKeys}
          showUpgrade={(restaurant?.plans?.key ?? restaurant?.plan) === 'starter'}
          onUpgrade={() => setShowPlanSelection(true)}
        />

        {/* Top nav bar (desktop only) */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-100 h-16 hidden lg:flex items-center px-6 gap-4 shadow-[0_1px_0_rgba(17,24,39,0.04)]">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">
              {navItems.find(n => n.id === activeTab)?.label}
            </h1>
          </div>
          {/* Restaurant chip */}
          <div className="flex items-center gap-2.5 py-1.5 px-3 rounded-xl bg-gray-50 border border-gray-100">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
              style={{ background: restaurant?.primary_color ?? DS.primary }}
            >
              {restaurant?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <span className="text-xs font-medium text-gray-700 hidden sm:block truncate max-w-[140px]">
              {restaurant?.name}
            </span>
          </div>
        </header>

        {/* Tab content area */}
        <main className="flex-1 px-4 py-4 md:p-6 overflow-auto pb-24 md:pb-6">

          {/* ══ OVERVIEW ══════════════════════════════════ */}
          {activeTab === 'overview' && !hasTemplates && !templateBannerDismissed && (
            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-5 flex items-start justify-between gap-4 animate-fade-up">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {t('dashboard.walletTemplateBanner')}
                </p>
                <button
                  onClick={() => router.push(`/${locale}/dashboard/wallet`)}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors"
                >
                  {t('dashboard.walletTemplateBannerBtn')}
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
              <button
                onClick={() => { setTemplateBannerDismissed(true); localStorage.setItem('wallet-banner-dismissed', '1'); }}
                className="shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={t('dashboard.closeBanner')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}
          {activeTab === 'overview' && (
            <OverviewTab
              customers={customers}
              transactions={transactions}
              growthTriggers={growthTriggers}
              triggersLoading={triggersLoading}
              restaurantMetrics={restaurantMetrics ?? null}
              loyaltySettings={loyaltySettings}
              plan={restaurant?.plan ?? 'starter'}
              isPaidPlan={isPaidPlan}
              totalCustomers={totalCustomers}
              onUpgrade={() => setShowPlanSelection(true)}
              onTabChange={(tab) => setActiveTab(tab as Tab)}
              onFilterChange={setFilter}
              onCampaignOpen={() => { setActiveTab('campaigns'); setCampaignModal(true); }}
              restaurantSlug={restaurant?.slug}
              businessType={restaurant?.business_type}
            />
          )}

          {/* ══ CLIENTS ════════════════════════════════════ */}
          {activeTab === 'clients' && (
            <div className="space-y-5 animate-fade-up">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{t('clients.title')}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{t('clients.resultCount', { count: filteredCustomers.length })}</p>
                </div>
                <button
                  disabled={busyAction === 'export-csv'}
                  onClick={async () => {
                    if (!restaurant || busyAction === 'export-csv') return;
                    setBusyAction('export-csv');
                    const { data: { session: s } } = await supabase.auth.getSession();
                    if (!s) { setBusyAction(null); return; }
                    const res = await fetch('/api/export-csv', {
                      headers: { Authorization: `Bearer ${s.access_token}` },
                    });
                    if (!res.ok) { toast.error(t('clients.exportError')); setBusyAction(null); return; }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'clients.csv'; a.click();
                    URL.revokeObjectURL(url);
                    setBusyAction(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  <span className="hidden sm:inline">{t('clients.exportCsv')}</span>
                </button>
              </div>

              {/* Search + filters */}
              <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <ISearch />
                  </span>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setClientsPage(1); }}
                    placeholder={t('clients.searchPlaceholder')}
                    className="w-full pl-10 pr-4 py-2.5 text-sm text-gray-900 bg-white border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {[
                    { id: 'all',      label: t('clients.filterAll') },
                    { id: 'inactive', label: t('clients.filterInactive') },
                    { id: 'vip',      label: t('clients.filterVip') },
                    { id: 'birthday', label: t('clients.filterBirthday') },
                    { id: 'new',      label: t('clients.filterNew') },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => { setFilter(f.id); setClientsPage(1); }}
                      className={[
                        'px-4 py-2.5 text-sm font-medium rounded-xl transition-all whitespace-nowrap flex-shrink-0',
                        filter === f.id
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700',
                      ].join(' ')}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile: Card layout */}
              <div className="md:hidden space-y-3">
                {filteredCustomers.length === 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] py-16 text-center">
                    <div className="text-3xl mb-3">🔍</div>
                    <p className="text-sm text-gray-400 font-medium">{t('clients.noClientFound')}</p>
                  </div>
                )}
                {paginatedCustomers.map(c => (
                  <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 cursor-pointer active:bg-gray-50 transition-colors" onClick={() => setSelectedCustomer(c)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{c.first_name} {c.last_name}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{c.email}</p>
                      </div>
                      <StatusBadge status={getCustomerStatus(c, loyaltySettings.program_type, loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points)} t={t} />
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium">
                          {loyaltySettings.program_type === 'stamps' ? t('clients.stamps') : t('clients.points')}
                        </p>
                        {loyaltySettings.program_type === 'stamps' ? (
                          <div className="flex gap-0.5 flex-wrap mt-1">
                            {Array.from({ length: loyaltySettings.stamps_total }, (_, i) => (
                              <div
                                key={i}
                                className={[
                                  'w-2 h-2 rounded-full border',
                                  i < (c.stamps_count ?? 0) ? 'bg-gray-900 border-gray-900' : 'border-gray-300',
                                ].join(' ')}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-gray-900 mt-0.5">{c.total_points}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium">{t('clients.visits')}</p>
                        <p className="text-sm font-bold text-gray-900 mt-0.5 tabular-nums">{c.total_visits}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium">{t('clients.lastVisitShort')}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) : '—'}
                        </p>
                      </div>
                    </div>

                    {(c.completed_cards ?? 0) > 0 && (
                      <p className="text-xs text-amber-600 font-medium mb-3">
                        {t('clients.completedCards', { count: c.completed_cards })}
                      </p>
                    )}

                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => addPoint(c.id, 1)}
                        className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl text-xs font-semibold hover:bg-gray-700 transition-colors tap-target"
                      >{loyaltySettings.program_type === 'stamps' ? t('clients.addOneStamp') : t('clients.addOnePoint')}</button>
                      <button
                        onClick={() => addPoint(c.id, -1)}
                        className="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-colors tap-target"
                      >−1</button>
                      {enabledKpiKeys.includes('wallet_pass_rate') && (
                        walletPassCustomerIds.has(c.id)
                          ? <span className="text-xs font-semibold text-success-700 bg-success-50 px-2.5 py-2 rounded-xl">🎫</span>
                          : <button
                              onClick={() => copyWalletUrl(c.id)}
                              className="text-xs font-medium text-gray-400 bg-gray-50 px-2.5 py-2 rounded-xl hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            >🎫</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {[
                        t('clients.headerName'), t('clients.headerEmail'),
                        loyaltySettings.program_type === 'stamps' ? t('clients.stamps') : t('clients.points'),
                        t('clients.visits'), t('clients.lastVisit'), t('clients.headerStatus'),
                        ...(enabledKpiKeys.includes('wallet_pass_rate') ? [t('clients.headerWallet')] : []),
                        t('clients.headerActions'),
                      ].map(h => (
                        <th key={h} className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.length === 0 && (
                      <tr>
                        <td colSpan={enabledKpiKeys.includes('wallet_pass_rate') ? 8 : 7} className="px-4 py-16 text-center">
                          <div className="text-3xl mb-3">🔍</div>
                          <p className="text-sm text-gray-400 font-medium">{t('clients.noClientFound')}</p>
                        </td>
                      </tr>
                    )}
                    {paginatedCustomers.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedCustomer(c)}>
                        <td className="px-4 py-3.5 font-semibold text-gray-900 whitespace-nowrap">
                          {c.first_name} {c.last_name}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">{c.email}</td>
                        <td className="px-4 py-3.5">
                          {loyaltySettings.program_type === 'stamps' ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-1 flex-wrap">
                                {Array.from({ length: loyaltySettings.stamps_total }, (_, i) => (
                                  <div
                                    key={i}
                                    className={[
                                      'w-2.5 h-2.5 rounded-full border-2',
                                      i < (c.stamps_count ?? 0) ? 'bg-gray-900 border-gray-900' : 'border-gray-300',
                                    ].join(' ')}
                                  />
                                ))}
                              </div>
                              {(c.completed_cards ?? 0) > 0 && (
                                <span className="text-xs text-amber-600 font-medium">
                                  {t('clients.completedCards', { count: c.completed_cards })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="success">{c.total_points} pts</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 tabular-nums">{c.total_visits}</td>
                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                          {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString(locale) : '—'}
                        </td>
                        <td className="px-4 py-3.5"><StatusBadge status={getCustomerStatus(c, loyaltySettings.program_type, loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points)} t={t} /></td>
                        {enabledKpiKeys.includes('wallet_pass_rate') && (
                          <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                            {walletPassCustomerIds.has(c.id)
                              ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-700 bg-success-50 px-2 py-1 rounded-full">{t('clients.walletActive')}</span>
                              : <button
                                  onClick={() => copyWalletUrl(c.id)}
                                  title={t('clients.walletSendTooltip')}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-full hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                >{t('clients.walletSend')}</button>
                            }
                          </td>
                        )}
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => addPoint(c.id, 1)}
                              className="bg-gray-900 text-white px-2.5 py-1 rounded-xl text-xs font-semibold hover:bg-gray-700 transition-colors"
                            >+1</button>
                            <button
                              onClick={() => addPoint(c.id, -1)}
                              className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-colors"
                            >−1</button>
                            <button
                              onClick={() => deleteCustomer(c.id)}
                              title={t('clients.deleteGdpr')}
                              className="bg-white text-gray-400 px-2 py-1 rounded-xl text-xs hover:text-danger-600 hover:bg-danger-50 transition-colors border border-gray-100"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-1 pt-4">
                  <p className="text-xs text-gray-400">
                    {t('clients.paginationRange', { start: (clientsPage - 1) * CLIENTS_PER_PAGE + 1, end: Math.min(clientsPage * CLIENTS_PER_PAGE, filteredCustomers.length), total: filteredCustomers.length })}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setClientsPage(p => Math.max(1, p - 1))}
                      disabled={clientsPage === 1}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      ←
                    </button>
                    <span className="text-sm text-gray-600 font-medium px-2">
                      {clientsPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setClientsPage(p => Math.min(totalPages, p + 1))}
                      disabled={clientsPage === totalPages}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ LOYALTY ════════════════════════════════════ */}
          {activeTab === 'loyalty' && (
            <LoyaltyTab
              settings={loyaltySettings}
              onSettingsChange={setLoyaltySettings}
              onSave={saveLoyaltySettings}
              saving={savingSettings}
              transactions={transactions}
              customers={customers}
              plan={restaurant?.plan}
              onUpgrade={() => setShowPlanSelection(true)}
            />
          )}

          {/* ══ CAMPAIGNS ══════════════════════════════════ */}
          {activeTab === 'campaigns' && (
            <div className="space-y-5 animate-fade-up">
              {/* Upgrade gate for free plans */}
              {!isPaidPlan && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8 text-center">
                  <div className="text-4xl mb-4">📧</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{t('campaigns.emailTitle')}</h3>
                  <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
                    {t('campaigns.upgradeGate')}
                  </p>
                  <button
                    onClick={() => setShowPlanSelection(true)}
                    className="bg-gradient-to-r from-purple-600 to-primary-600 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    {t('campaigns.upgradeBtn')}
                  </button>
                </div>
              )}
              {isPaidPlan && (<>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{t('campaigns.title')}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{t('campaigns.subtitle')}</p>
                </div>
                <div className="flex gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => {
                      setWalletPushModal(true);
                      setWalletPushPreview(false);
                      setWalletPush({ name: '', message: '', segment: 'all' });
                    }}
                    className="flex-shrink-0 bg-white text-gray-900 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors tap-target"
                  >
                    {t('campaigns.walletPushBtn')}
                  </button>
                  <button
                    onClick={() => {
                      setCampaignModal(true);
                      setCampaignPreview(false);
                      setNewCampaign({ name: '', type: 'custom', subject: '', body: '', segment: 'all', scheduled_at: '' });
                    }}
                    className="flex-shrink-0 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors tap-target"
                  >
                    {t('campaigns.newCampaign')}
                  </button>
                </div>
              </div>

              {/* Templates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {campaignTemplates.map((tpl, i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{tpl.icon}</span>
                        <span className="font-semibold text-sm text-gray-900">{tpl.name}</span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${tpl.colorClass}`}>
                        {t('campaigns.recipientCount', { count: tpl.count })}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setNewCampaign({ name: tpl.name, type: tpl.type, subject: tpl.subject, body: tpl.body, segment: tpl.segment, scheduled_at: '' });
                        setCampaignPreview(false);
                        setCampaignModal(true);
                      }}
                      className="w-full mt-2 bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                    >
                      {t('campaigns.useTemplate')}
                    </button>
                  </div>
                ))}
              </div>

              {/* History */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">{t('campaigns.historyTitle')}</h3>
                </div>
                {sentCampaigns.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-sm text-gray-400 font-medium">{t('campaigns.historyEmpty')}</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile: card list */}
                    <div className="md:hidden divide-y divide-gray-50">
                      {sentCampaigns.map(c => (
                        <div key={c.id} className="px-4 py-3.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="font-semibold text-sm text-gray-900 truncate mr-3">{c.name}</p>
                            <Badge
                              variant={c.status === 'sent' ? 'success' : c.status === 'failed' ? 'danger' : c.status === 'scheduled' ? 'scheduled' : 'neutral'}
                            >
                              {c.status === 'sent' ? t('campaigns.statusSent') : c.status === 'failed' ? t('campaigns.statusFailed') : c.status === 'scheduled' ? t('campaigns.statusScheduled') : c.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span>{c.type === 'wallet_push' ? 'Wallet' : c.type}</span>
                            <span>·</span>
                            <span className="tabular-nums">{t('campaigns.recipientCount', { count: c.recipients_count })}</span>
                            <span>·</span>
                            <span>
                              {c.sent_at
                                ? new Date(c.sent_at).toLocaleDateString(locale)
                                : c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString(locale) : '—'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Desktop: table */}
                    <table className="hidden md:table w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          {[t('campaigns.headerName'), t('campaigns.headerType'), t('campaigns.headerRecipients'), t('campaigns.headerStatus'), t('campaigns.headerDate')].map(h => (
                            <th key={h} className="px-4 py-3.5 text-left text-xs font-medium text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sentCampaigns.map(c => (
                          <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3.5 font-semibold text-gray-900">{c.name}</td>
                            <td className="px-4 py-3.5 text-gray-500">{c.type === 'wallet_push' ? 'Wallet' : c.type}</td>
                            <td className="px-4 py-3.5 text-gray-500 tabular-nums">{c.recipients_count}</td>
                            <td className="px-4 py-3.5">
                              <Badge
                                variant={c.status === 'sent' ? 'success' : c.status === 'failed' ? 'danger' : c.status === 'scheduled' ? 'scheduled' : 'neutral'}
                              >
                                {c.status === 'sent' ? t('campaigns.statusSent') : c.status === 'failed' ? t('campaigns.statusFailed') : c.status === 'scheduled' ? t('campaigns.statusScheduled') : c.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                              {c.sent_at
                                ? new Date(c.sent_at).toLocaleDateString(locale)
                                : c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString(locale) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {/* Campaign Modal */}
              {campaignModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setCampaignModal(false)}>
                  <div className="bg-white rounded-2xl px-4 sm:px-6 py-5 sm:py-6 w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.2)]" onClick={e => e.stopPropagation()}>
                    {campaignPreview ? (
                      /* Preview screen */
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-lg font-bold text-gray-900">{t('campaigns.previewTitle')}</h2>
                          <button
                            onClick={() => setCampaignModal(false)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                          >✕</button>
                        </div>

                        {/* Subject preview */}
                        <div className="bg-gray-50 rounded-xl p-4 mb-4">
                          <p className="text-xs text-gray-500 mb-1">{t('campaigns.previewSubject')}</p>
                          <p className="font-semibold text-gray-900 text-sm">
                            {newCampaign.subject.replace(/\{\{prenom\}\}/gi, 'Marie').replace(/\{\{restaurant\}\}/gi, restaurant?.name ?? '')}
                          </p>
                        </div>

                        {/* Email preview */}
                        <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
                          <div className="p-4 text-center text-white font-bold" style={{ background: restaurant?.primary_color ?? DS.primary }}>
                            {restaurant?.name}
                          </div>
                          <div className="p-5 bg-white">
                            <p className="font-semibold text-gray-800 mb-3">{t('campaigns.previewGreeting')}</p>
                            <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
                              {newCampaign.body.replace(/\{\{prenom\}\}/gi, 'Marie').replace(/\{\{points\}\}/gi, '42').replace(/\{\{restaurant\}\}/gi, restaurant?.name ?? '')}
                            </p>
                            <div className="bg-success-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500">{t('campaigns.previewBalance')}</p>
                              <p className="text-xl font-bold text-success-700 mt-0.5">42 pts</p>
                            </div>
                          </div>
                          <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 text-center">
                            <p className="text-xs text-gray-400">{t('common.poweredBy')}</p>
                          </div>
                        </div>

                        {/* Recipients info */}
                        <div className="bg-primary-50 rounded-xl p-3.5 mb-5 text-sm text-primary-700">
                          {newCampaign.scheduled_at
                            ? t('campaigns.previewRecipientInfoDate', { count: getSegmentCount(newCampaign.segment), date: new Date(newCampaign.scheduled_at).toLocaleDateString(locale) })
                            : t('campaigns.previewRecipientInfo', { count: getSegmentCount(newCampaign.segment) })
                          }
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => setCampaignPreview(false)}
                            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                          >
                            {t('campaigns.previewEditBtn')}
                          </button>
                          <button
                            onClick={sendCampaign}
                            disabled={sendingCampaign}
                            className="flex-[2] bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                          >
                            {sendingCampaign
                              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-ds-spin" />{t('campaigns.previewSending')}</>
                              : newCampaign.scheduled_at ? t('campaigns.previewScheduleBtn') : t('campaigns.previewSendNowBtn')}
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Campaign form */
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-lg font-bold text-gray-900">{t('campaigns.createTitle')}</h2>
                          <button
                            onClick={() => setCampaignModal(false)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                          >✕</button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('campaigns.createNameLabel')}</label>
                            <input
                              value={newCampaign.name}
                              onChange={e => setNewCampaign(s => ({ ...s, name: e.target.value }))}
                              placeholder={t('campaigns.createNamePlaceholder')}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('campaigns.createSegmentLabel')}</label>
                            <select
                              value={newCampaign.segment}
                              onChange={e => setNewCampaign(s => ({ ...s, segment: e.target.value }))}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            >
                              <option value="all">{t('campaigns.segmentAll', { count: totalCustomers })}</option>
                              <option value="active">{t('campaigns.segmentActive', { count: activeCustomers })}</option>
                              <option value="inactive_45">{t('campaigns.segmentInactive45', { count: inactives45.length })}</option>
                              <option value="birthday">{t('campaigns.segmentBirthday', { count: birthdaysSoon.length })}</option>
                              <option value="near_reward">{t('campaigns.segmentNearReward', { count: nearReward.length })}</option>
                              <option value="vip">{t('campaigns.segmentVip', { count: customers.filter(c => getCustomerStatus(c, loyaltySettings.program_type, loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points) === 'vip').length })}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('campaigns.createSubjectLabel')}</label>
                            <input
                              value={newCampaign.subject}
                              onChange={e => setNewCampaign(s => ({ ...s, subject: e.target.value }))}
                              placeholder={t('campaigns.createSubjectPlaceholder')}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              {t('campaigns.createBodyLabel')}
                              <span className="font-normal text-gray-400 ml-2">{t('campaigns.createBodyVars')}</span>
                            </label>
                            <textarea
                              value={newCampaign.body}
                              onChange={e => setNewCampaign(s => ({ ...s, body: e.target.value }))}
                              placeholder={t('campaigns.createBodyPlaceholder')}
                              rows={5}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl resize-y transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              {t('campaigns.createScheduleLabel')} <span className="font-normal text-gray-400">{t('common.optional')}</span>
                            </label>
                            <input
                              type="datetime-local"
                              value={newCampaign.scheduled_at}
                              onChange={e => setNewCampaign(s => ({ ...s, scheduled_at: e.target.value }))}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => setCampaignPreview(true)}
                          disabled={!newCampaign.name || !newCampaign.subject || !newCampaign.body}
                          className="w-full mt-6 py-3 rounded-xl text-sm font-semibold transition-all bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          {t('campaigns.createPreviewBtn')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Wallet Push Modal */}
              {walletPushModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setWalletPushModal(false)}>
                  <div className="bg-white rounded-2xl px-4 sm:px-6 py-5 sm:py-6 w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.2)]" onClick={e => e.stopPropagation()}>
                    {walletPushPreview ? (
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-lg font-bold text-gray-900">{t('campaigns.walletPushPreviewTitle')}</h2>
                          <button onClick={() => setWalletPushModal(false)} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">✕</button>
                        </div>

                        {/* iOS notification preview */}
                        <div className="mb-4">
                          <p className="text-xs text-gray-500 mb-2">{t('campaigns.walletPushPreviewNotif')}</p>
                          <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: restaurant?.primary_color ?? '#4F6BED' }}>
                              <span className="text-white text-sm font-bold">{restaurant?.name?.charAt(0) ?? 'R'}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{restaurant?.name}</p>
                              <p className="text-sm text-gray-600">{t('campaigns.walletPushPreviewNotifText')}</p>
                            </div>
                          </div>
                        </div>

                        {/* Back of pass preview */}
                        <div className="mb-4">
                          <p className="text-xs text-gray-500 mb-2">{t('campaigns.walletPushPreviewBack')}</p>
                          <div className="border border-gray-200 rounded-xl p-4">
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('campaigns.walletPushMessageLabel')}</p>
                            <p className="text-sm text-gray-900">{walletPush.message}</p>
                          </div>
                        </div>

                        {/* Recipient info */}
                        <div className="bg-primary-50 rounded-xl p-3.5 mb-5 text-sm text-primary-700">
                          {t('campaigns.walletPushRecipientInfo', { count: getSegmentCount(walletPush.segment) })}
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => setWalletPushPreview(false)}
                            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                          >
                            {t('campaigns.previewEditBtn')}
                          </button>
                          <button
                            onClick={sendWalletPush}
                            disabled={sendingWalletPush}
                            className="flex-[2] bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                          >
                            {sendingWalletPush
                              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-ds-spin" />{t('campaigns.walletPushSending')}</>
                              : t('campaigns.walletPushSendBtn')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-lg font-bold text-gray-900">{t('campaigns.walletPushTitle')}</h2>
                          <button onClick={() => setWalletPushModal(false)} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">✕</button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('campaigns.walletPushNameLabel')}</label>
                            <input
                              value={walletPush.name}
                              onChange={e => setWalletPush(s => ({ ...s, name: e.target.value }))}
                              placeholder={t('campaigns.walletPushNamePlaceholder')}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('campaigns.walletPushSegmentLabel')}</label>
                            <select
                              value={walletPush.segment}
                              onChange={e => setWalletPush(s => ({ ...s, segment: e.target.value }))}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            >
                              <option value="all">{t('campaigns.segmentAll', { count: totalCustomers })}</option>
                              <option value="active">{t('campaigns.segmentActive', { count: activeCustomers })}</option>
                              <option value="inactive_45">{t('campaigns.segmentInactive45', { count: inactives45.length })}</option>
                              <option value="birthday">{t('campaigns.segmentBirthday', { count: birthdaysSoon.length })}</option>
                              <option value="near_reward">{t('campaigns.segmentNearReward', { count: nearReward.length })}</option>
                              <option value="vip">{t('campaigns.segmentVip', { count: customers.filter(c => getCustomerStatus(c, loyaltySettings.program_type, loyaltySettings.program_type === 'stamps' ? loyaltySettings.vip_threshold_stamps : loyaltySettings.vip_threshold_points) === 'vip').length })}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('campaigns.walletPushMessageLabel')}</label>
                            <textarea
                              value={walletPush.message}
                              onChange={e => setWalletPush(s => ({ ...s, message: e.target.value }))}
                              placeholder={t('campaigns.walletPushMessagePlaceholder')}
                              rows={3}
                              maxLength={300}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl resize-y transition-colors"
                            />
                            <p className="text-xs text-gray-400 mt-1">{t('campaigns.walletPushMessageHint')}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{walletPush.message.length}/300</p>
                          </div>
                        </div>

                        <button
                          onClick={() => setWalletPushPreview(true)}
                          disabled={!walletPush.name || !walletPush.message}
                          className="w-full mt-6 py-3 rounded-xl text-sm font-semibold transition-all bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          {t('campaigns.createPreviewBtn')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              </>)}
            </div>
          )}

          {/* ══ ANALYTICS ══════════════════════════════════ */}
          {activeTab === 'analytics' && (
            <AnalyticsTab
              customers={customers}
              transactions={transactions}
              restaurantMetrics={restaurantMetrics ?? null}
              loyaltySettings={loyaltySettings}
              isPaidPlan={isPaidPlan}
              restaurantSettings={restaurantSettings}
              onUpgrade={() => setShowPlanSelection(true)}
            />
          )}

          {/* ══ SETTINGS ═══════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="space-y-5 animate-fade-up">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{t('settings.title')}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{t('settings.subtitle')}</p>
              </div>

              <div className="max-w-[560px] space-y-5">
                {/* Restaurant info */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-5">{t('settings.infoTitle')}</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.nameLabel')}</label>
                      <input
                        autoComplete="organization"
                        value={editName}
                        onChange={e => { setEditName(e.target.value); setInfoMsg(''); }}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.slugLabel')}</label>
                      <input
                        autoComplete="off"
                        value={editSlug}
                        onChange={e => { setEditSlug(e.target.value); setInfoMsg(''); }}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                      <p className="text-xs text-gray-400 mt-1">{t('settings.slugHint', { slug: editSlug })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      disabled={savingInfo || (editName === (restaurant?.name ?? '') && editSlug === (restaurant?.slug ?? ''))}
                      onClick={async () => {
                        setSavingInfo(true);
                        setInfoMsg('');
                        try {
                          const { data: { session: s } } = await supabase.auth.getSession();
                          const res = await fetch('/api/Restaurant/Create', {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${s?.access_token ?? ''}`,
                            },
                            body: JSON.stringify({ name: editName.trim(), slug: editSlug.trim() }),
                          });
                          if (res.ok) {
                            setInfoMsg(t('settings.savedMsg'));
                            setRestaurant(prev => prev ? { ...prev, name: editName.trim(), slug: editSlug.trim() } : prev);
                          } else {
                            const data = await res.json();
                            setInfoMsg(data.error || t('settings.saveError'));
                          }
                        } catch {
                          setInfoMsg(t('common.networkErrorRetry'));
                        }
                        setSavingInfo(false);
                      }}
                      className="px-4 py-2.5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors"
                    >
                      {savingInfo ? t('settings.savingBtn') : t('settings.saveBtn')}
                    </button>
                    {infoMsg && (
                      <span className={`text-xs ${infoMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{infoMsg}</span>
                    )}
                  </div>
                </div>

                {/* Logo */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('settings.logoTitle')}</h3>

                  <div className="flex items-center gap-4 mb-4">
                    {/* Preview */}
                    <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {(logoPreview ?? restaurant?.logo_url)
                        ? <img src={logoPreview ?? restaurant!.logo_url!} alt="Logo" className="w-full h-full object-contain" />
                        : <span className="text-2xl">🍽</span>
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {logoPreview ? logoFile?.name : restaurant?.logo_url ? t('settings.logoCurrentLabel') : t('settings.logoNone')}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{t('settings.logoFileHint')}</p>
                      {!restaurant?.logo_url && !logoPreview && (
                        <p className="text-xs text-amber-600 mt-1">{t('settings.logoWalletRequired')}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={e => {
                          setLogoError('');
                          setLogoSaved(false);
                          const file = e.target.files?.[0] ?? null;
                          setLogoFile(file);
                          setLogoPreview(file ? URL.createObjectURL(file) : null);
                          // Reset input so the same file can be re-selected
                          e.target.value = '';
                        }}
                      />
                      <span className="block w-full text-center px-4 py-2.5 text-sm border border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors">
                        {logoFile ? logoFile.name : t('settings.logoChooseFile')}
                      </span>
                    </label>
                    <button
                      onClick={uploadLogo}
                      disabled={!logoFile || logoUploading}
                      className="px-4 py-2.5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      {logoUploading ? t('settings.logoUploading') : t('settings.saveBtn')}
                    </button>
                  </div>

                  {logoError && (
                    <p className="mt-2 text-xs text-red-600">{logoError}</p>
                  )}
                  {logoSaved && (
                    <p className="mt-2 text-xs text-emerald-600">{t('settings.logoSaved')}</p>
                  )}
                </div>

                {/* KPI parameters — restaurant-level settings inputs */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('settings.analyticsTitle')}</h3>
                  <p className="text-xs text-gray-400 mb-4">{t('settings.analyticsDesc')}</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        {t('settings.avgTicketLabel')} <span className="text-gray-300">{t('settings.avgTicketUnit')}</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-1.5">{t('settings.avgTicketHint')}</p>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={restaurantSettings['average_ticket'] ?? ''}
                        onChange={(e) => {
                          setRestaurantSettings((prev) => ({ ...prev, average_ticket: e.target.value }));
                          setRestaurantSettingsMsg('');
                        }}
                        placeholder={t('settings.avgTicketPlaceholder')}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        {t('settings.graceDaysLabel')} <span className="text-gray-300">{t('settings.graceDaysUnit')}</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-1.5">{t('settings.graceDaysHint')}</p>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="120"
                        value={loyaltySettings.return_grace_days ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                          setLoyaltySettings((prev) => ({ ...prev, return_grace_days: val }));
                        }}
                        placeholder={String(RETURN_GRACE_DAYS[restaurant?.business_type ?? ''] ?? DEFAULT_GRACE_DAYS)}
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4">
                    <button
                      onClick={async () => {
                        setSavingRestaurantSettings(true);
                        setRestaurantSettingsMsg('');
                        try {
                          const { data: { session: s } } = await supabase.auth.getSession();
                          // Save both restaurant settings and grace days in parallel
                          const [resSettings, resGrace] = await Promise.all([
                            fetch('/api/restaurant-settings', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token ?? ''}` },
                              body: JSON.stringify(restaurantSettings),
                            }),
                            supabase.from('loyalty_settings').update({ return_grace_days: loyaltySettings.return_grace_days }).eq('restaurant_id', restaurant!.id),
                          ]);
                          const json = await resSettings.json();
                          if (!resSettings.ok) { setRestaurantSettingsMsg(json.error ?? t('common.error')); return; }
                          setRestaurantSettings(json.settings ?? restaurantSettings);
                          if (resGrace.error) { setRestaurantSettingsMsg(resGrace.error.message); return; }
                          setRestaurantSettingsMsg(t('settings.analyticsSaved'));
                        } finally {
                          setSavingRestaurantSettings(false);
                        }
                      }}
                      disabled={savingRestaurantSettings}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                      {savingRestaurantSettings ? t('common.savingDots') : t('settings.saveBtn')}
                    </button>
                    {restaurantSettingsMsg && (
                      <span className={`text-xs font-medium ${restaurantSettingsMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                        {restaurantSettingsMsg}
                      </span>
                    )}
                  </div>
                </div>

                {/* Plan info */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('settings.subscriptionTitle')}</h3>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {t('settings.planLabel', { plan: (restaurant?.plans?.name ?? restaurant?.plan)?.toUpperCase() ?? '' })}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {(restaurant?.plans?.key ?? restaurant?.plan) === 'starter' ? t('settings.starterLimit') : t('settings.paidUnlimited')}
                      </p>
                      {restaurant?.subscription_status && restaurant.subscription_status !== 'inactive' && (
                        <p className="text-xs text-gray-400 mt-1">
                          {t('settings.statusLabel')} <span className={
                            restaurant.subscription_status === 'active' ? 'text-success-600 font-medium' :
                            restaurant.subscription_status === 'past_due' ? 'text-warning-600 font-medium' :
                            restaurant.subscription_status === 'canceled' ? 'text-danger-600 font-medium' :
                            'text-gray-500 font-medium'
                          }>
                            {restaurant.subscription_status === 'active' ? t('settings.statusActive') :
                             restaurant.subscription_status === 'trialing' ? t('settings.statusTrialing') :
                             restaurant.subscription_status === 'past_due' ? t('settings.statusPastDue') :
                             restaurant.subscription_status === 'canceled' ? t('settings.statusCanceled') :
                             restaurant.subscription_status}
                          </span>
                          {restaurant.current_period_end && restaurant.subscription_status === 'active' && (
                            <> · {t('settings.renewalDate', { date: new Date(restaurant.current_period_end).toLocaleDateString(locale) })}</>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {restaurant?.stripe_customer_id && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/stripe/portal', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                              });
                              const data = await res.json();
                              if (data.url) window.location.href = data.url;
                              else toast.error(data.error || t('settings.portalError'));
                            } catch { toast.error(t('dashboard.toastNetworkError')); }
                          }}
                          className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                        >
                          {t('settings.manageBtn')}
                        </button>
                      )}
                      {(restaurant?.plans?.key ?? restaurant?.plan) === 'starter' && (
                        <button onClick={() => setShowPlanSelection(true)} className="bg-gradient-to-r from-purple-600 to-primary-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                          {t('settings.upgradeBtn')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

                {/* Relaunch tutorial */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('settings.helpTitle')}</h3>
                  <button
                    onClick={() => setShowTutorial(true)}
                    className="text-sm text-primary-600 font-medium hover:text-primary-700 transition-colors"
                  >
                    {t('settings.relaunchTutorial')}
                  </button>
                </div>

                {/* Language switcher */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('settings.languageTitle')}</h3>
                  <p className="text-xs text-gray-400 mb-4">{t('settings.languageDesc')}</p>
                  <LocaleSwitcher />
                </div>
            </div>
          )}

        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ──────────────────────── */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        scannerHref={`/${locale}/dashboard/scanner`}
      />
    </div>
  );
}
