'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Button, Badge, Card, CardHeader, Stat, Input } from '@/components/ui-v2';
import { useDashboardData, type RecentCustomer, type RawBundle, type CampaignRow } from '@/components/ui-v2/useDashboardData';
import { useLoyaltySettings } from '@/components/ui-v2/useLoyaltySettings';
import { useSettingsData } from '@/components/ui-v2/useSettingsData';
import { useWalletData, type WalletTemplate } from '@/components/ui-v2/useWalletData';
import { supabase } from '@/lib/supabase';

/* ─────────────────────────────────────────────────────────────
   Dashboard v2 « Comptoir » — shell à onglets, câblé aux données
   réelles. Accueil + Clients implémentés ; les autres onglets
   arrivent un par un (état « en cours » navigable en attendant).
   ───────────────────────────────────────────────────────────── */

type Tab = 'overview' | 'clients' | 'loyalty' | 'campaigns' | 'analytics' | 'wallet' | 'settings';

const ICON: Record<Tab, ReactNode> = {
  overview: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  clients: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>,
  loyalty: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  campaigns: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 4v16" /></svg>,
  analytics: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>,
  wallet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 12.6H3a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 4.6 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" /></svg>,
};

const PRIMARY: { tab: Tab; label: string; short: string }[] = [
  { tab: 'overview', label: 'Vue d\'ensemble', short: 'Accueil' },
  { tab: 'clients', label: 'Clients', short: 'Clients' },
  { tab: 'loyalty', label: 'Fidélité', short: 'Fidélité' },
  { tab: 'campaigns', label: 'Campagnes', short: 'Campagnes' },
  { tab: 'analytics', label: 'Analytique', short: 'Stats' },
];

const TAB_TITLE: Record<Tab, string> = {
  overview: 'Vue d\'ensemble', clients: 'Clients', loyalty: 'Fidélité',
  campaigns: 'Campagnes', analytics: 'Analytique', wallet: 'Wallet', settings: 'Réglages',
};

function avatarBg(tone: string) {
  return tone === 'honey' ? 'var(--v2-honey)' : tone === 'ok' ? 'var(--v2-ok)' : tone === 'accent' ? 'var(--v2-a-600)' : 'var(--v2-muted)';
}

export default function DesignV2Dashboard() {
  const state = useDashboardData();
  const [tab, setTab] = useState<Tab>('overview');

  const restaurantName =
    state.status === 'ready' ? state.data.restaurantName
    : state.status === 'loading' || state.status === 'redirecting' ? 'Chargement…'
    : 'Rebites';

  return (
    <Shell restaurantName={restaurantName} tab={tab} onTab={setTab} clientCount={state.status === 'ready' ? state.data.customers.length : null}>
      {(state.status === 'loading' || state.status === 'redirecting') && <LoadingContent />}
      {state.status === 'error' && (
        <div className="v2-statewrap">
          <div className="v2-state">
            <h3>Impossible de charger le tableau de bord</h3>
            <p>{state.message}</p>
            <Button variant="secondary" onClick={() => window.location.reload()}>Réessayer</Button>
          </div>
        </div>
      )}
      {state.status === 'ready' && (
        <div className="v2-content">
          {tab === 'overview' && <OverviewContent data={state.data} />}
          {tab === 'clients' && <ClientsContent customers={state.data.customers} />}
          {tab === 'analytics' && <AnalyticsContent raw={state.data.raw} />}
          {tab === 'loyalty' && <LoyaltyContent restaurantId={state.data.restaurantId} />}
          {tab === 'campaigns' && <CampaignsContent raw={state.data.raw} campaigns={state.data.campaigns} />}
          {tab === 'settings' && <SettingsContent restaurantId={state.data.restaurantId} />}
          {tab === 'wallet' && <WalletContent restaurantId={state.data.restaurantId} restaurantName={state.data.restaurantName} />}
          {tab !== 'overview' && tab !== 'clients' && tab !== 'analytics' && tab !== 'loyalty' && tab !== 'campaigns' && tab !== 'settings' && tab !== 'wallet' && <WipContent tab={tab} />}
        </div>
      )}
    </Shell>
  );
}

/* ── Shell ── */
function Shell({ restaurantName, tab, onTab, clientCount, children }: {
  restaurantName: string; tab: Tab; onTab: (t: Tab) => void; clientCount: number | null; children: ReactNode;
}) {
  return (
    <div className="v2-shell">
      <aside className="v2-side">
        <div className="v2-brand">
          <div className="v2-lm">R</div>
          <div className="v2-brand__nm">Rebites</div>
          <div className="v2-brand__pill">PRO</div>
        </div>
        {PRIMARY.map((n) => (
          <button key={n.tab} className={`v2-nav${tab === n.tab ? ' is-active' : ''}`} onClick={() => onTab(n.tab)} style={{ border: 0, background: 'none', width: '100%', font: 'inherit' }}>
            {ICON[n.tab]}
            {n.label}
            {n.tab === 'clients' && clientCount != null && <span className="v2-nav__cnt">{clientCount}</span>}
          </button>
        ))}
        <div className="v2-navlbl">Établissement</div>
        <button className={`v2-nav${tab === 'wallet' ? ' is-active' : ''}`} onClick={() => onTab('wallet')} style={{ border: 0, background: 'none', width: '100%', font: 'inherit' }}>{ICON.wallet} Wallet</button>
        <button className={`v2-nav${tab === 'settings' ? ' is-active' : ''}`} onClick={() => onTab('settings')} style={{ border: 0, background: 'none', width: '100%', font: 'inherit' }}>{ICON.settings} Réglages</button>
        <div className="v2-side__foot">
          <span className="v2-avatar" style={{ background: 'var(--v2-ink)' }}>{restaurantName.slice(0, 2).toUpperCase()}</span>
          <div style={{ fontSize: 12, lineHeight: 1.3, minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{restaurantName}</div>
            <div style={{ color: 'var(--v2-faint)', fontSize: 11 }}>Propriétaire</div>
          </div>
        </div>
      </aside>

      <div className="v2-main">
        <div className="v2-topbar">
          <div className="v2-topbar__brand"><span className="v2-lm">R</span><span className="v2-brand__nm">Rebites</span></div>
          <div className="v2-crumb">{restaurantName} · <b>{TAB_TITLE[tab]}</b></div>
          <div className="v2-cmdk">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <span>Rechercher</span>
            <span className="v2-cmdk__k">⌘K</span>
          </div>
        </div>

        {children}

        <nav className="v2-bottomnav">
          <div className="v2-bottomnav__inner">
            {PRIMARY.map((n) => (
              <button key={n.tab} className={`v2-bnav${tab === n.tab ? ' is-active' : ''}`} onClick={() => onTab(n.tab)} style={{ border: 0, background: 'none', font: 'inherit', cursor: 'pointer' }}>
                {ICON[n.tab]}
                {n.short}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

function LoadingContent() {
  return (
    <div className="v2-content">
      <div className="v2-skel" style={{ height: 30, width: 220 }} />
      <div className="v2-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="v2-skel" style={{ height: 104, borderRadius: 14 }} />)}</div>
      <div className="v2-lower">
        <div className="v2-skel" style={{ height: 240, borderRadius: 14 }} />
        <div className="v2-skel" style={{ height: 240, borderRadius: 14 }} />
      </div>
      <div className="v2-skel" style={{ height: 220, borderRadius: 14 }} />
    </div>
  );
}

/* ── Onglet : Vue d'ensemble ── */
function OverviewContent({ data }: { data: import('@/components/ui-v2/useDashboardData').DashboardData }) {
  const { kpis, insights } = data;
  const chart = buildChart(data.chartDaily);
  const nf = new Intl.NumberFormat('fr-FR');
  const noCustomers = kpis.totalCustomers === 0 && data.recent.length === 0;

  return (
    <>
      <div className="v2-pageh">
        <div>
          <h1>Bonjour{data.greetingName ? `, ${cap(data.greetingName)}` : ''}</h1>
          <div className="v2-pageh__sub">{data.restaurantName} · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <Button variant="primary">Nouvelle campagne</Button>
      </div>

      {noCustomers ? (
        <Card>
          <div className="v2-empty">
            <span className="v2-empty__ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg></span>
            <h3>Aucun client pour l&apos;instant</h3>
            <p>Partagez votre page d&apos;inscription pour que vos premiers clients rejoignent le programme.</p>
            <Button variant="primary">Partager la page d&apos;inscription</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="v2-kpis">
            <Stat label="Clients fidèles" value={nf.format(kpis.totalCustomers)}
              delta={kpis.newCustomers30d != null ? <><span>▲ {nf.format(kpis.newCustomers30d)}</span> <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>nouveaux · 30j</span></> : undefined}
              deltaDir={kpis.newCustomers30d ? 'up' : 'none'} />
            <Stat label="Visites · 30j" value={kpis.visits30d != null ? nf.format(kpis.visits30d) : '—'}
              delta={<span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>30 derniers jours</span>} />
            <Stat label="Taux de retour" value={kpis.returnRatePct != null ? `${kpis.returnRatePct}%` : '—'}
              delta={kpis.returnRatePct == null ? <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>Dès le plan Growth</span> : <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>clients revenus</span>} />
            <Stat label="Récompenses dues" value={nf.format(kpis.rewardsDue)}
              delta={kpis.vipCount > 0 ? <Badge tone="honey" bare>{nf.format(kpis.vipCount)} VIP</Badge> : undefined} />
          </div>

          <div className="v2-lower">
            <Card>
              <CardHeader title="Visites · 30 jours" actions={<div className="v2-seg"><button>7j</button><button className="is-on">30j</button><button>90j</button></div>} />
              <div className="v2-chart-wrap">
                {chart.hasData ? (
                  <>
                    <svg viewBox="0 0 460 150" width="100%" preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden="true">
                      <defs><linearGradient id="v2ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--v2-a-600)" stopOpacity="0.20" /><stop offset="100%" stopColor="var(--v2-a-600)" stopOpacity="0" /></linearGradient></defs>
                      <line x1="0" y1="37" x2="460" y2="37" stroke="var(--v2-line)" /><line x1="0" y1="75" x2="460" y2="75" stroke="var(--v2-line)" /><line x1="0" y1="113" x2="460" y2="113" stroke="var(--v2-line)" />
                      <path d={chart.area} fill="url(#v2ag)" />
                      <path d={chart.line} fill="none" stroke="var(--v2-a-600)" strokeWidth="2.4" strokeLinejoin="round" />
                      {chart.last && <circle cx={chart.last[0]} cy={chart.last[1]} r="4" fill="var(--v2-a-600)" stroke="var(--v2-surface)" strokeWidth="2.5" />}
                    </svg>
                    <div className="v2-mono" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
                      {data.chartLabels.map((d, i) => <span key={i} style={{ color: 'var(--v2-faint)', fontSize: 11 }}>{d}</span>)}
                    </div>
                  </>
                ) : (
                  <div className="v2-empty" style={{ padding: '32px 20px' }}><p style={{ margin: 0 }}>Pas encore de visites sur les 30 derniers jours.</p></div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="À regarder" actions={<Badge tone="accent">{[insights.vipCount > 0, insights.inactiveCount > 0, !!insights.lastCampaign].filter(Boolean).length} signaux</Badge>} />
              <div className="v2-insight">
                {insights.vipCount > 0 && (
                  <div className="v2-ins">
                    <div className="v2-ins__ico" style={{ background: 'var(--v2-honey-bg)', color: 'var(--v2-honey)' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" /></svg></div>
                    <div className="v2-ins__tx"><b>{nf.format(insights.vipCount)} client{insights.vipCount > 1 ? 's' : ''} VIP</b> dans votre programme. Une attention ciblée entretient leur fidélité.<div className="v2-ins__mt">Fidélité</div></div>
                  </div>
                )}
                {insights.inactiveCount > 0 && (
                  <div className="v2-ins">
                    <div className="v2-ins__ico" style={{ background: 'var(--v2-bad-bg)', color: 'var(--v2-bad)' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg></div>
                    <div className="v2-ins__tx"><b>{nf.format(insights.inactiveCount)} client{insights.inactiveCount > 1 ? 's' : ''} inactif{insights.inactiveCount > 1 ? 's' : ''}</b> depuis 45 jours. Un email de relance les fait revenir.<div className="v2-ins__mt">Rétention · à faire</div></div>
                  </div>
                )}
                {insights.lastCampaign && (
                  <div className="v2-ins">
                    <div className="v2-ins__ico" style={{ background: 'var(--v2-ok-bg)', color: 'var(--v2-ok)' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg></div>
                    <div className="v2-ins__tx"><b>« {insights.lastCampaign.name} »</b> envoyée à {nf.format(insights.lastCampaign.recipients)} client{insights.lastCampaign.recipients > 1 ? 's' : ''}.<div className="v2-ins__mt">Campagnes · {insights.lastCampaign.when}</div></div>
                  </div>
                )}
                {insights.vipCount === 0 && insights.inactiveCount === 0 && !insights.lastCampaign && (
                  <div className="v2-ins__tx" style={{ color: 'var(--v2-muted)' }}>Rien à signaler pour le moment — tout roule.</div>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Derniers clients" actions={<Button variant="ghost" size="sm">Tout voir →</Button>} />
            <CustomerTable customers={data.recent} />
          </Card>
        </>
      )}
    </>
  );
}

/* ── Onglet : Clients ── */
function ClientsContent({ customers }: { customers: RecentCustomer[] }) {
  const [q, setQ] = useState('');
  const nf = new Intl.NumberFormat('fr-FR');
  const filtered = q.trim()
    ? customers.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q.trim().toLowerCase()))
    : customers;

  return (
    <>
      <div className="v2-tabh">
        <div>
          <h1>Clients</h1>
          <div className="cnt">{nf.format(customers.length)} client{customers.length > 1 ? 's' : ''} au total</div>
        </div>
        <div className="v2-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client…" />
        </div>
      </div>

      {customers.length === 0 ? (
        <Card>
          <div className="v2-empty">
            <span className="v2-empty__ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></span>
            <h3>Aucun client pour l&apos;instant</h3>
            <p>Vos clients apparaîtront ici dès leur inscription au programme.</p>
          </div>
        </Card>
      ) : (
        <Card>
          {filtered.length === 0 ? (
            <div className="v2-empty" style={{ padding: 32 }}><p style={{ margin: 0 }}>Aucun client ne correspond à « {q} ».</p></div>
          ) : (
            <CustomerTable customers={filtered} />
          )}
        </Card>
      )}
    </>
  );
}

function CustomerTable({ customers }: { customers: RecentCustomer[] }) {
  return (
    <table className="v2-table">
      <thead>
        <tr>
          <th style={{ paddingLeft: 16 }}>Client</th>
          <th>Points</th>
          <th>Cartes</th>
          <th>Dernière visite</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {customers.map((c) => (
          <tr key={c.id}>
            <td style={{ paddingLeft: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="v2-avatar" style={{ background: avatarBg(c.tone) }}>{c.initials}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 570 }}>{c.name}</div>
                  {c.email && <div style={{ color: 'var(--v2-faint)', fontSize: 11.5 }}>{c.email}</div>}
                </div>
              </div>
            </td>
            <td className="v2-mono">{c.points}</td>
            <td className="v2-mono">{c.cards}</td>
            <td style={{ color: 'var(--v2-muted)', fontSize: 12.5 }}>{c.last}</td>
            <td><Badge tone={c.tone}>{c.status}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Onglet : Wallet ── */
function WalletContent({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const { locale } = useParams() as { locale: string };
  const { status, templates, stats } = useWalletData(restaurantId);
  const nf = new Intl.NumberFormat('fr-FR');

  if (status === 'loading') {
    return (<><div className="v2-tabh"><div><h1>Wallet</h1></div></div><div className="v2-kpis">{[0, 1, 2].map((i) => <div key={i} className="v2-skel" style={{ height: 92, borderRadius: 14 }} />)}</div><div className="v2-wl__grid" style={{ marginTop: 20 }}>{[0, 1].map((i) => <div key={i} className="v2-skel" style={{ height: 190, borderRadius: 16 }} />)}</div></>);
  }
  if (status === 'error') {
    return (<><div className="v2-tabh"><div><h1>Wallet</h1></div></div><Card><div className="v2-empty" style={{ padding: 32 }}><p style={{ margin: 0 }}>Impossible de charger les cartes Wallet.</p></div></Card></>);
  }

  return (
    <>
      <div className="v2-tabh"><div><h1>Wallet</h1><div className="cnt">Vos cartes Apple &amp; Google Wallet</div></div></div>

      <div className="v2-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Stat label="Pass actifs" value={nf.format(stats.total)} />
        <Stat label="Apple Wallet" value={nf.format(stats.apple)} />
        <Stat label="Google Wallet" value={nf.format(stats.google)} />
      </div>

      {templates.length === 0 ? (
        <Card>
          <div className="v2-empty">
            <span className="v2-empty__ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg></span>
            <h3>Aucune carte Wallet</h3>
            <p>Une carte générique est créée automatiquement à la configuration de votre programme de fidélité.</p>
          </div>
        </Card>
      ) : (
        <div>
          <div className="v2-sec-head" style={{ marginBottom: 12 }}><h2 style={{ fontSize: 14, fontWeight: 660, margin: 0 }}>Modèles ({templates.length})</h2>
            <a href={`/${locale}/dashboard`} className="v2-cp__book-link">Modifier dans le studio →</a>
          </div>
          <div className="v2-wl__grid">
            {templates.map((tmpl) => <WalletCard key={tmpl.id} tmpl={tmpl} restaurantName={restaurantName} />)}
          </div>
        </div>
      )}
    </>
  );
}

function WalletCard({ tmpl, restaurantName }: { tmpl: WalletTemplate; restaurantName: string }) {
  const nf = new Intl.NumberFormat('fr-FR');
  const cfg = tmpl.config_json ?? {};
  const bg = (cfg.bgColor as string) ?? tmpl.primary_color ?? '#4148D6';
  const fg = (cfg.foregroundColor as string) ?? '#ffffff';
  const label = `${fg}80`;
  const logoText = (cfg.logoText as string) ?? (cfg.merchantName as string) ?? restaurantName ?? tmpl.name;
  const logoUrl = typeof cfg.logoImageUrl === 'string' && cfg.logoImageUrl.startsWith('http') ? cfg.logoImageUrl : null;
  const isStamps = tmpl.pass_kind === 'stamps';
  const stampsTotal = (cfg.stampsTotal as number) ?? 10;
  const filled = Math.min(4, stampsTotal);
  const isDraft = tmpl.status === 'draft';

  return (
    <div className="v2-wl__cardwrap">
      <div className="v2-wl__card" style={{ background: bg }}>
        {/* Haut : logo + type */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {logoUrl
              ? <img src={logoUrl} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 30, height: 30, borderRadius: 8, background: `${fg}22`, color: fg, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{(logoText || 'R').charAt(0).toUpperCase()}</div>}
            <div style={{ minWidth: 0 }}>
              <p style={{ color: fg, fontSize: 14, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{logoText}</p>
              <p style={{ color: label, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1px 0 0' }}>{isStamps ? 'Tampons' : 'Points'}</p>
            </div>
          </div>
          {tmpl.is_default && <span style={{ background: `${fg}26`, color: fg, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 99 }}>Par défaut</span>}
        </div>

        <div style={{ borderTop: `1px solid ${fg}1a`, margin: '2px 14px 0' }} />

        {/* Contenu : tampons ou points */}
        <div style={{ padding: '12px 14px 6px', minHeight: 64 }}>
          {isStamps ? (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Array.from({ length: Math.min(stampsTotal, 10) }, (_, i) => (
                  <div key={i} className="v2-wl__stamp" style={{ background: i < filled ? 'rgba(255,255,255,0.95)' : `${fg}22`, border: `1.5px solid ${fg}40` }}>
                    {i < filled && <svg width="12" height="12" viewBox="0 0 24 24" fill={bg}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>}
                  </div>
                ))}
              </div>
              <p style={{ color: label, fontSize: 10, margin: '7px 0 0' }}>{filled} / {stampsTotal}</p>
            </>
          ) : (
            <>
              <p style={{ color: label, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Points</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ color: fg, fontSize: 28, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>42</span>
                <span style={{ color: label, fontSize: 12, fontWeight: 500 }}>pts</span>
              </div>
            </>
          )}
        </div>

        {/* Bas : compteur + mini QR */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '4px 14px 13px' }}>
          <span style={{ color: label, fontSize: 10 }}>{nf.format(tmpl.active_passes)} pass actifs</span>
          <div style={{ width: 30, height: 30, borderRadius: 5, background: 'rgba(255,255,255,0.92)', padding: 3 }}>
            <div style={{ width: '100%', height: '100%', backgroundImage: `linear-gradient(90deg, ${bg} 25%, transparent 25% 50%, ${bg} 50% 75%, transparent 75%), linear-gradient(${bg} 25%, transparent 25% 50%, ${bg} 50% 75%, transparent 75%)`, backgroundSize: '4px 4px' }} />
          </div>
        </div>
      </div>

      {isDraft && <div className="v2-wl__draft"><span>Brouillon</span></div>}

      <div className="v2-wl__meta">
        <div>
          <div className="v2-wl__meta-n">{tmpl.name}</div>
          <div className="v2-wl__meta-s">{isStamps ? 'Carte à tampons' : 'Carte à points'}</div>
        </div>
        <Badge tone={tmpl.status === 'published' ? 'ok' : 'neutral'}>{tmpl.status === 'published' ? 'Publié' : 'Brouillon'}</Badge>
      </div>
    </div>
  );
}

/* ── Onglet : Réglages ── */
function SettingsContent({ restaurantId }: { restaurantId: string }) {
  const { locale } = useParams() as { locale: string };
  const s = useSettingsData(restaurantId);

  if (s.status === 'loading') {
    return (<><div className="v2-tabh"><div><h1>Réglages</h1></div></div><div className="v2-lf">{[0, 1, 2].map((i) => <div key={i} className="v2-skel" style={{ height: 150, borderRadius: 14 }} />)}</div></>);
  }
  if (s.status === 'error') {
    return (<><div className="v2-tabh"><div><h1>Réglages</h1></div></div><Card><div className="v2-empty" style={{ padding: 32 }}><p style={{ margin: 0 }}>Impossible de charger les réglages.</p></div></Card></>);
  }

  const statusTone = s.plan?.status === 'active' ? 'ok' : s.plan?.status === 'past_due' ? 'warn' : s.plan?.status === 'canceled' ? 'bad' : 'neutral';
  const statusLabel = s.plan?.status === 'active' ? 'Actif' : s.plan?.status === 'trialing' ? 'Essai' : s.plan?.status === 'past_due' ? 'Paiement en retard' : s.plan?.status === 'canceled' ? 'Annulé' : (s.plan?.status ?? '—');

  return (
    <>
      <div className="v2-tabh"><div><h1>Réglages</h1><div className="cnt">Informations et préférences de votre établissement</div></div></div>

      <div className="v2-lf">
        {/* Informations */}
        <Card>
          <CardHeader title="Informations" />
          <div className="v2-lf__body">
            <Input label="Nom de l'établissement" value={s.name} onChange={(e) => s.setName(e.target.value)} />
            <div className="v2-field">
              <label className="v2-label">Identifiant (slug)</label>
              <input className="v2-input" value={s.slug} onChange={(e) => s.setSlug(e.target.value)} />
              <p className="v2-fielderr" style={{ color: 'var(--v2-faint)' }}>Votre page publique : /register/{s.slug || '…'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
              {s.infoState === 'saved' && <SavedTag />}
              {s.infoState === 'error' && <span style={{ fontSize: 13, color: 'var(--v2-bad)' }}>Erreur — réessayez</span>}
              <Button variant="primary" onClick={s.saveInfo} disabled={!s.infoDirty || s.infoState === 'saving'}>
                {s.infoState === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Paramètres analytiques */}
        <Card>
          <CardHeader title="Paramètres analytiques" />
          <div className="v2-lf__body">
            <p style={{ fontSize: 12.5, color: 'var(--v2-muted)', margin: 0 }}>Servent à estimer votre chiffre d&apos;affaires et le coût de vos récompenses dans l&apos;onglet Analytique.</p>
            <div className="v2-lf__grid">
              <Input label="Ticket moyen (€)" type="number" step="0.01" min={0} value={s.settings['average_ticket'] ?? ''} onChange={(e) => s.setKpi('average_ticket', e.target.value)} placeholder="Ex : 18,50" />
              <Input label="Coût moyen d'une récompense (€)" type="number" step="0.01" min={0} value={s.settings['average_reward_cost'] ?? ''} onChange={(e) => s.setKpi('average_reward_cost', e.target.value)} placeholder="Ex : 4,00" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
              {s.kpiState === 'saved' && <SavedTag />}
              {s.kpiState === 'error' && <span style={{ fontSize: 13, color: 'var(--v2-bad)' }}>Erreur — réessayez</span>}
              <Button variant="primary" onClick={s.saveKpi} disabled={s.kpiState === 'saving'}>
                {s.kpiState === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Abonnement */}
        <Card>
          <CardHeader title="Abonnement" actions={<Badge tone={statusTone as 'ok' | 'warn' | 'bad' | 'neutral'}>{statusLabel}</Badge>} />
          <div className="v2-lf__body">
            <div className="v2-lf__mode" style={{ background: 'var(--v2-sunken)' }}>
              <div>
                <div className="v2-lf__mode-t" style={{ color: 'var(--v2-ink)', fontSize: 15, fontWeight: 700, textTransform: 'capitalize' }}>{s.plan?.name}</div>
                <div className="v2-lf__mode-d">
                  {s.plan?.key === 'starter' ? 'Jusqu\'à 500 clients' : 'Clients illimités'}
                  {s.plan?.status === 'active' && s.plan?.periodEnd ? ` · renouvellement le ${new Date(s.plan.periodEnd).toLocaleDateString('fr-FR')}` : ''}
                </div>
              </div>
              <a href={`/${locale}/dashboard/billing`}><Button variant="secondary" size="sm">Gérer</Button></a>
            </div>
          </div>
        </Card>

        {/* Déféré vers le dashboard actuel */}
        <Card>
          <div className="v2-wip" style={{ padding: '28px 24px' }}>
            <span className="v2-wip__ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 12.6H3a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 4.6 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" /></svg></span>
            <h3>Logo, accès équipe & services</h3>
            <p>Le logo (avec recadrage), la gestion de l&apos;équipe et l&apos;activation des services restent pour l&apos;instant sur votre dashboard actuel.</p>
            <a href={`/${locale}/dashboard`}><Button variant="secondary">Ouvrir le dashboard actuel</Button></a>
          </div>
        </Card>
      </div>
    </>
  );
}

function SavedTag() {
  return (
    <span className="v2-lf__saved">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      Enregistré
    </span>
  );
}

/* ── Onglet : Campagnes ── */
const CMP_ICON: Record<string, ReactNode> = {
  reengagement: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8" /><path d="M3 4v4h4" /></svg>,
  birthday: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 21h16M4 16h16v5H4zM6 16v-4a6 6 0 0 1 12 0v4M12 4v2" /></svg>,
  near_reward: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" /></svg>,
  promo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /></svg>,
  custom: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  wallet_push: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>,
};

type Composer = { name: string; type: string; subject: string; body: string; segment: string; scheduled_at: string };

const TEMPLATES: { type: string; name: string; segment: string; subject: string; body: string }[] = [
  { type: 'reengagement', name: 'Réengagement', segment: 'inactive_45', subject: 'On vous a gardé une place', body: 'Cela fait un moment ! Revenez profiter de vos avantages fidélité — on serait ravis de vous revoir.' },
  { type: 'birthday', name: 'Anniversaire', segment: 'birthday', subject: 'Joyeux anniversaire !', body: 'Toute l\'équipe vous souhaite un excellent anniversaire — une petite surprise vous attend lors de votre prochaine visite.' },
  { type: 'near_reward', name: 'Proche récompense', segment: 'near_reward', subject: 'Vous y êtes presque !', body: 'Plus que quelques points avant de débloquer votre récompense. À très vite !' },
  { type: 'promo', name: 'Promotion', segment: 'all', subject: 'Offre spéciale', body: 'Profitez de notre offre du moment, réservée à nos membres fidèles.' },
  { type: 'custom', name: 'Personnalisé', segment: 'all', subject: '', body: '' },
];

const SEGMENTS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tous les clients' },
  { value: 'active', label: 'Clients actifs' },
  { value: 'inactive_45', label: 'Inactifs (45j+)' },
  { value: 'near_reward', label: 'Proches d\'une récompense' },
  { value: 'vip', label: 'Clients VIP' },
  { value: 'birthday', label: 'Anniversaire ce mois' },
];

function segCount(seg: string, raw: RawBundle): number {
  const { customers, programType, vipThreshold, rewardThreshold, stampsTotal } = raw;
  const now = Date.now();
  switch (seg) {
    case 'active': return customers.filter((c) => c.last_visit_at && now - new Date(c.last_visit_at).getTime() < 30 * MS_DAY).length;
    case 'inactive_45': return customers.filter((c) => !c.last_visit_at || now - new Date(c.last_visit_at).getTime() > 45 * MS_DAY).length;
    case 'near_reward': return customers.filter((c) => programType === 'stamps' ? (c.stamps_count >= stampsTotal - 2 && c.stamps_count < stampsTotal) : (c.total_points >= rewardThreshold * 0.7 && c.total_points < rewardThreshold)).length;
    case 'vip': return vipThreshold > 0 ? customers.filter((c) => (programType === 'stamps' ? c.stamps_count : c.total_points) >= vipThreshold).length : 0;
    case 'birthday': { const m = new Date().getMonth(); return customers.filter((c) => c.birth_date && new Date(c.birth_date).getMonth() === m).length; }
    default: return customers.length;
  }
}

function CampaignsContent({ raw, campaigns }: { raw: RawBundle; campaigns: CampaignRow[] }) {
  const [composer, setComposer] = useState<Composer>({ name: '', type: 'custom', subject: '', body: '', segment: 'all', scheduled_at: '' });
  const [activeTpl, setActiveTpl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<CampaignRow[]>(campaigns);
  const nf = new Intl.NumberFormat('fr-FR');
  const recipients = segCount(composer.segment, raw);
  const canSend = composer.name.trim() && composer.subject.trim() && composer.body.trim() && !sending;

  function applyTpl(tpl: typeof TEMPLATES[number]) {
    setActiveTpl(tpl.type);
    setComposer((c) => ({ ...c, type: tpl.type, name: tpl.name, subject: tpl.subject, body: tpl.body, segment: tpl.segment }));
  }

  async function send() {
    setSending(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expirée — reconnectez-vous.'); setSending(false); return; }
      const res = await fetch('/api/compaigns', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...composer, scheduled_at: composer.scheduled_at || '', bodyText: composer.body }),
      });
      const data = await res.json();
      if (data.success) {
        setSent((prev) => [{
          id: data.campaign_id ?? crypto.randomUUID(), name: composer.name, type: composer.type,
          recipients_count: data.sent ?? data.recipients ?? recipients,
          status: data.scheduled ? 'scheduled' : 'sent',
          sent_at: data.scheduled ? null : new Date().toISOString(),
          scheduled_at: composer.scheduled_at || null, created_at: new Date().toISOString(),
        }, ...prev]);
        setComposer({ name: '', type: 'custom', subject: '', body: '', segment: 'all', scheduled_at: '' });
        setActiveTpl(null);
      } else {
        setError(data.error || 'Échec de l\'envoi.');
      }
    } catch {
      setError('Erreur réseau — réessayez.');
    }
    setSending(false);
  }

  return (
    <>
      <div className="v2-tabh"><div><h1>Campagnes</h1><div className="cnt">Envoyez des emails ciblés à vos clients</div></div></div>

      <Card>
        <CardHeader title="Choisir un modèle" />
        <div className="v2-cmp__templates">
          {TEMPLATES.map((tpl) => (
            <button key={tpl.type} className={`v2-cmp__tpl${activeTpl === tpl.type ? ' is-active' : ''}`} onClick={() => applyTpl(tpl)}>
              <span className="v2-cmp__tpl-ic">{CMP_ICON[tpl.type]}</span>
              <div className="v2-cmp__tpl-n">{tpl.name}</div>
              <div className="v2-cmp__tpl-c">{nf.format(segCount(tpl.segment, raw))} destinataires</div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Composer" />
        <div className="v2-cmp__body">
          <Input label="Nom de la campagne" value={composer.name} onChange={(e) => setComposer((c) => ({ ...c, name: e.target.value }))} placeholder="Ex : Relance de printemps" />
          <div className="v2-field">
            <label className="v2-label">Cible</label>
            <div className="v2-cmp__seg">
              <select value={composer.segment} onChange={(e) => setComposer((c) => ({ ...c, segment: e.target.value }))}>
                {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="v2-cmp__count">{nf.format(recipients)} destinataire{recipients > 1 ? 's' : ''}</span>
            </div>
          </div>
          <Input label="Objet de l'email" value={composer.subject} onChange={(e) => setComposer((c) => ({ ...c, subject: e.target.value }))} placeholder="Ex : Une surprise vous attend" />
          <div className="v2-field">
            <label className="v2-label">Message</label>
            <textarea className="v2-lf__textarea" value={composer.body} maxLength={1000} onChange={(e) => setComposer((c) => ({ ...c, body: e.target.value }))} placeholder="Votre message aux clients…" style={{ minHeight: 120 }} />
          </div>
          <div className="v2-field">
            <label className="v2-label">Programmer l&apos;envoi <span style={{ color: 'var(--v2-faint)', fontWeight: 400 }}>(facultatif)</span></label>
            <input type="datetime-local" className="v2-input" value={composer.scheduled_at} onChange={(e) => setComposer((c) => ({ ...c, scheduled_at: e.target.value }))} />
          </div>
          {error && <div className="v2-bk__notice v2-bk__notice--err">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={send} disabled={!canSend}>
              {sending ? 'Envoi…' : composer.scheduled_at ? `Programmer · ${nf.format(recipients)}` : `Envoyer à ${nf.format(recipients)} client${recipients > 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Historique${sent.length ? ` · ${sent.length}` : ''}`} />
        {sent.length === 0 ? (
          <div className="v2-empty" style={{ padding: 32 }}><p style={{ margin: 0 }}>Aucune campagne envoyée pour le moment.</p></div>
        ) : (
          <div>
            {sent.map((c) => (
              <div key={c.id} className="v2-cmp__row">
                <span className="v2-cmp__row-ic">{CMP_ICON[c.type] ?? CMP_ICON.custom}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="v2-cmp__row-n">{c.name || 'Campagne'}</div>
                  <div className="v2-cmp__row-m">{c.status === 'scheduled' ? 'Programmée' : c.sent_at ? new Date(c.sent_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                </div>
                <div className="v2-cmp__row-r">
                  <div className="n">{nf.format(c.recipients_count)}</div>
                  <Badge tone={c.status === 'sent' ? 'ok' : c.status === 'scheduled' ? 'accent' : 'neutral'} bare>{c.status === 'sent' ? 'Envoyée' : c.status === 'scheduled' ? 'Programmée' : c.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ── Onglet : Fidélité ── */
function LoyaltyContent({ restaurantId }: { restaurantId: string }) {
  const { status, settings, setField, save, saveState } = useLoyaltySettings(restaurantId);
  const isStamps = settings.program_type === 'stamps';

  if (status === 'loading') {
    return (
      <>
        <div className="v2-tabh"><div><h1>Fidélité</h1></div></div>
        <div className="v2-lf">{[0, 1, 2].map((i) => <div key={i} className="v2-skel" style={{ height: 180, borderRadius: 14 }} />)}</div>
      </>
    );
  }
  if (status === 'error') {
    return (<><div className="v2-tabh"><div><h1>Fidélité</h1></div></div><Card><div className="v2-empty" style={{ padding: 32 }}><p style={{ margin: 0 }}>Impossible de charger les réglages.</p></div></Card></>);
  }

  const num = (v: number) => (Number.isFinite(v) ? String(v) : '0');
  const setNum = (k: Parameters<typeof setField>[0]) => (e: React.ChangeEvent<HTMLInputElement>) => setField(k, Math.max(0, parseInt(e.target.value || '0', 10)) as never);

  return (
    <>
      <div className="v2-tabh">
        <div><h1>Fidélité</h1><div className="cnt">Réglez votre programme de récompenses</div></div>
      </div>

      <div className="v2-lf">
        {/* Programme */}
        <Card>
          <CardHeader title="Programme" />
          <div className="v2-lf__body">
            <div className="v2-lf__mode">
              <div>
                <div className="v2-lf__mode-t">Mode : {isStamps ? 'Tampons' : 'Points'}</div>
                <div className="v2-lf__mode-d">Le changement de mode (points ↔ tampons) reste sur votre dashboard actuel — c&apos;est une migration délicate.</div>
              </div>
              <Badge tone="accent">{isStamps ? 'Tampons' : 'Points'}</Badge>
            </div>

            <div className="v2-lf__grid">
              {isStamps ? (
                <Input label="Tampons pour une récompense" type="number" min={1} value={num(settings.stamps_total)} onChange={setNum('stamps_total')} />
              ) : (
                <>
                  <Input label="Points par scan" type="number" min={0} value={num(settings.points_per_scan)} onChange={setNum('points_per_scan')} />
                  <Input label="Points pour une récompense" type="number" min={1} value={num(settings.reward_threshold)} onChange={setNum('reward_threshold')} />
                </>
              )}
            </div>

            <div className="v2-field">
              <label className="v2-label">Message de récompense</label>
              <textarea className="v2-lf__textarea" value={settings.reward_message} maxLength={200}
                onChange={(e) => setField('reward_message', e.target.value)}
                placeholder="Ex : Félicitations ! Une boisson offerte vous attend 🎉" />
            </div>

            <div className="v2-lf__grid">
              <Input label="Bonus de bienvenue (points)" type="number" min={0} value={num(settings.welcome_bonus_points)} onChange={setNum('welcome_bonus_points')} />
              <Input label="Bonus d'anniversaire (points)" type="number" min={0} value={num(settings.birthday_bonus_points)} onChange={setNum('birthday_bonus_points')} />
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader title="Notifications automatiques" />
          <ToggleRow t="Récompense atteinte" d="Email quand un client débloque une récompense" on={settings.notify_reward_reached} onToggle={() => setField('notify_reward_reached', !settings.notify_reward_reached)} />
          <ToggleRow t="Proche d'une récompense" d="Email d'encouragement à l'approche du palier" on={settings.notify_near_reward} onToggle={() => setField('notify_near_reward', !settings.notify_near_reward)} />
          <ToggleRow t="Client inactif" d="Email de relance après une période sans visite" on={settings.notify_inactive} onToggle={() => setField('notify_inactive', !settings.notify_inactive)} />
        </Card>

        {/* Avancé / anti-fraude */}
        <Card>
          <CardHeader title="Anti-fraude & seuils" />
          <div className="v2-lf__body">
            <div className="v2-lf__grid">
              <Input label="Scans max par jour / client" type="number" min={1} value={num(settings.max_scans_per_day)} onChange={setNum('max_scans_per_day')} />
              <Input label="Délai min. entre scans (min)" type="number" min={0} value={num(settings.min_scan_delay_minutes)} onChange={setNum('min_scan_delay_minutes')} />
              {isStamps ? (
                <Input label="Seuil VIP (tampons)" type="number" min={0} value={num(settings.vip_threshold_stamps)} onChange={setNum('vip_threshold_stamps')} />
              ) : (
                <Input label="Seuil VIP (points)" type="number" min={0} value={num(settings.vip_threshold_points)} onChange={setNum('vip_threshold_points')} />
              )}
            </div>
          </div>
        </Card>

        <div className="v2-lf__savebar">
          {saveState === 'saved' && (
            <span className="v2-lf__saved">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Enregistré
            </span>
          )}
          {saveState === 'error' && <span style={{ fontSize: 13, color: 'var(--v2-bad)' }}>Erreur — réessayez</span>}
          <Button variant="primary" onClick={save} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Enregistrement…' : 'Enregistrer les réglages'}
          </Button>
        </div>
      </div>
    </>
  );
}

function ToggleRow({ t, d, on, onToggle }: { t: string; d: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="v2-lf__row">
      <div>
        <div className="v2-lf__row-t">{t}</div>
        <div className="v2-lf__row-d">{d}</div>
      </div>
      <button type="button" role="switch" aria-checked={on} className={`v2-switch${on ? ' is-on' : ''}`} onClick={onToggle} />
    </div>
  );
}

/* ── Onglet : Analytique ── */
type Period = '7d' | '30d' | '90d';
const MS_DAY = 86_400_000;

function AnalyticsContent({ raw }: { raw: RawBundle }) {
  const [period, setPeriod] = useState<Period>('30d');
  const [NOW] = useState(() => Date.now());
  const nf = new Intl.NumberFormat('fr-FR');
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const periodMs = days * MS_DAY;

  const a = useMemo(() => {
    const { customers, transactions, programType, vipThreshold } = raw;
    const inPeriod = (iso: string) => NOW - new Date(iso).getTime() < periodMs;

    const visits = transactions.filter((t) => t.type === 'visit' && inPeriod(t.created_at));
    const active = customers.filter((c) => c.last_visit_at && inPeriod(c.last_visit_at)).length;
    const news = customers.filter((c) => inPeriod(c.created_at)).length;

    const visitsByCust = new Map<string, number>();
    visits.forEach((t) => visitsByCust.set(t.customer_id, (visitsByCust.get(t.customer_id) ?? 0) + 1));
    const withVisits = visitsByCust.size;
    const returning = [...visitsByCust.values()].filter((v) => v > 1).length;
    const returnRate = withVisits > 0 ? Math.round((returning / withVisits) * 100) : 0;

    // Répartition (statut, tous clients)
    const status = (c: RawBundle['customers'][number]): 'new' | 'inactive' | 'vip' | 'active' => {
      if (NOW - new Date(c.created_at).getTime() < 30 * MS_DAY) return 'new';
      if (!c.last_visit_at || NOW - new Date(c.last_visit_at).getTime() > 30 * MS_DAY) return 'inactive';
      const val = programType === 'stamps' ? c.stamps_count : c.total_points;
      if (vipThreshold > 0 && val >= vipThreshold) return 'vip';
      return 'active';
    };
    const dist = { active: 0, new: 0, vip: 0, inactive: 0 };
    customers.forEach((c) => { dist[status(c)]++; });

    // Activité quotidienne (visites/jour sur la période)
    const daily = new Array(days).fill(0) as number[];
    const start = NOW - periodMs;
    visits.forEach((t) => {
      const idx = Math.floor((new Date(t.created_at).getTime() - start) / MS_DAY);
      if (idx >= 0 && idx < days) daily[idx] += 1;
    });

    // Croissance mensuelle (6 mois) : nouveaux vs récurrents
    const months: { label: string; nw: number; rec: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const label = new Date(mStart).toLocaleDateString('fr-FR', { month: 'short' });
      const nw = customers.filter((c) => { const t = new Date(c.created_at).getTime(); return t >= mStart && t <= mEnd; }).length;
      const rec = new Set(transactions.filter((t) => { const tt = new Date(t.created_at).getTime(); return t.type === 'visit' && tt >= mStart && tt <= mEnd; }).map((t) => t.customer_id)).size;
      months.push({ label, nw, rec });
    }

    return { active, news, returnRate, visits: visits.length, dist, total: customers.length, daily, months };
  }, [raw, NOW, periodMs, days]);

  const chart = buildChart(a.daily);
  const distItems = [
    { key: 'active', label: 'Actifs', color: 'var(--v2-ok)', value: a.dist.active },
    { key: 'new', label: 'Nouveaux', color: 'var(--v2-a-600)', value: a.dist.new },
    { key: 'vip', label: 'VIP', color: 'var(--v2-honey)', value: a.dist.vip },
    { key: 'inactive', label: 'Inactifs', color: 'var(--v2-faint)', value: a.dist.inactive },
  ];
  const distMax = Math.max(...distItems.map((d) => d.value), 1);

  return (
    <>
      <div className="v2-tabh">
        <div><h1>Analytique</h1><div className="cnt">Performance de votre programme</div></div>
        <div className="v2-seg">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button key={p} className={period === p ? 'is-on' : ''} onClick={() => setPeriod(p)}>{p.replace('d', 'j')}</button>
          ))}
        </div>
      </div>

      <div className="v2-kpis">
        <Stat label="Clients actifs" value={nf.format(a.active)} delta={<span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>sur {days}j</span>} />
        <Stat label="Nouveaux clients" value={nf.format(a.news)} delta={<span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>sur {days}j</span>} />
        <Stat label="Taux de retour" value={`${a.returnRate}%`} delta={<span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>reviennent</span>} />
        <Stat label="Visites" value={nf.format(a.visits)} delta={<span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>sur {days}j</span>} />
      </div>

      <div className="v2-lower">
        <Card>
          <CardHeader title={`Activité · ${days} jours`} />
          <div className="v2-chart-wrap">
            {chart.hasData ? (
              <svg viewBox="0 0 460 150" width="100%" preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden="true">
                <defs><linearGradient id="v2an" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--v2-a-600)" stopOpacity="0.20" /><stop offset="100%" stopColor="var(--v2-a-600)" stopOpacity="0" /></linearGradient></defs>
                <line x1="0" y1="37" x2="460" y2="37" stroke="var(--v2-line)" /><line x1="0" y1="75" x2="460" y2="75" stroke="var(--v2-line)" /><line x1="0" y1="113" x2="460" y2="113" stroke="var(--v2-line)" />
                <path d={chart.area} fill="url(#v2an)" />
                <path d={chart.line} fill="none" stroke="var(--v2-a-600)" strokeWidth="2.2" strokeLinejoin="round" />
              </svg>
            ) : (
              <div className="v2-empty" style={{ padding: '32px 20px' }}><p style={{ margin: 0 }}>Aucune visite sur la période.</p></div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Répartition clients" actions={<Badge tone="neutral" bare>{nf.format(a.total)}</Badge>} />
          <div className="v2-an__dist">
            {distItems.map((d) => (
              <div key={d.key} className="v2-an__dist-row">
                <span className="v2-an__dist-lbl">{d.label}</span>
                <span className="v2-an__dist-track"><span className="v2-an__dist-fill" style={{ width: `${(d.value / distMax) * 100}%`, background: d.color }} /></span>
                <span className="v2-an__dist-val">{nf.format(d.value)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Croissance · 6 mois" />
        <div className="v2-chart-wrap">
          <MonthlyBars data={a.months} />
        </div>
        <div className="v2-an__legend">
          <span className="v2-an__leg"><i style={{ background: 'var(--v2-a-600)' }} /> Nouveaux</span>
          <span className="v2-an__leg"><i style={{ background: 'var(--v2-a-200)' }} /> Clients récurrents</span>
        </div>
      </Card>
    </>
  );
}

function MonthlyBars({ data }: { data: { label: string; nw: number; rec: number }[] }) {
  const W = 460, H = 150, base = 128;
  const max = Math.max(...data.flatMap((d) => [d.nw, d.rec]), 1);
  const groupW = W / data.length;
  const barW = Math.min(22, groupW * 0.26);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} aria-hidden="true">
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--v2-line)" />
      {data.map((d, i) => {
        const gx = i * groupW + groupW / 2;
        const h1 = (d.nw / max) * (base - 12);
        const h2 = (d.rec / max) * (base - 12);
        return (
          <g key={i}>
            <rect x={gx - barW - 2} y={base - h1} width={barW} height={h1} rx="3" fill="var(--v2-a-600)" />
            <rect x={gx + 2} y={base - h2} width={barW} height={h2} rx="3" fill="var(--v2-a-200)" />
            <text x={gx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--v2-faint)" style={{ textTransform: 'capitalize' }}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Onglets en cours de refonte ── */
function WipContent({ tab }: { tab: Tab }) {
  const { locale } = useParams() as { locale: string };
  return (
    <Card>
      <div className="v2-wip">
        <span className="v2-wip__ic">{ICON[tab]}</span>
        <h3>{TAB_TITLE[tab]} — refonte en cours</h3>
        <p>Cet onglet est en cours de passage au nouveau design. Sa version actuelle reste pleinement fonctionnelle dans votre tableau de bord.</p>
        <a href={`/${locale}/dashboard`}><Button variant="secondary">Ouvrir le dashboard actuel</Button></a>
      </div>
    </Card>
  );
}

/* ── Helpers ── */
function buildChart(daily: number[]) {
  const n = daily.length;
  const W = 460, top = 18, bottom = 138, floor = 150;
  const max = Math.max(...daily, 1);
  const pts = daily.map((v, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * W;
    const y = bottom - (v / max) * (bottom - top);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return { line, area: `${line} L${W},${floor} L0,${floor} Z`, last, hasData: daily.some((v) => v > 0) };
}

function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
