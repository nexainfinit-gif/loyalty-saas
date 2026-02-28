/* eslint-disable @next/next/no-img-element */
'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

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
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
  logo_url: string | null;
  plan: string;
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

function getCustomerStatus(c: Customer): 'vip' | 'active' | 'inactive' {
  if (!c.last_visit_at) return 'inactive';
  const days = (Date.now() - new Date(c.last_visit_at).getTime()) / 86400000;
  if (days > 30) return 'inactive';
  if (c.total_points >= 100) return 'vip';
  return 'active';
}

function StatusBadge({ status }: { status: 'vip' | 'active' | 'inactive' }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    vip:      { bg: '#FFF7ED', color: '#C2410C', label: '⭐ VIP' },
    active:   { bg: '#F0FDF4', color: '#15803D', label: '✓ Actif' },
    inactive: { bg: '#F9FAFB', color: '#6B7280', label: '○ Inactif' },
  };
  const s = styles[status];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

const NOW = Date.now();
const TODAY = new Date();

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings>({
    points_per_scan: 1,
    reward_threshold: 100,
    reward_message: 'Récompense offerte !',
    program_type: 'points',
    stamps_total: 10,
    mode_changed_at: null,
    previous_program_type: null,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [campaignModal, setCampaignModal] = useState(false);
  const [campaignPreview, setCampaignPreview] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [sentCampaigns, setSentCampaigns] = useState<Campaign[]>([]);
  const [newCampaign, setNewCampaign] = useState({ name: '', type: 'custom', subject: '', body: '', segment: 'all', scheduled_at: '' });

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/dashboard/login'); return; }
      setSession(session);

      const { data: resto } = await supabase
        .from('restaurants').select('*')
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

  const now = NOW;
  const day30 = 30 * 86400000;
  const day45 = 45 * 86400000;
  const today = TODAY;

  const totalCustomers = customers.length;
  const newThisMonth = customers.filter(c => {
    const d = new Date(c.created_at);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;
  const activeCustomers = customers.filter(c => c.last_visit_at && (now - new Date(c.last_visit_at).getTime()) < day30).length;
  const inactiveCustomers = customers.filter(c => !c.last_visit_at || (now - new Date(c.last_visit_at).getTime()) > day45).length;
  const returnRate = totalCustomers > 0 ? Math.round((customers.filter(c => c.total_visits > 1).length / totalCustomers) * 100) : 0;
  const avgPoints = totalCustomers > 0 ? Math.round(customers.reduce((a, c) => a + c.total_points, 0) / totalCustomers) : 0;

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

  const inactives45 = customers.filter(c => !c.last_visit_at || (now - new Date(c.last_visit_at).getTime()) > day45);
  const in7days = new Date(); in7days.setDate(today.getDate() + 7);
  const birthdaysSoon = customers.filter(c => {
    if (!c.birth_date) return false;
    const b = new Date(c.birth_date);
    const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
    return next >= today && next <= in7days;
  });
  const nearReward = customers.filter(c => c.total_points >= (loyaltySettings.reward_threshold * 0.8) && c.total_points < loyaltySettings.reward_threshold);

  const filteredCustomers = customers.filter(c => {
    const matchSearch = search === '' || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(search.toLowerCase());
    const status = getCustomerStatus(c);
    const matchFilter =
      filter === 'all' ? true :
      filter === 'inactive' ? status === 'inactive' :
      filter === 'vip' ? status === 'vip' :
      filter === 'birthday' ? (() => { if (!c.birth_date) return false; const b = new Date(c.birth_date); return b.getMonth() === today.getMonth(); })() :
      filter === 'new' ? new Date(c.created_at) >= new Date(today.getFullYear(), today.getMonth(), 1) : true;
    return matchSearch && matchFilter;
  });

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

  function getSegmentCount(segment: string): number {
    switch (segment) {
      case 'inactive_45': return inactives45.length;
      case 'birthday': return birthdaysSoon.length;
      case 'near_reward': return nearReward.length;
      case 'active': return activeCustomers;
      case 'vip': return customers.filter(c => getCustomerStatus(c) === 'vip').length;
      default: return totalCustomers;
    }
  }

  async function sendCampaign() {
    if (!session) return;
    setSendingCampaign(true);
    try {
      const res = await fetch('/api/campaigns', {
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
        alert(data.scheduled ? `Campagne planifiée !` : `${data.sent} email(s) envoyé(s) avec succès !`);
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

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F9FA' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
        <p style={{ color: '#9CA3AF', fontFamily: 'system-ui' }}>Chargement...</p>
      </div>
    </div>
  );

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: 'overview',  icon: '▦',  label: "Vue d'ensemble" },
    { id: 'clients',   icon: '👥', label: 'Clients' },
    { id: 'loyalty',   icon: '🎁', label: 'Fidélité' },
    { id: 'campaigns', icon: '📢', label: 'Campagnes' },
    { id: 'analytics', icon: '📈', label: 'Analytics' },
    { id: 'settings',  icon: '⚙️', label: 'Paramètres' },
  ];

  const planColors: Record<string, string> = { free: '#6B7280', starter: '#2563EB', pro: '#7C3AED' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif", background: '#F8F9FA' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 999px; }
        .nav-item { transition: all 0.15s ease; cursor: pointer; }
        .nav-item:hover { background: rgba(255,255,255,0.08) !important; }
        .nav-item.active { background: rgba(255,255,255,0.12) !important; }
        .kpi-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08) !important; }
        .action-btn { transition: all 0.15s ease; cursor: pointer; border: none; }
        .action-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .tab-content { animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        table tr { transition: background 0.1s; }
        table tr:hover td { background: #F9FAFB; }
        input, select, textarea { outline: none; font-family: 'DM Sans', sans-serif; }
        input:focus, select:focus, textarea:focus { border-color: #111 !important; }
        .mode-card { transition: all 0.15s ease; cursor: pointer; }
        .mode-card:hover { border-color: #6B7280 !important; }
      `}</style>

      {/* Sidebar */}
      <aside style={{ width: sidebarOpen ? '240px' : '68px', background: '#111827', display: 'flex', flexDirection: 'column', transition: 'width 0.25s ease', overflow: 'hidden', flexShrink: 0, position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '1.5rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: restaurant?.primary_color ?? '#FF6B35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
              {restaurant?.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px' }} /> : '🍽️'}
            </div>
            {sidebarOpen && (
              <div style={{ overflow: 'hidden' }}>
                <p style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{restaurant?.name}</p>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: planColors[restaurant?.plan ?? 'free'], background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '4px' }}>
                  {restaurant?.plan ?? 'free'}
                </span>
              </div>
            )}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {navItems.map(item => (
            <div key={item.id} className={`nav-item ${activeTab === item.id ? 'active' : ''}`} onClick={() => setActiveTab(item.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: '10px', color: activeTab === item.id ? 'white' : 'rgba(255,255,255,0.45)' }}>
              <span style={{ fontSize: '1rem', flexShrink: 0, width: '20px', textAlign: 'center' }}>{item.icon}</span>
              {sidebarOpen && <span style={{ fontSize: '0.85rem', fontWeight: activeTab === item.id ? 600 : 400, whiteSpace: 'nowrap' }}>{item.label}</span>}
            </div>
          ))}
          <a href="/dashboard/scanner"
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: '10px', color: 'rgba(255,255,255,0.45)', textDecoration: 'none', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '1rem', flexShrink: 0, width: '20px', textAlign: 'center' }}>📷</span>
            {sidebarOpen && <span style={{ fontSize: '0.85rem' }}>Scanner QR</span>}
          </a>
        </nav>

        <div style={{ padding: '0.75rem 0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {sidebarOpen && restaurant?.plan === 'free' && (
            <div style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)', borderRadius: '12px', padding: '0.875rem', marginBottom: '0.5rem' }}>
              <p style={{ color: 'white', fontSize: '0.78rem', fontWeight: 600, margin: '0 0 0.25rem' }}>Passer à Pro</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', margin: '0 0 0.5rem' }}>Campagnes illimitées + Analytics</p>
              <button className="action-btn" style={{ background: 'white', color: '#7C3AED', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, width: '100%' }}>Upgrader ✨</button>
            </div>
          )}
          <div className="nav-item" onClick={handleSignOut}
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
            <span style={{ flexShrink: 0, width: '20px', textAlign: 'center' }}>↩</span>
            {sidebarOpen && <span style={{ fontSize: '0.85rem' }}>Déconnexion</span>}
          </div>
        </div>

        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ position: 'absolute', top: '50%', right: '-12px', transform: 'translateY(-50%)', width: '24px', height: '24px', borderRadius: '50%', background: '#374151', border: '2px solid #111827', color: 'white', fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {sidebarOpen ? '←' : '→'}
        </button>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: '2rem' }}>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="tab-content">
            <div style={{ marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.25rem', fontFamily: "'Playfair Display', serif" }}>Vue d&apos;ensemble</h1>
              <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>{today.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Clients totaux', value: totalCustomers, icon: '👥', color: '#2563EB' },
                { label: 'Nouveaux ce mois', value: newThisMonth, icon: '➕', color: '#16A34A' },
                { label: 'Actifs 30 jours', value: activeCustomers, icon: '⭐', color: '#D97706' },
                { label: 'Taux de retour', value: `${returnRate}%`, icon: '🔁', color: '#7C3AED' },
                { label: 'Points moyens', value: avgPoints, icon: '💰', color: '#0891B2' },
                { label: 'Inactifs 45j', value: inactiveCustomers, icon: '📉', color: '#DC2626' },
              ].map((kpi, i) => (
                <div key={i} className="kpi-card" style={{ background: 'white', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>{kpi.icon}</span>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: kpi.color, marginTop: '4px' }} />
                  </div>
                  <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 0.25rem', color: '#111827' }}>{kpi.value}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: 0 }}>{kpi.label}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1.25rem', color: '#111827' }}>Activité — 30 derniers jours</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorClients" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15}/><stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPoints" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.15}/><stop offset="95%" stopColor="#7C3AED" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} interval={6} />
                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
                    <Area type="monotone" dataKey="Nouveaux clients" stroke="#2563EB" strokeWidth={2} fill="url(#colorClients)" />
                    <Area type="monotone" dataKey="Points" stroke="#7C3AED" strokeWidth={2} fill="url(#colorPoints)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem', color: '#111827' }}>🎯 Opportunités du mois</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { count: inactives45.length, label: 'clients inactifs depuis 45j', color: '#FEF3C7', textColor: '#92400E', icon: '😴', cta: 'Relancer' },
                    { count: birthdaysSoon.length, label: 'anniversaires cette semaine', color: '#FCE7F3', textColor: '#9D174D', icon: '🎂', cta: 'Envoyer vœux' },
                    { count: nearReward.length, label: "clients proches d'une récompense", color: '#ECFDF5', textColor: '#065F46', icon: '🏆', cta: 'Notifier' },
                  ].map((opp, i) => (
                    <div key={i} style={{ background: opp.color, borderRadius: '12px', padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.3rem' }}>{opp.icon}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: opp.textColor }}>{opp.count}</p>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: opp.textColor, opacity: 0.8 }}>{opp.label}</p>
                      </div>
                      <button className="action-btn" onClick={() => setActiveTab('campaigns')}
                        style={{ background: opp.textColor, color: 'white', padding: '0.35rem 0.7rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600 }}>{opp.cta}</button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '1rem', padding: '0.875rem', background: '#F0F9FF', borderRadius: '12px', borderLeft: '3px solid #2563EB' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#1E40AF', lineHeight: 1.5 }}>
                    💡 <strong>Insight :</strong> {returnRate > 50 ? `${returnRate}% de vos clients reviennent — excellent !` : `Votre taux de retour est de ${returnRate}%. Lancez une campagne de re-engagement.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CLIENTS */}
        {activeTab === 'clients' && (
          <div className="tab-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.25rem', fontFamily: "'Playfair Display', serif" }}>Clients</h1>
                <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>{filteredCustomers.length} résultat(s)</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un client..."
                style={{ flex: 1, minWidth: '200px', padding: '0.75rem 1rem', borderRadius: '12px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem', background: 'white' }} />
              {[
                { id: 'all', label: 'Tous' },
                { id: 'inactive', label: '😴 Inactifs 30j' },
                { id: 'vip', label: '⭐ VIP' },
                { id: 'birthday', label: '🎂 Anniversaire' },
                { id: 'new', label: '➕ Nouveaux' },
              ].map(f => (
                <button key={f.id} className="action-btn" onClick={() => setFilter(f.id)}
                  style={{ padding: '0.65rem 1rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 500, background: filter === f.id ? '#111827' : 'white', color: filter === f.id ? 'white' : '#6B7280', border: `1.5px solid ${filter === f.id ? '#111827' : '#E5E7EB'}` }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                    {['Nom', 'Email', loyaltySettings.program_type === 'stamps' ? 'Tampons' : 'Points', 'Visites', 'Dernière visite', 'Statut', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '0.875rem 1rem', textAlign: 'left', color: '#6B7280', fontWeight: 500, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>Aucun client trouvé</td></tr>
                  )}
                  {filteredCustomers.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 500, color: '#111827' }}>{c.first_name} {c.last_name}</td>
                      <td style={{ padding: '0.875rem 1rem', color: '#6B7280' }}>{c.email}</td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        {loyaltySettings.program_type === 'stamps' ? (
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {Array.from({ length: loyaltySettings.stamps_total }, (_, i) => (
                              <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', border: '1.5px solid #111827', background: i < (c.stamps_count ?? 0) ? '#111827' : 'transparent' }} />
                            ))}
                          </div>
                        ) : (
                          <span style={{ background: '#F0FDF4', color: '#15803D', padding: '2px 8px', borderRadius: '999px', fontWeight: 600, fontSize: '0.78rem' }}>{c.total_points} pts</span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#6B7280' }}>{c.total_visits}</td>
                      <td style={{ padding: '0.875rem 1rem', color: '#6B7280' }}>{c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('fr-BE') : '—'}</td>
                      <td style={{ padding: '0.875rem 1rem' }}><StatusBadge status={getCustomerStatus(c)} /></td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className="action-btn" onClick={() => addPoint(c.id, 1)}
                            style={{ background: '#111827', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>+1</button>
                          <button className="action-btn" onClick={() => addPoint(c.id, -1)}
                            style={{ background: '#F3F4F6', color: '#374151', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>−1</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LOYALTY */}
        {activeTab === 'loyalty' && (
          <div className="tab-content">
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.25rem', fontFamily: "'Playfair Display', serif" }}>Fidélité</h1>
            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: '0 0 2rem' }}>Configuration de votre programme de fidélité</p>
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6', marginBottom: '1.25rem' }}>
              <h3 style={{ fontWeight: 600, margin: '0 0 1rem', fontSize: '1rem' }}>🎯 Mode de fidélité</h3>
              {loyaltySettings.mode_changed_at && (
                <div style={{ background: '#FEF3C7', borderRadius: '10px', padding: '0.875rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#92400E' }}>
                  ⚠️ <strong>Transition en cours</strong> — Les clients ayant des {loyaltySettings.previous_program_type === 'points' ? 'points' : 'tampons'} avant le {new Date(loyaltySettings.mode_changed_at).toLocaleDateString('fr-BE')} continuent sur l&apos;ancien mode jusqu&apos;à leur récompense.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {[
                  { id: 'points', icon: '💰', title: 'Points', desc: 'Chaque scan ajoute X points. Récompense à X points cumulés.', example: 'Ex: 1 scan = 5 pts → Café offert à 50 pts' },
                  { id: 'stamps', icon: '⬤', title: 'Tampons', desc: 'Chaque scan = 1 tampon. Récompense quand la carte est pleine.', example: 'Ex: 1 scan = 1 tampon → Offert au 10ème' },
                ].map(mode => (
                  <div key={mode.id} className="mode-card"
                    onClick={() => { if (mode.id !== loyaltySettings.program_type) { setLoyaltySettings(s => ({ ...s, previous_program_type: s.program_type, program_type: mode.id as 'points' | 'stamps', mode_changed_at: new Date().toISOString() })); } }}
                    style={{ border: `2px solid ${loyaltySettings.program_type === mode.id ? '#111827' : '#E5E7EB'}`, borderRadius: '14px', padding: '1.25rem', background: loyaltySettings.program_type === mode.id ? '#F9FAFB' : 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>{mode.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>{mode.title}</span>
                      {loyaltySettings.program_type === mode.id && (
                        <span style={{ marginLeft: 'auto', background: '#111827', color: 'white', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>ACTIF</span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#6B7280', margin: '0 0 0.4rem', lineHeight: 1.5 }}>{mode.desc}</p>
                    <p style={{ fontSize: '0.72rem', color: '#9CA3AF', margin: 0, fontStyle: 'italic' }}>{mode.example}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                <h3 style={{ fontWeight: 600, margin: '0 0 1.25rem', fontSize: '1rem' }}>⚙️ Configuration</h3>
                {loyaltySettings.program_type === 'points' ? (
                  <>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Points par scan en caisse</label>
                      <input type="number" min="1" value={loyaltySettings.points_per_scan} onChange={e => setLoyaltySettings(s => ({ ...s, points_per_scan: parseInt(e.target.value) || 1 }))}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Récompense à partir de (points)</label>
                      <input type="number" min="1" value={loyaltySettings.reward_threshold} onChange={e => setLoyaltySettings(s => ({ ...s, reward_threshold: parseInt(e.target.value) || 100 }))}
                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                    </div>
                  </>
                ) : (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Nombre de tampons pour carte complète</label>
                    <input type="number" min="1" max="20" value={loyaltySettings.stamps_total} onChange={e => setLoyaltySettings(s => ({ ...s, stamps_total: parseInt(e.target.value) || 10 }))}
                      style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.875rem' }}>
                      {Array.from({ length: loyaltySettings.stamps_total }, (_, i) => (
                        <div key={i} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #111827', background: i < 3 ? '#111827' : 'transparent' }} />
                      ))}
                    </div>
                    <p style={{ fontSize: '0.72rem', color: '#9CA3AF', margin: '0.5rem 0 0' }}>Aperçu — 3 tampons sur {loyaltySettings.stamps_total}</p>
                  </div>
                )}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Message récompense</label>
                  <input type="text" value={loyaltySettings.reward_message} onChange={e => setLoyaltySettings(s => ({ ...s, reward_message: e.target.value }))}
                    placeholder="Ex: Café offert !"
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                </div>
                <button className="action-btn" onClick={saveLoyaltySettings} disabled={savingSettings}
                  style={{ background: savingSettings ? '#9CA3AF' : '#111827', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, width: '100%' }}>
                  {savingSettings ? '⏳ Sauvegarde...' : '✓ Sauvegarder'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {loyaltySettings.program_type === 'stamps' ? (
                  <>
                    {[
                      { label: 'Cartes complètes ce mois', value: transactions.filter(t => { const d = new Date(t.created_at); return t.type === 'reward_redeem' && d.getMonth() === today.getMonth(); }).length, icon: '🏆', color: '#FEF3C7', textColor: '#92400E' },
                      { label: 'Tampons distribués total', value: transactions.filter(t => t.type === 'visit').length, icon: '⬤', color: '#F0FDF4', textColor: '#15803D' },
                      { label: 'Clients en cours de carte', value: customers.filter(c => (c.stamps_count ?? 0) > 0 && (c.stamps_count ?? 0) < loyaltySettings.stamps_total).length, icon: '📋', color: '#EFF6FF', textColor: '#1D4ED8' },
                    ].map((stat, i) => (
                      <div key={i} style={{ background: stat.color, borderRadius: '16px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                        <div>
                          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: stat.textColor }}>{stat.value}</p>
                          <p style={{ fontSize: '0.78rem', margin: 0, color: stat.textColor, opacity: 0.75 }}>{stat.label}</p>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {[
                      { label: 'Points totaux distribués', value: transactions.filter(t => t.points_delta > 0).reduce((a, t) => a + t.points_delta, 0), icon: '🎯', color: '#EFF6FF', textColor: '#1D4ED8' },
                      { label: 'Clients proches récompense', value: nearReward.length, icon: '🏆', color: '#ECFDF5', textColor: '#065F46' },
                      { label: 'Points en circulation', value: customers.reduce((a, c) => a + c.total_points, 0), icon: '💎', color: '#F5F3FF', textColor: '#5B21B6' },
                    ].map((stat, i) => (
                      <div key={i} style={{ background: stat.color, borderRadius: '16px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                        <div>
                          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: stat.textColor }}>{stat.value}</p>
                          <p style={{ fontSize: '0.78rem', margin: 0, color: stat.textColor, opacity: 0.75 }}>{stat.label}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CAMPAIGNS */}
        {activeTab === 'campaigns' && (
          <div className="tab-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.25rem', fontFamily: "'Playfair Display', serif" }}>Campagnes</h1>
                <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>Envoyez des emails ciblés à vos clients</p>
              </div>
              <button className="action-btn"
                onClick={() => { setCampaignModal(true); setCampaignPreview(false); setNewCampaign({ name: '', type: 'custom', subject: '', body: '', segment: 'all', scheduled_at: '' }); }}
                style={{ background: '#111827', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600 }}>
                + Nouvelle campagne
              </button>
            </div>

            {/* Templates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {[
                { type: 'reengagement', name: 'Re-engagement inactifs', segment: 'inactive_45', icon: '😴', color: '#FEF3C7', textColor: '#92400E', count: inactives45.length, subject: 'On vous manque, {{prenom}} 💛', body: "Cela fait un moment qu'on ne vous a pas vu chez {{restaurant}}.\n\nVous avez encore {{points}} points qui vous attendent ! Venez les utiliser — on a hâte de vous revoir." },
                { type: 'birthday', name: 'Vœux anniversaire', segment: 'birthday', icon: '🎂', color: '#FCE7F3', textColor: '#9D174D', count: birthdaysSoon.length, subject: 'Joyeux anniversaire {{prenom}} 🎂', body: "Toute l'équipe de {{restaurant}} vous souhaite un très joyeux anniversaire !\n\nPour fêter ça, venez nous rendre visite — on a une surprise pour vous 🎁" },
                { type: 'near_reward', name: 'Récompense proche', segment: 'near_reward', icon: '🏆', color: '#ECFDF5', textColor: '#065F46', count: nearReward.length, subject: 'Vous y êtes presque, {{prenom}} 🏆', body: "Bonne nouvelle ! Avec vos {{points}} points, vous n'êtes plus très loin de votre récompense chez {{restaurant}}.\n\nEncore quelques visites et c'est dans la poche !" },
                { type: 'double_points', name: 'Double points', segment: 'all', icon: '⚡', color: '#EFF6FF', textColor: '#1D4ED8', count: totalCustomers, subject: 'Double points chez {{restaurant}} cette semaine 🎉', body: "Cette semaine seulement, gagnez le double de points à chaque visite chez {{restaurant}} !\n\nProfitez-en vite, l'offre est limitée dans le temps 🚀" },
                { type: 'promo', name: 'Offre spéciale', segment: 'all', icon: '🎁', color: '#F5F3FF', textColor: '#5B21B6', count: totalCustomers, subject: 'Une offre rien que pour vous, {{prenom}} 🎁', body: "Cher(e) {{prenom}},\n\nNous avons une offre exclusive pour vous chez {{restaurant}}.\n\nVenez nous voir pour en profiter !" },
                { type: 'custom', name: 'Message libre', segment: 'all', icon: '✏️', color: '#F9FAFB', textColor: '#374151', count: totalCustomers, subject: '', body: '' },
              ].map((tpl, i) => (
                <div key={i} style={{ background: 'white', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{tpl.icon}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#111827' }}>{tpl.name}</span>
                    </div>
                    <span style={{ background: tpl.color, color: tpl.textColor, fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>{tpl.count} dest.</span>
                  </div>
                  <button className="action-btn"
                    onClick={() => { setNewCampaign({ name: tpl.name, type: tpl.type, subject: tpl.subject, body: tpl.body, segment: tpl.segment, scheduled_at: '' }); setCampaignPreview(false); setCampaignModal(true); }}
                    style={{ background: '#111827', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, width: '100%' }}>
                    Utiliser ce template →
                  </button>
                </div>
              ))}
            </div>

            {/* Historique */}
            <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F3F4F6' }}>
                <h3 style={{ fontWeight: 600, margin: 0, fontSize: '0.95rem' }}>📋 Historique des campagnes</h3>
              </div>
              {sentCampaigns.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>📭</p>
                  <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0 }}>Aucune campagne envoyée pour l&apos;instant</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                      {['Nom', 'Type', 'Destinataires', 'Statut', 'Date'].map(h => (
                        <th key={h} style={{ padding: '0.875rem 1rem', textAlign: 'left', color: '#6B7280', fontWeight: 500, fontSize: '0.78rem' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sentCampaigns.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '0.875rem 1rem', fontWeight: 500, color: '#111827' }}>{c.name}</td>
                        <td style={{ padding: '0.875rem 1rem', color: '#6B7280' }}>{c.type}</td>
                        <td style={{ padding: '0.875rem 1rem', color: '#6B7280' }}>{c.recipients_count}</td>
                        <td style={{ padding: '0.875rem 1rem' }}>
                          <span style={{
                            background: c.status === 'sent' ? '#F0FDF4' : c.status === 'failed' ? '#FEF2F2' : c.status === 'scheduled' ? '#EFF6FF' : '#F9FAFB',
                            color: c.status === 'sent' ? '#15803D' : c.status === 'failed' ? '#DC2626' : c.status === 'scheduled' ? '#2563EB' : '#6B7280',
                            padding: '2px 10px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                          }}>
                            {c.status === 'sent' ? '✓ Envoyée' : c.status === 'failed' ? '✗ Échouée' : c.status === 'scheduled' ? '⏰ Planifiée' : c.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', color: '#6B7280' }}>
                          {c.sent_at ? new Date(c.sent_at).toLocaleDateString('fr-BE') : c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('fr-BE') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal */}
            {campaignModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                  {campaignPreview ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontWeight: 700, margin: 0, fontSize: '1.1rem' }}>👁️ Aperçu de la campagne</h2>
                        <button onClick={() => setCampaignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6B7280' }}>✕</button>
                      </div>
                      <div style={{ background: '#F8F9FA', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
                        <p style={{ fontSize: '0.78rem', color: '#6B7280', margin: '0 0 0.25rem' }}>Sujet</p>
                        <p style={{ fontWeight: 600, margin: 0, color: '#111827' }}>{newCampaign.subject.replace(/\{\{prenom\}\}/gi, 'Marie').replace(/\{\{restaurant\}\}/gi, restaurant?.name ?? '')}</p>
                      </div>
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.25rem' }}>
                        <div style={{ background: restaurant?.primary_color ?? '#FF6B35', padding: '1.25rem', textAlign: 'center' }}>
                          <p style={{ color: 'white', fontWeight: 700, margin: 0 }}>{restaurant?.name}</p>
                        </div>
                        <div style={{ padding: '1.25rem', background: 'white' }}>
                          <p style={{ fontWeight: 600, margin: '0 0 0.75rem', color: '#374151' }}>Bonjour Marie 👋</p>
                          <p style={{ color: '#374151', lineHeight: 1.7, margin: '0 0 1rem', fontSize: '0.875rem', whiteSpace: 'pre-line' }}>
                            {newCampaign.body.replace(/\{\{prenom\}\}/gi, 'Marie').replace(/\{\{points\}\}/gi, '42').replace(/\{\{restaurant\}\}/gi, restaurant?.name ?? '')}
                          </p>
                          <div style={{ background: '#F0FDF4', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>Solde actuel</p>
                            <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#15803D', fontSize: '1.25rem' }}>42 pts</p>
                          </div>
                        </div>
                        <div style={{ background: '#F9FAFB', padding: '0.875rem', textAlign: 'center', borderTop: '1px solid #F3F4F6' }}>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: '#9CA3AF' }}>Propulsé par ReBites</p>
                        </div>
                      </div>
                      <div style={{ background: '#F0F9FF', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#1E40AF' }}>
                          📤 Cet email sera envoyé à <strong>{getSegmentCount(newCampaign.segment)} destinataire(s)</strong>
                          {newCampaign.scheduled_at && ` le ${new Date(newCampaign.scheduled_at).toLocaleDateString('fr-BE')}`}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button onClick={() => setCampaignPreview(false)} className="action-btn"
                          style={{ flex: 1, background: '#F3F4F6', color: '#374151', padding: '0.875rem', borderRadius: '10px', fontWeight: 600, fontSize: '0.875rem' }}>
                          ← Modifier
                        </button>
                        <button onClick={sendCampaign} disabled={sendingCampaign} className="action-btn"
                          style={{ flex: 2, background: sendingCampaign ? '#9CA3AF' : '#111827', color: 'white', padding: '0.875rem', borderRadius: '10px', fontWeight: 600, fontSize: '0.875rem' }}>
                          {sendingCampaign ? '⏳ Envoi en cours...' : newCampaign.scheduled_at ? '⏰ Planifier' : '🚀 Envoyer maintenant'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h2 style={{ fontWeight: 700, margin: 0, fontSize: '1.1rem' }}>✉️ Créer une campagne</h2>
                        <button onClick={() => setCampaignModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6B7280' }}>✕</button>
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Nom de la campagne</label>
                        <input value={newCampaign.name} onChange={e => setNewCampaign(s => ({ ...s, name: e.target.value }))} placeholder="Ex: Promo été 2025"
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Segment destinataires</label>
                        <select value={newCampaign.segment} onChange={e => setNewCampaign(s => ({ ...s, segment: e.target.value }))}
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem', background: 'white' }}>
                          <option value="all">Tous les clients ({totalCustomers})</option>
                          <option value="active">Clients actifs 30j ({activeCustomers})</option>
                          <option value="inactive_45">Inactifs 45j ({inactives45.length})</option>
                          <option value="birthday">Anniversaires cette semaine ({birthdaysSoon.length})</option>
                          <option value="near_reward">Proches récompense ({nearReward.length})</option>
                          <option value="vip">VIP ({customers.filter(c => getCustomerStatus(c) === 'vip').length})</option>
                        </select>
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Sujet de l&apos;email</label>
                        <input value={newCampaign.subject} onChange={e => setNewCampaign(s => ({ ...s, subject: e.target.value }))} placeholder="Ex: Une offre rien que pour vous {{prenom}} 🎁"
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>
                          Corps du message
                          <span style={{ fontWeight: 400, marginLeft: '0.5rem', color: '#9CA3AF' }}>Variables: {`{{prenom}}`} {`{{points}}`} {`{{restaurant}}`}</span>
                        </label>
                        <textarea value={newCampaign.body} onChange={e => setNewCampaign(s => ({ ...s, body: e.target.value }))} placeholder="Bonjour {{prenom}}, ..." rows={5}
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem', resize: 'vertical', fontFamily: "'DM Sans', sans-serif" }} />
                      </div>
                      <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>
                          Planifier l&apos;envoi <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optionnel)</span>
                        </label>
                        <input type="datetime-local" value={newCampaign.scheduled_at} onChange={e => setNewCampaign(s => ({ ...s, scheduled_at: e.target.value }))}
                          style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                      </div>
                      <button onClick={() => setCampaignPreview(true)} disabled={!newCampaign.name || !newCampaign.subject || !newCampaign.body} className="action-btn"
                        style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', background: !newCampaign.name || !newCampaign.subject || !newCampaign.body ? '#E5E7EB' : '#111827', color: !newCampaign.name || !newCampaign.subject || !newCampaign.body ? '#9CA3AF' : 'white', fontWeight: 600, fontSize: '0.875rem' }}>
                        Aperçu avant envoi →
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="tab-content">
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.25rem', fontFamily: "'Playfair Display', serif" }}>Analytics</h1>
            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: '0 0 2rem' }}>Analyse approfondie de votre programme fidélité</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {[
                { label: 'Répartition clients', items: [{ name: 'Actifs', value: activeCustomers, color: '#16A34A' }, { name: 'Inactifs', value: inactiveCustomers, color: '#DC2626' }, { name: 'VIP', value: customers.filter(c => getCustomerStatus(c) === 'vip').length, color: '#D97706' }] },
                { label: 'Croissance mensuelle', items: [{ name: 'Nouveaux ce mois', value: newThisMonth, color: '#2563EB' }, { name: 'Total clients', value: totalCustomers, color: '#7C3AED' }, { name: 'Taux de retour', value: `${returnRate}%`, color: '#0891B2' }] },
              ].map((block, i) => (
                <div key={i} style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                  <h3 style={{ fontWeight: 600, margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#111827' }}>{block.label}</h3>
                  {block.items.map((item, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.85rem', color: '#374151' }}>{item.name}</span>
                      <strong style={{ fontSize: '0.95rem', color: '#111827' }}>{item.value}</strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1.25rem', background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
              <h3 style={{ fontWeight: 600, margin: '0 0 0.5rem', fontSize: '0.95rem' }}>🤖 Insights automatiques</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                {[
                  returnRate > 50 ? `✅ Excellent taux de retour (${returnRate}%) — vos clients reviennent régulièrement.` : `⚠️ Taux de retour faible (${returnRate}%) — lancez une campagne de re-engagement.`,
                  inactiveCustomers > 0 ? `📉 ${inactiveCustomers} clients inactifs depuis 45j représentent une opportunité de revenus.` : `🎉 Aucun client inactif depuis 45 jours — excellent engagement !`,
                  newThisMonth > 0 ? `📈 ${newThisMonth} nouveau(x) client(s) ce mois — continuez sur cette lancée.` : `💡 Aucun nouveau client ce mois. Pensez à partager votre lien d'inscription.`,
                ].map((insight, i) => (
                  <div key={i} style={{ padding: '0.875rem 1rem', background: '#F8F9FA', borderRadius: '10px', fontSize: '0.85rem', color: '#374151', lineHeight: 1.6 }}>{insight}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && (
          <div className="tab-content">
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.25rem', fontFamily: "'Playfair Display', serif" }}>Paramètres</h1>
            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: '0 0 2rem' }}>Gérez votre commerce et votre abonnement</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '560px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                <h3 style={{ fontWeight: 600, margin: '0 0 1.25rem', fontSize: '1rem' }}>🏪 Informations du commerce</h3>
                {[{ label: 'Nom', value: restaurant?.name ?? '' }, { label: 'Slug', value: restaurant?.slug ?? '' }].map((field, i) => (
                  <div key={i} style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>{field.label}</label>
                    <input defaultValue={field.value} style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem' }} />
                  </div>
                ))}
              </div>
              <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
                <h3 style={{ fontWeight: 600, margin: '0 0 1rem', fontSize: '1rem' }}>💳 Abonnement</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: '#F9FAFB', borderRadius: '12px' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: '#111827' }}>Plan {restaurant?.plan?.toUpperCase()}</p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B7280' }}>{restaurant?.plan === 'free' ? 'Limité à 100 clients' : 'Clients illimités'}</p>
                  </div>
                  {restaurant?.plan === 'free' && (
                    <button className="action-btn" style={{ background: 'linear-gradient(135deg, #7C3AED, #2563EB)', color: 'white', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600 }}>Upgrader ✨</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
