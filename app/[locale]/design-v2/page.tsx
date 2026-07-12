'use client';

import type { ReactNode } from 'react';
import { Button, Badge, Card, CardHeader, Stat } from '@/components/ui-v2';
import { useDashboardData } from '@/components/ui-v2/useDashboardData';

/* ─────────────────────────────────────────────────────────────
   Dashboard — version design v2 « Comptoir », câblée aux données
   réelles de l'établissement connecté (lecture seule).
   ───────────────────────────────────────────────────────────── */

const NAV: { label: string; short: string; active: boolean; count?: string; icon: ReactNode }[] = [
  { label: 'Vue d\'ensemble', short: 'Accueil', active: true, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
  ) },
  { label: 'Clients', short: 'Clients', active: false, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
  ) },
  { label: 'Fidélité', short: 'Fidélité', active: false, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ) },
  { label: 'Campagnes', short: 'Campagnes', active: false, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 4v16" /></svg>
  ) },
  { label: 'Analytique', short: 'Stats', active: false, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
  ) },
];

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

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/* ── Shell statique (sidebar / topbar / bottom nav) ── */
function Shell({ restaurantName, children }: { restaurantName: string; children: ReactNode }) {
  return (
    <div className="v2-shell">
      <aside className="v2-side">
        <div className="v2-brand">
          <div className="v2-lm">R</div>
          <div className="v2-brand__nm">Rebites</div>
          <div className="v2-brand__pill">PRO</div>
        </div>
        {NAV.map((n) => (
          <div key={n.label} className={`v2-nav${n.active ? ' is-active' : ''}`}>
            {n.icon}
            {n.label}
            {n.count && <span className="v2-nav__cnt">{n.count}</span>}
          </div>
        ))}
        <div className="v2-navlbl">Établissement</div>
        <div className="v2-nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>
          Wallet
        </div>
        <div className="v2-nav">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 12.6H3a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 4.6 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" /></svg>
          Réglages
        </div>
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
          <div className="v2-topbar__brand">
            <span className="v2-lm">R</span>
            <span className="v2-brand__nm">Rebites</span>
          </div>
          <div className="v2-crumb">{restaurantName} · <b>Vue d&apos;ensemble</b></div>
          <div className="v2-cmdk">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <span>Rechercher</span>
            <span className="v2-cmdk__k">⌘K</span>
          </div>
        </div>

        {children}

        <nav className="v2-bottomnav">
          <div className="v2-bottomnav__inner">
            {NAV.map((n) => (
              <a key={n.label} className={`v2-bnav${n.active ? ' is-active' : ''}`}>
                {n.icon}
                {n.short}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export default function DesignV2Dashboard() {
  const state = useDashboardData();

  if (state.status === 'loading' || state.status === 'redirecting') {
    return (
      <Shell restaurantName="Chargement…">
        <div className="v2-content">
          <div className="v2-skel" style={{ height: 30, width: 220 }} />
          <div className="v2-kpis">
            {[0, 1, 2, 3].map((i) => <div key={i} className="v2-skel" style={{ height: 104, borderRadius: 14 }} />)}
          </div>
          <div className="v2-lower">
            <div className="v2-skel" style={{ height: 240, borderRadius: 14 }} />
            <div className="v2-skel" style={{ height: 240, borderRadius: 14 }} />
          </div>
          <div className="v2-skel" style={{ height: 220, borderRadius: 14 }} />
        </div>
      </Shell>
    );
  }

  if (state.status === 'error') {
    return (
      <Shell restaurantName="Rebites">
        <div className="v2-statewrap">
          <div className="v2-state">
            <h3>Impossible de charger le tableau de bord</h3>
            <p>{state.message}</p>
            <Button variant="secondary" onClick={() => window.location.reload()}>Réessayer</Button>
          </div>
        </div>
      </Shell>
    );
  }

  const { data } = state;
  const { kpis, insights } = data;
  const chart = buildChart(data.chartDaily);
  const nf = new Intl.NumberFormat('fr-FR');
  const noCustomers = kpis.totalCustomers === 0 && data.recent.length === 0;

  return (
    <Shell restaurantName={data.restaurantName}>
      <div className="v2-content">
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
              <span className="v2-empty__ico">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
              </span>
              <h3>Aucun client pour l&apos;instant</h3>
              <p>Partagez votre page d&apos;inscription pour que vos premiers clients rejoignent le programme. Ils apparaîtront ici dès leur première visite.</p>
              <Button variant="primary">Partager la page d&apos;inscription</Button>
            </div>
          </Card>
        ) : (
          <>
            {/* KPIs réels */}
            <div className="v2-kpis">
              <Stat label="Clients fidèles" value={nf.format(kpis.totalCustomers)}
                delta={kpis.newCustomers30d != null
                  ? <><span>▲ {nf.format(kpis.newCustomers30d)}</span> <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>nouveaux · 30j</span></>
                  : undefined}
                deltaDir={kpis.newCustomers30d ? 'up' : 'none'} />
              <Stat label="Visites · 30j" value={kpis.visits30d != null ? nf.format(kpis.visits30d) : '—'}
                delta={<span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>30 derniers jours</span>} />
              <Stat label="Taux de retour" value={kpis.returnRatePct != null ? `${kpis.returnRatePct}%` : '—'}
                delta={kpis.returnRatePct == null
                  ? <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>Dès le plan Growth</span>
                  : <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>clients revenus</span>} />
              <Stat label="Récompenses dues" value={nf.format(kpis.rewardsDue)}
                delta={kpis.vipCount > 0 ? <Badge tone="honey" bare>{nf.format(kpis.vipCount)} VIP</Badge> : undefined} />
            </div>

            {/* Graphe + insights */}
            <div className="v2-lower">
              <Card>
                <CardHeader title="Visites · 30 jours" actions={
                  <div className="v2-seg"><button>7j</button><button className="is-on">30j</button><button>90j</button></div>
                } />
                <div className="v2-chart-wrap">
                  {chart.hasData ? (
                    <>
                      <svg viewBox="0 0 460 150" width="100%" preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden="true">
                        <defs>
                          <linearGradient id="v2ag" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--v2-a-600)" stopOpacity="0.20" />
                            <stop offset="100%" stopColor="var(--v2-a-600)" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="37" x2="460" y2="37" stroke="var(--v2-line)" />
                        <line x1="0" y1="75" x2="460" y2="75" stroke="var(--v2-line)" />
                        <line x1="0" y1="113" x2="460" y2="113" stroke="var(--v2-line)" />
                        <path d={chart.area} fill="url(#v2ag)" />
                        <path d={chart.line} fill="none" stroke="var(--v2-a-600)" strokeWidth="2.4" strokeLinejoin="round" />
                        {chart.last && <circle cx={chart.last[0]} cy={chart.last[1]} r="4" fill="var(--v2-a-600)" stroke="var(--v2-surface)" strokeWidth="2.5" />}
                      </svg>
                      <div className="v2-mono" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
                        {data.chartLabels.map((d, i) => <span key={i} style={{ color: 'var(--v2-faint)', fontSize: 11 }}>{d}</span>)}
                      </div>
                    </>
                  ) : (
                    <div className="v2-empty" style={{ padding: '32px 20px' }}>
                      <p style={{ margin: 0 }}>Pas encore de visites sur les 30 derniers jours.</p>
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="À regarder" actions={<Badge tone="accent">{[insights.vipCount > 0, insights.inactiveCount > 0, !!insights.lastCampaign].filter(Boolean).length} signaux</Badge>} />
                <div className="v2-insight">
                  {insights.vipCount > 0 && (
                    <div className="v2-ins">
                      <div className="v2-ins__ico" style={{ background: 'var(--v2-honey-bg)', color: 'var(--v2-honey)' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" /></svg>
                      </div>
                      <div className="v2-ins__tx"><b>{nf.format(insights.vipCount)} client{insights.vipCount > 1 ? 's' : ''} VIP</b> dans votre programme. Une attention ciblée entretient leur fidélité.<div className="v2-ins__mt">Fidélité</div></div>
                    </div>
                  )}
                  {insights.inactiveCount > 0 && (
                    <div className="v2-ins">
                      <div className="v2-ins__ico" style={{ background: 'var(--v2-bad-bg)', color: 'var(--v2-bad)' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                      </div>
                      <div className="v2-ins__tx"><b>{nf.format(insights.inactiveCount)} client{insights.inactiveCount > 1 ? 's' : ''} inactif{insights.inactiveCount > 1 ? 's' : ''}</b> depuis 45 jours. Un email de relance les fait revenir.<div className="v2-ins__mt">Rétention · à faire</div></div>
                    </div>
                  )}
                  {insights.lastCampaign && (
                    <div className="v2-ins">
                      <div className="v2-ins__ico" style={{ background: 'var(--v2-ok-bg)', color: 'var(--v2-ok)' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                      </div>
                      <div className="v2-ins__tx"><b>« {insights.lastCampaign.name} »</b> envoyée à {nf.format(insights.lastCampaign.recipients)} client{insights.lastCampaign.recipients > 1 ? 's' : ''}.<div className="v2-ins__mt">Campagnes · {insights.lastCampaign.when}</div></div>
                    </div>
                  )}
                  {insights.vipCount === 0 && insights.inactiveCount === 0 && !insights.lastCampaign && (
                    <div className="v2-ins__tx" style={{ color: 'var(--v2-muted)' }}>Rien à signaler pour le moment — tout roule.</div>
                  )}
                </div>
              </Card>
            </div>

            {/* Clients récents réels */}
            <Card>
              <CardHeader title="Derniers clients" actions={<Button variant="ghost" size="sm">Tout voir →</Button>} />
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
                  {data.recent.map((c) => (
                    <tr key={c.id}>
                      <td style={{ paddingLeft: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="v2-avatar" style={{ background: c.tone === 'honey' ? 'var(--v2-honey)' : c.tone === 'ok' ? 'var(--v2-ok)' : 'var(--v2-muted)' }}>{c.initials}</span>
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
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}
