/* eslint-disable @next/next/no-img-element */
'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';

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
  plan: string;
  plan_id: string | null;
  plans: { name: string; key: string } | null;
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

/* ─── Helpers ────────────────────────────────────────────── */
function getCustomerStatus(c: Customer): 'vip' | 'active' | 'inactive' {
  if (!c.last_visit_at) return 'inactive';
  const days = (Date.now() - new Date(c.last_visit_at).getTime()) / 86400000;
  if (days > 30) return 'inactive';
  if (c.total_points >= 100) return 'vip';
  return 'active';
}

function StatusBadge({ status }: { status: 'vip' | 'active' | 'inactive' }) {
  if (status === 'vip')      return <Badge variant="vip">⭐ VIP</Badge>;
  if (status === 'active')   return <Badge variant="success">✓ Actif</Badge>;
  return <Badge variant="neutral">○ Inactif</Badge>;
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

/* ─── Constants ──────────────────────────────────────────── */
const NOW   = Date.now();
const TODAY = new Date();

/* ═══════════════════════════════════════════════════════════
   DASHBOARD PAGE
═══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const router = useRouter();

  /* State */
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [restaurant, setRestaurant]     = useState<Restaurant | null>(null);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState('all');
  const [sidebarOpen, setSidebarOpen]   = useState(true);
  const [session, setSession]           = useState<Session | null>(null);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    points_per_scan: 1,
    reward_threshold: 100,
    reward_message: 'Récompense offerte !',
    program_type: 'points',
    stamps_total: 10,
    mode_changed_at: null,
    previous_program_type: null,
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

  /* Data load */
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/dashboard/login'); return; }
      setSession(session);

      const { data: resto } = await supabase
        .from('restaurants').select('id, name, slug, primary_color, logo_url, plan, plan_id, scanner_token, plans(name, key)')
        .eq('owner_id', session.user.id).maybeSingle();
      if (!resto) { router.replace('/onboarding'); return; }
      setRestaurant(resto);

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

      const { data: ls } = await supabase
        .from('loyalty_settings').select('*')
        .eq('restaurant_id', resto.id).maybeSingle();
      if (ls) setLoyaltySettings(ls);

      const { data: camps } = await supabase
        .from('campaigns').select('*')
        .eq('restaurant_id', resto.id)
        .order('created_at', { ascending: false });
      setSentCampaigns(camps ?? []);

      setLoading(false);
    }
    load();
  }, [router]);

  /* Refresh customers on window focus — scanner runs on a separate page/tab,
     so when the owner switches back the client list would otherwise show stale
     stamps_count / total_points values. */
  useEffect(() => {
    if (!restaurant) return;
    const onFocus = async () => {
      const { data: clients } = await supabase
        .from('customers').select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false });
      if (clients) setCustomers(clients);
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
  const avgPoints        = totalCustomers > 0 ? Math.round(customers.reduce((a, c) => a + c.total_points, 0) / totalCustomers) : 0;

  const chartData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dayStr = d.toISOString().split('T')[0];
    return {
      date: d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' }),
      'Nouveaux clients': customers.filter(c => c.created_at.startsWith(dayStr)).length,
      'Visites': transactions.filter(t => t.created_at.startsWith(dayStr) && t.type === 'visit').length,
      'Points': transactions.filter(t => t.created_at.startsWith(dayStr) && t.points_delta > 0).reduce((a, t) => a + t.points_delta, 0),
    };
  });

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
    const status      = getCustomerStatus(c);
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'inactive' ? status === 'inactive' :
      filter === 'vip'      ? status === 'vip' :
      filter === 'birthday' ? (() => { if (!c.birth_date) return false; const b = new Date(c.birth_date); return b.getMonth() === today.getMonth(); })() :
      filter === 'new'      ? new Date(c.created_at) >= new Date(today.getFullYear(), today.getMonth(), 1) : true;
    return matchSearch && matchFilter;
  });

  /* Handlers */
  async function addPoint(customerId: string, delta: number) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || !restaurant) return;
    await supabase.from('transactions').insert({
      customer_id: customerId, restaurant_id: restaurant.id,
      type: 'points_add', points_delta: delta,
      balance_after: customer.total_points + delta,
      metadata: { reason: 'Ajout manuel dashboard' },
    });
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, total_points: Math.max(0, c.total_points + delta) } : c));
  }

  async function saveLoyaltySettings() {
    if (!restaurant) return;
    setSavingSettings(true);
    await supabase.from('loyalty_settings').upsert({
      restaurant_id: restaurant.id,
      points_per_scan: loyaltySettings.points_per_scan,
      reward_threshold: loyaltySettings.reward_threshold,
      reward_message: loyaltySettings.reward_message,
      program_type: loyaltySettings.program_type,
      stamps_total: loyaltySettings.stamps_total,
      mode_changed_at: loyaltySettings.mode_changed_at,
      previous_program_type: loyaltySettings.previous_program_type,
    }, { onConflict: 'restaurant_id' });
    setSavingSettings(false);
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
      setLogoError(json.error ?? 'Erreur lors de l\'envoi.');
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
  }

  function getSegmentCount(segment: string): number {
    switch (segment) {
      case 'inactive_45':  return inactives45.length;
      case 'birthday':     return birthdaysSoon.length;
      case 'near_reward':  return nearReward.length;
      case 'active':       return activeCustomers;
      case 'vip':          return customers.filter(c => getCustomerStatus(c) === 'vip').length;
      default:             return totalCustomers;
    }
  }

  async function sendCampaign() {
    if (!session) return;
    setSendingCampaign(true);
    try {
      const res  = await fetch('/api/campaigns', {
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
        alert(data.scheduled ? 'Campagne planifiée !' : `${data.sent} email(s) envoyé(s) avec succès !`);
      } else {
        alert('Erreur : ' + (data.error ?? 'Inconnu'));
      }
    } catch {
      alert('Erreur réseau');
    }
    setSendingCampaign(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/dashboard/login');
  }

  /* ─── Loading screen ──────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-ds-spin mx-auto mb-4" />
        <p className="text-sm text-gray-400 font-medium">Chargement...</p>
      </div>
    </div>
  );

  /* ─── Nav items ───────────────────────────────────────── */
  const navItems: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'overview',  icon: <IGrid />,     label: "Vue d'ensemble" },
    { id: 'clients',   icon: <IUsers />,    label: 'Clients' },
    { id: 'loyalty',   icon: <IGift />,     label: 'Fidélité' },
    { id: 'campaigns', icon: <IMail />,     label: 'Campagnes' },
    { id: 'analytics', icon: <IChart />,    label: 'Analytics' },
    { id: 'settings',  icon: <ISettings />, label: 'Paramètres' },
  ];

  /* ─── Campaign templates ──────────────────────────────── */
  const campaignTemplates = [
    { type: 'reengagement', name: 'Re-engagement inactifs',   segment: 'inactive_45', icon: '😴', colorClass: 'bg-warning-100 text-warning-700', count: inactives45.length,    subject: 'On vous manque, {{prenom}} 💛',              body: "Cela fait un moment qu'on ne vous a pas vu chez {{restaurant}}.\n\nVous avez encore {{points}} points qui vous attendent ! Venez les utiliser — on a hâte de vous revoir." },
    { type: 'birthday',     name: 'Vœux anniversaire',        segment: 'birthday',    icon: '🎂', colorClass: 'bg-pink-50 text-pink-700',           count: birthdaysSoon.length,  subject: 'Joyeux anniversaire {{prenom}} 🎂',          body: "Toute l'équipe de {{restaurant}} vous souhaite un très joyeux anniversaire !\n\nPour fêter ça, venez nous rendre visite — on a une surprise pour vous 🎁" },
    { type: 'near_reward',  name: 'Récompense proche',        segment: 'near_reward', icon: '🏆', colorClass: 'bg-success-50 text-success-700',     count: nearReward.length,     subject: 'Vous y êtes presque, {{prenom}} 🏆',         body: "Bonne nouvelle ! Avec vos {{points}} points, vous n'êtes plus très loin de votre récompense chez {{restaurant}}.\n\nEncore quelques visites et c'est dans la poche !" },
    { type: 'double_points',name: 'Double points',            segment: 'all',         icon: '⚡', colorClass: 'bg-primary-50 text-primary-700',    count: totalCustomers,        subject: 'Double points chez {{restaurant}} cette semaine 🎉', body: "Cette semaine seulement, gagnez le double de points à chaque visite chez {{restaurant}} !\n\nProfitez-en vite, l'offre est limitée dans le temps 🚀" },
    { type: 'promo',        name: 'Offre spéciale',           segment: 'all',         icon: '🎁', colorClass: 'bg-vip-50 text-vip-600',            count: totalCustomers,        subject: 'Une offre rien que pour vous, {{prenom}} 🎁',body: "Cher(e) {{prenom}},\n\nNous avons une offre exclusive pour vous chez {{restaurant}}.\n\nVenez nous voir pour en profiter !" },
    { type: 'custom',       name: 'Message libre',            segment: 'all',         icon: '✏️', colorClass: 'bg-gray-100 text-gray-600',         count: totalCustomers,        subject: '', body: '' },
  ];

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen bg-surface">

      {/* ── SIDEBAR ────────────────────────────────────── */}
      <aside
        className={[
          'relative flex flex-col bg-white border-r border-gray-100 flex-shrink-0',
          'shadow-[1px_0_0_rgba(17,24,39,0.04)] sticky top-0 h-screen z-10',
          'transition-[width] duration-200 ease-in-out',
          sidebarOpen ? 'w-60' : 'w-16',
        ].join(' ')}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-100">
          <div
            className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-base shadow-sm"
            style={{ background: restaurant?.primary_color ?? DS.primary }}
          >
            {restaurant?.logo_url
              ? <img src={restaurant.logo_url} alt="" className="w-full h-full object-contain" />
              : '🍽'}
          </div>
          {sidebarOpen && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">{restaurant?.name}</p>
              <span className={[
                'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md',
                (restaurant?.plans?.key ?? restaurant?.plan) === 'pro'     ? 'bg-purple-100 text-purple-700' :
                (restaurant?.plans?.key ?? restaurant?.plan) === 'starter' ? 'bg-primary-100 text-primary-700' :
                                                                              'bg-gray-100 text-gray-500',
              ].join(' ')}>
                {restaurant?.plans?.name ?? restaurant?.plan ?? 'free'}
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
                onClick={() => setActiveTab(item.id)}
                aria-label={item.label}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
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
          <a
            href="/dashboard/scanner"
            aria-label="Scanner QR"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all mt-1"
          >
            <span className="flex-shrink-0"><ICamera /></span>
            {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">Scanner QR</span>}
          </a>

          {/* Wallet Studio — hidden on free plan */}
          {(restaurant?.plans?.key ?? restaurant?.plan) !== 'free' && (
            <a
              href="/dashboard/wallet"
              aria-label="Wallet Studio"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all"
            >
              <span className="flex-shrink-0"><IWallet /></span>
              {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">Wallet Studio</span>}
            </a>
          )}
        </nav>

        {/* Bottom section */}
        <div className="p-2 border-t border-gray-100">
          {/* Upgrade card — free plan only */}
          {sidebarOpen && (restaurant?.plans?.key ?? restaurant?.plan) === 'free' && (
            <div className="rounded-xl p-3 mb-2 bg-gradient-to-br from-purple-600 to-primary-600 text-white">
              <p className="text-xs font-bold mb-0.5">Passer à Pro</p>
              <p className="text-[11px] text-white/70 mb-2.5">Campagnes illimitées + Analytics</p>
              <button className="w-full bg-white text-purple-700 text-xs font-bold py-1.5 rounded-xl hover:bg-white/90 transition-colors">
                Upgrader ✨
              </button>
            </div>
          )}
          {/* Sign out */}
          <button
            onClick={handleSignOut}
            aria-label="Déconnexion"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-all"
          >
            <span className="flex-shrink-0"><ILogOut /></span>
            {sidebarOpen && <span className="text-sm font-medium whitespace-nowrap">Déconnexion</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Réduire la barre latérale' : 'Ouvrir la barre latérale'}
          className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors z-10"
        >
          {sidebarOpen ? <IChevL /> : <IChevR />}
        </button>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top nav bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-gray-100 h-16 flex items-center px-6 gap-4 shadow-[0_1px_0_rgba(17,24,39,0.04)]">
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
        <main className="flex-1 p-6 overflow-auto">

          {/* ══ OVERVIEW ══════════════════════════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-fade-up">
              {/* Page header */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Vue d&apos;ensemble</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {today.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  { label: 'Clients totaux',   value: totalCustomers,   icon: '👥', color: DS.primary },
                  { label: 'Nouveaux ce mois', value: newThisMonth,     icon: '➕', color: DS.success },
                  { label: 'Actifs 30 jours',  value: activeCustomers,  icon: '⭐', color: DS.warning },
                  { label: 'Taux de retour',   value: `${returnRate}%`, icon: '🔁', color: DS.purple },
                  { label: 'Points moyens',    value: avgPoints,        icon: '💰', color: DS.primary },
                  { label: 'Inactifs 45j',     value: inactiveCustomers,icon: '📉', color: DS.danger },
                ].map((kpi, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.07)] transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-xl">{kpi.icon}</span>
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: kpi.color }} />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums mb-1">{kpi.value}</p>
                    <p className="text-xs text-gray-500 font-medium leading-tight">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Chart + Opportunities */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
                {/* Activity chart */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-5">Activité — 30 derniers jours</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradClients" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={DS.primary} stopOpacity={0.12} />
                          <stop offset="95%" stopColor={DS.primary} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradPoints" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={DS.purple} stopOpacity={0.12} />
                          <stop offset="95%" stopColor={DS.purple} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={DS.gray100} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} interval={6} />
                      <YAxis tick={{ fontSize: 10, fill: DS.gray400 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontSize: '0.8rem', background: 'white' }}
                        cursor={{ stroke: DS.gray200, strokeWidth: 1 }}
                      />
                      <Area type="monotone" dataKey="Nouveaux clients" stroke={DS.primary} strokeWidth={2} fill="url(#gradClients)" dot={false} />
                      <Area type="monotone" dataKey="Points"           stroke={DS.purple} strokeWidth={2} fill="url(#gradPoints)"  dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Opportunities */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Opportunités du mois</h3>
                  <div className="flex flex-col gap-3">
                    {[
                      { count: inactives45.length,    label: 'clients inactifs 45j',      bg: 'bg-warning-100', text: 'text-warning-700', icon: '😴', cta: 'Relancer' },
                      { count: birthdaysSoon.length,  label: 'anniversaires cette semaine', bg: 'bg-vip-50',     text: 'text-vip-600',    icon: '🎂', cta: 'Vœux' },
                      { count: nearReward.length,     label: "proches d'une récompense",  bg: 'bg-success-50',  text: 'text-success-700',icon: '🏆', cta: 'Notifier' },
                    ].map((opp, i) => (
                      <div key={i} className={`${opp.bg} rounded-xl p-3.5 flex items-center gap-3`}>
                        <span className="text-xl flex-shrink-0">{opp.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-lg font-bold tabular-nums ${opp.text}`}>{opp.count}</p>
                          <p className={`text-xs truncate ${opp.text} opacity-75`}>{opp.label}</p>
                        </div>
                        <button
                          onClick={() => setActiveTab('campaigns')}
                          className={`flex-shrink-0 ${opp.text} bg-white/60 hover:bg-white/90 text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors`}
                        >
                          {opp.cta}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Insight */}
                  <div className="mt-4 p-3.5 bg-primary-50 rounded-xl border-l-2 border-primary-600">
                    <p className="text-xs text-primary-700 leading-relaxed">
                      <strong>Insight :</strong>{' '}
                      {returnRate > 50
                        ? `${returnRate}% de vos clients reviennent — excellent !`
                        : `Votre taux de retour est de ${returnRate}%. Lancez une campagne de re-engagement.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ CLIENTS ════════════════════════════════════ */}
          {activeTab === 'clients' && (
            <div className="space-y-5 animate-fade-up">
              {/* Header */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
                <p className="text-sm text-gray-500 mt-0.5">{filteredCustomers.length} résultat(s)</p>
              </div>

              {/* Search + filters */}
              <div className="flex flex-wrap gap-2.5 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <ISearch />
                  </span>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher un client..."
                    className="w-full pl-10 pr-4 py-2.5 text-sm text-gray-900 bg-white border border-gray-200 rounded-xl placeholder:text-gray-400 transition-colors"
                  />
                </div>
                {[
                  { id: 'all',      label: 'Tous' },
                  { id: 'inactive', label: 'Inactifs 30j' },
                  { id: 'vip',      label: '⭐ VIP' },
                  { id: 'birthday', label: '🎂 Anniversaire' },
                  { id: 'new',      label: 'Nouveaux' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={[
                      'px-4 py-2.5 text-sm font-medium rounded-xl transition-all',
                      filter === f.id
                        ? 'bg-gray-900 text-white'
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-700',
                    ].join(' ')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      {['Nom', 'Email', loyaltySettings.program_type === 'stamps' ? 'Tampons' : 'Points', 'Visites', 'Dernière visite', 'Statut', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center">
                          <div className="text-3xl mb-3">🔍</div>
                          <p className="text-sm text-gray-400 font-medium">Aucun client trouvé</p>
                        </td>
                      </tr>
                    )}
                    {filteredCustomers.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
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
                                  {c.completed_cards} carte{c.completed_cards > 1 ? 's' : ''} complétée{c.completed_cards > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="success">{c.total_points} pts</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 tabular-nums">{c.total_visits}</td>
                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                          {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('fr-BE') : '—'}
                        </td>
                        <td className="px-4 py-3.5"><StatusBadge status={getCustomerStatus(c)} /></td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => addPoint(c.id, 1)}
                              className="bg-gray-900 text-white px-2.5 py-1 rounded-xl text-xs font-semibold hover:bg-gray-700 transition-colors"
                            >+1</button>
                            <button
                              onClick={() => addPoint(c.id, -1)}
                              className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-xl text-xs font-semibold hover:bg-gray-200 transition-colors"
                            >−1</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ LOYALTY ════════════════════════════════════ */}
          {activeTab === 'loyalty' && (
            <div className="space-y-5 animate-fade-up">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Fidélité</h2>
                <p className="text-sm text-gray-500 mt-0.5">Configuration de votre programme de fidélité</p>
              </div>

              {/* Mode selector */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Mode de fidélité</h3>

                {loyaltySettings.mode_changed_at && (
                  <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 rounded-xl p-3.5 mb-4 text-sm text-warning-700">
                    <span className="text-base flex-shrink-0">⚠️</span>
                    <p>
                      <strong>Transition en cours</strong> — Les clients ayant des{' '}
                      {loyaltySettings.previous_program_type === 'points' ? 'points' : 'tampons'} avant le{' '}
                      {new Date(loyaltySettings.mode_changed_at).toLocaleDateString('fr-BE')}{' '}
                      continuent sur l&apos;ancien mode jusqu&apos;à leur récompense.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: 'points', icon: '💰', title: 'Points', desc: 'Chaque scan ajoute X points. Récompense à X points cumulés.', example: 'Ex: 1 scan = 5 pts → Café offert à 50 pts' },
                    { id: 'stamps', icon: '⬤',  title: 'Tampons', desc: 'Chaque scan = 1 tampon. Récompense quand la carte est pleine.', example: 'Ex: 1 scan = 1 tampon → Offert au 10ème' },
                  ].map(mode => {
                    const isActive = loyaltySettings.program_type === mode.id;
                    return (
                      <div
                        key={mode.id}
                        onClick={() => {
                          if (mode.id !== loyaltySettings.program_type) {
                            setLoyaltySettings(s => ({
                              ...s,
                              previous_program_type: s.program_type,
                              program_type: mode.id as 'points' | 'stamps',
                              mode_changed_at: new Date().toISOString(),
                            }));
                          }
                        }}
                        className={[
                          'rounded-xl p-4 cursor-pointer border-2 transition-all duration-150',
                          isActive
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-gray-200 bg-white hover:border-gray-300',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{mode.icon}</span>
                          <span className="font-bold text-gray-900">{mode.title}</span>
                          {isActive && (
                            <Badge variant="info" className="ml-auto">ACTIF</Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed mb-1">{mode.desc}</p>
                        <p className="text-xs text-gray-400 italic">{mode.example}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Config + Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Config form */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-5">Configuration</h3>
                  <div className="space-y-4">
                    {loyaltySettings.program_type === 'points' ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Points par scan en caisse</label>
                          <input
                            type="number" min="1"
                            value={loyaltySettings.points_per_scan}
                            onChange={e => setLoyaltySettings(s => ({ ...s, points_per_scan: parseInt(e.target.value) || 1 }))}
                            className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Récompense à partir de (points)</label>
                          <input
                            type="number" min="1"
                            value={loyaltySettings.reward_threshold}
                            onChange={e => setLoyaltySettings(s => ({ ...s, reward_threshold: parseInt(e.target.value) || 100 }))}
                            className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Nombre de tampons pour carte complète</label>
                        <input
                          type="number" min="1" max="20"
                          value={loyaltySettings.stamps_total}
                          onChange={e => setLoyaltySettings(s => ({ ...s, stamps_total: parseInt(e.target.value) || 10 }))}
                          className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                        />
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Array.from({ length: loyaltySettings.stamps_total }, (_, i) => (
                            <div
                              key={i}
                              className={`w-7 h-7 rounded-full border-2 ${i < 3 ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Aperçu — 3 tampons sur {loyaltySettings.stamps_total}</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Message récompense</label>
                      <input
                        type="text"
                        value={loyaltySettings.reward_message}
                        onChange={e => setLoyaltySettings(s => ({ ...s, reward_message: e.target.value }))}
                        placeholder="Ex: Café offert !"
                        className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                      />
                    </div>

                    <button
                      onClick={saveLoyaltySettings}
                      disabled={savingSettings}
                      className="w-full py-3 rounded-xl text-sm font-semibold transition-all bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {savingSettings
                        ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-ds-spin" />Sauvegarde...</>
                        : '✓ Sauvegarder'}
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex flex-col gap-4">
                  {(loyaltySettings.program_type === 'stamps' ? [
                    { label: 'Cartes complètes ce mois', value: transactions.filter(t => { const d = new Date(t.created_at); return t.type === 'reward_redeem' && d.getMonth() === today.getMonth(); }).length, icon: '🏆', bg: 'bg-warning-100', text: 'text-warning-700' },
                    { label: 'Tampons distribués total',  value: transactions.filter(t => t.type === 'visit').length, icon: '⬤', bg: 'bg-success-50', text: 'text-success-700' },
                    { label: 'Clients en cours de carte', value: customers.filter(c => (c.stamps_count ?? 0) > 0 && (c.stamps_count ?? 0) < loyaltySettings.stamps_total).length, icon: '📋', bg: 'bg-primary-50', text: 'text-primary-700' },
                  ] : [
                    { label: 'Points totaux distribués',  value: transactions.filter(t => t.points_delta > 0).reduce((a, t) => a + t.points_delta, 0), icon: '🎯', bg: 'bg-primary-50', text: 'text-primary-700' },
                    { label: 'Clients proches récompense',value: nearReward.length, icon: '🏆', bg: 'bg-success-50', text: 'text-success-700' },
                    { label: 'Points en circulation',     value: customers.reduce((a, c) => a + c.total_points, 0), icon: '💎', bg: 'bg-purple-50', text: 'text-purple-700' },
                  ]).map((stat, i) => (
                    <div key={i} className={`${stat.bg} rounded-xl p-4 flex items-center gap-4`}>
                      <span className="text-2xl flex-shrink-0">{stat.icon}</span>
                      <div>
                        <p className={`text-xl font-bold tabular-nums ${stat.text}`}>{stat.value}</p>
                        <p className={`text-xs ${stat.text} opacity-75`}>{stat.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ CAMPAIGNS ══════════════════════════════════ */}
          {activeTab === 'campaigns' && (
            <div className="space-y-5 animate-fade-up">
              {/* Header */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Campagnes</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Envoyez des emails ciblés à vos clients</p>
                </div>
                <button
                  onClick={() => {
                    setCampaignModal(true);
                    setCampaignPreview(false);
                    setNewCampaign({ name: '', type: 'custom', subject: '', body: '', segment: 'all', scheduled_at: '' });
                  }}
                  className="flex-shrink-0 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                >
                  + Nouvelle campagne
                </button>
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
                        {tpl.count} dest.
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
                      Utiliser ce template →
                    </button>
                  </div>
                ))}
              </div>

              {/* History table */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">Historique des campagnes</h3>
                </div>
                {sentCampaigns.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-4xl mb-3">📭</div>
                    <p className="text-sm text-gray-400 font-medium">Aucune campagne envoyée pour l&apos;instant</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        {['Nom', 'Type', 'Destinataires', 'Statut', 'Date'].map(h => (
                          <th key={h} className="px-4 py-3.5 text-left text-xs font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sentCampaigns.map(c => (
                        <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3.5 font-semibold text-gray-900">{c.name}</td>
                          <td className="px-4 py-3.5 text-gray-500">{c.type}</td>
                          <td className="px-4 py-3.5 text-gray-500 tabular-nums">{c.recipients_count}</td>
                          <td className="px-4 py-3.5">
                            <Badge
                              variant={c.status === 'sent' ? 'success' : c.status === 'failed' ? 'danger' : c.status === 'scheduled' ? 'scheduled' : 'neutral'}
                            >
                              {c.status === 'sent' ? '✓ Envoyée' : c.status === 'failed' ? '✗ Échouée' : c.status === 'scheduled' ? '⏰ Planifiée' : c.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">
                            {c.sent_at
                              ? new Date(c.sent_at).toLocaleDateString('fr-BE')
                              : c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('fr-BE') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Campaign Modal */}
              {campaignModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
                  <div className="bg-white rounded-2xl p-6 w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                    {campaignPreview ? (
                      /* Preview screen */
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-lg font-bold text-gray-900">Aperçu de la campagne</h2>
                          <button
                            onClick={() => setCampaignModal(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                          >✕</button>
                        </div>

                        {/* Subject preview */}
                        <div className="bg-gray-50 rounded-xl p-4 mb-4">
                          <p className="text-xs text-gray-500 mb-1">Sujet</p>
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
                            <p className="font-semibold text-gray-800 mb-3">Bonjour Marie 👋</p>
                            <p className="text-sm text-gray-600 leading-relaxed mb-4 whitespace-pre-line">
                              {newCampaign.body.replace(/\{\{prenom\}\}/gi, 'Marie').replace(/\{\{points\}\}/gi, '42').replace(/\{\{restaurant\}\}/gi, restaurant?.name ?? '')}
                            </p>
                            <div className="bg-success-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500">Solde actuel</p>
                              <p className="text-xl font-bold text-success-700 mt-0.5">42 pts</p>
                            </div>
                          </div>
                          <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 text-center">
                            <p className="text-xs text-gray-400">Propulsé par ReBites</p>
                          </div>
                        </div>

                        {/* Recipients info */}
                        <div className="bg-primary-50 rounded-xl p-3.5 mb-5 text-sm text-primary-700">
                          📤 Cet email sera envoyé à{' '}
                          <strong>{getSegmentCount(newCampaign.segment)} destinataire(s)</strong>
                          {newCampaign.scheduled_at && ` le ${new Date(newCampaign.scheduled_at).toLocaleDateString('fr-BE')}`}
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => setCampaignPreview(false)}
                            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
                          >
                            ← Modifier
                          </button>
                          <button
                            onClick={sendCampaign}
                            disabled={sendingCampaign}
                            className="flex-[2] bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                          >
                            {sendingCampaign
                              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-ds-spin" />Envoi en cours...</>
                              : newCampaign.scheduled_at ? '⏰ Planifier' : '🚀 Envoyer maintenant'}
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Campaign form */
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-lg font-bold text-gray-900">✉️ Créer une campagne</h2>
                          <button
                            onClick={() => setCampaignModal(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                          >✕</button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Nom de la campagne</label>
                            <input
                              value={newCampaign.name}
                              onChange={e => setNewCampaign(s => ({ ...s, name: e.target.value }))}
                              placeholder="Ex: Promo été 2025"
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Segment destinataires</label>
                            <select
                              value={newCampaign.segment}
                              onChange={e => setNewCampaign(s => ({ ...s, segment: e.target.value }))}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            >
                              <option value="all">Tous les clients ({totalCustomers})</option>
                              <option value="active">Clients actifs 30j ({activeCustomers})</option>
                              <option value="inactive_45">Inactifs 45j ({inactives45.length})</option>
                              <option value="birthday">Anniversaires cette semaine ({birthdaysSoon.length})</option>
                              <option value="near_reward">Proches récompense ({nearReward.length})</option>
                              <option value="vip">VIP ({customers.filter(c => getCustomerStatus(c) === 'vip').length})</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Sujet de l&apos;email</label>
                            <input
                              value={newCampaign.subject}
                              onChange={e => setNewCampaign(s => ({ ...s, subject: e.target.value }))}
                              placeholder="Ex: Une offre rien que pour vous {{prenom}} 🎁"
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              Corps du message
                              <span className="font-normal text-gray-400 ml-2">Variables: {`{{prenom}}`} {`{{points}}`} {`{{restaurant}}`}</span>
                            </label>
                            <textarea
                              value={newCampaign.body}
                              onChange={e => setNewCampaign(s => ({ ...s, body: e.target.value }))}
                              placeholder="Bonjour {{prenom}}, ..."
                              rows={5}
                              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl resize-y transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              Planifier l&apos;envoi <span className="font-normal text-gray-400">(optionnel)</span>
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
                          Aperçu avant envoi →
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ ANALYTICS ══════════════════════════════════ */}
          {activeTab === 'analytics' && (
            <div className="space-y-5 animate-fade-up">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
                <p className="text-sm text-gray-500 mt-0.5">Analyse approfondie de votre programme fidélité</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {[
                  {
                    label: 'Répartition clients',
                    items: [
                      { name: 'Actifs',   value: activeCustomers,  color: DS.success },
                      { name: 'Inactifs', value: inactiveCustomers, color: DS.danger },
                      { name: 'VIP',      value: customers.filter(c => getCustomerStatus(c) === 'vip').length, color: DS.warning },
                    ],
                  },
                  {
                    label: 'Croissance mensuelle',
                    items: [
                      { name: 'Nouveaux ce mois', value: newThisMonth,    color: DS.primary },
                      { name: 'Total clients',    value: totalCustomers,  color: DS.purple },
                      { name: 'Taux de retour',  value: `${returnRate}%`, color: DS.primary },
                    ],
                  },
                ].map((block, i) => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <h3 className="text-sm font-semibold text-gray-900 mb-5">{block.label}</h3>
                    {block.items.map((item, j) => (
                      <div key={j} className="flex items-center gap-3 mb-4 last:mb-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                        <span className="flex-1 text-sm text-gray-600">{item.name}</span>
                        <strong className="text-sm font-bold text-gray-900 tabular-nums">{item.value}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Auto insights */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Insights automatiques</h3>
                <div className="flex flex-col gap-3">
                  {[
                    returnRate > 50
                      ? `✅ Excellent taux de retour (${returnRate}%) — vos clients reviennent régulièrement.`
                      : `⚠️ Taux de retour faible (${returnRate}%) — lancez une campagne de re-engagement.`,
                    inactiveCustomers > 0
                      ? `📉 ${inactiveCustomers} clients inactifs depuis 45j représentent une opportunité de revenus.`
                      : `🎉 Aucun client inactif depuis 45 jours — excellent engagement !`,
                    newThisMonth > 0
                      ? `📈 ${newThisMonth} nouveau(x) client(s) ce mois — continuez sur cette lancée.`
                      : `💡 Aucun nouveau client ce mois. Pensez à partager votre lien d'inscription.`,
                  ].map((insight, i) => (
                    <div key={i} className="px-4 py-3.5 bg-gray-50 rounded-xl text-sm text-gray-700 leading-relaxed">
                      {insight}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ SETTINGS ═══════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="space-y-5 animate-fade-up">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Paramètres</h2>
                <p className="text-sm text-gray-500 mt-0.5">Gérez votre commerce et votre abonnement</p>
              </div>

              <div className="max-w-[560px] space-y-5">
                {/* Restaurant info */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-5">Informations du commerce</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'Nom',  value: restaurant?.name ?? '' },
                      { label: 'Slug', value: restaurant?.slug ?? '' },
                    ].map((field, i) => (
                      <div key={i}>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">{field.label}</label>
                        <input
                          defaultValue={field.value}
                          className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Logo */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Logo du commerce</h3>

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
                        {logoPreview ? logoFile?.name : restaurant?.logo_url ? 'Logo actuel' : 'Aucun logo'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">PNG, JPEG ou WebP · max 2 Mo</p>
                      {!restaurant?.logo_url && !logoPreview && (
                        <p className="text-xs text-amber-600 mt-1">⚠ Requis pour Google Wallet</p>
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
                        {logoFile ? logoFile.name : 'Choisir un fichier…'}
                      </span>
                    </label>
                    <button
                      onClick={uploadLogo}
                      disabled={!logoFile || logoUploading}
                      className="px-4 py-2.5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                    >
                      {logoUploading ? 'Envoi…' : 'Enregistrer'}
                    </button>
                  </div>

                  {logoError && (
                    <p className="mt-2 text-xs text-red-600">{logoError}</p>
                  )}
                  {logoSaved && (
                    <p className="mt-2 text-xs text-emerald-600">✓ Logo enregistré</p>
                  )}
                </div>

                {/* Plan info */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Abonnement</h3>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-semibold text-gray-900">
                        Plan {(restaurant?.plans?.name ?? restaurant?.plan)?.toUpperCase()}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {(restaurant?.plans?.key ?? restaurant?.plan) === 'free' ? 'Limité à 100 clients' : 'Clients illimités'}
                      </p>
                    </div>
                    {(restaurant?.plans?.key ?? restaurant?.plan) === 'free' && (
                      <button className="bg-gradient-to-r from-purple-600 to-primary-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                        Upgrader ✨
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
