import { Button, Badge, Card, CardHeader, Stat } from '@/components/ui-v2';

/* ─────────────────────────────────────────────────────────────
   Dashboard — version design v2 « Comptoir »
   Prototype visuel à valider. Données de démonstration :
   le câblage aux vraies données vient APRÈS validation du design.
   ───────────────────────────────────────────────────────────── */

const NAV = [
  { label: 'Vue d\'ensemble', active: true, count: null, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
  ) },
  { label: 'Clients', active: false, count: '1 284', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
  ) },
  { label: 'Fidélité', active: false, count: null, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ) },
  { label: 'Campagnes', active: false, count: null, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z" /><path d="M4 9h16M9 4v16" /></svg>
  ) },
  { label: 'Analytique', active: false, count: null, icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
  ) },
];

const CUSTOMERS = [
  { initials: 'CL', color: 'var(--v2-a-600)', name: 'Camille Lefèvre', email: 'camille.l@gmail.com', points: '2 048', cards: '4', last: 'Il y a 2 h', tone: 'honey' as const, status: 'VIP' },
  { initials: 'YB', color: 'var(--v2-ok)', name: 'Yanis Benali', email: 'yanis.b@outlook.be', points: '460', cards: '1', last: 'Hier', tone: 'ok' as const, status: 'Actif' },
  { initials: 'SM', color: 'var(--v2-honey)', name: 'Sofia Moreau', email: 'sofia.moreau@gmail.com', points: '1 220', cards: '2', last: 'Il y a 6 j', tone: 'neutral' as const, status: 'Inactif' },
  { initials: 'TD', color: 'var(--v2-muted)', name: 'Thomas Dubois', email: 't.dubois@gmail.com', points: '85', cards: '0', last: 'Il y a 3 h', tone: 'accent' as const, status: 'Nouveau' },
];

export default function DesignV2Dashboard() {
  return (
    <div className="v2-shell">
      {/* ── Sidebar ── */}
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
          <span className="v2-avatar" style={{ background: 'var(--v2-ink)' }}>ML</span>
          <div style={{ fontSize: 12, lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600 }}>Mehdi L.</div>
            <div style={{ color: 'var(--v2-faint)', fontSize: 11 }}>Propriétaire</div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="v2-main">
        <div className="v2-topbar">
          <div className="v2-crumb">Le Petit Comptoir · <b>Vue d&apos;ensemble</b></div>
          <div className="v2-cmdk">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            Rechercher
            <span className="v2-cmdk__k">⌘K</span>
          </div>
        </div>

        <div className="v2-content">
          <div className="v2-pageh">
            <div>
              <h1>Bonjour, Mehdi</h1>
              <div className="v2-pageh__sub">Voici ce qui compte aujourd&apos;hui — mardi 12 juillet</div>
            </div>
            <Button variant="primary">Nouvelle campagne</Button>
          </div>

          {/* KPIs */}
          <div className="v2-kpis">
            <Stat label="Clients fidèles" value="1 284"
              delta={<><span>▲ 12,4%</span> <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>vs 30j</span></>}
              deltaDir="up" sparkPoints="0,20 20,18 40,19 60,12 80,13 100,7 120,5" sparkColor="var(--v2-a-600)" />
            <Stat label="Visites · 30j" value="3 410"
              delta={<><span>▲ 8,1%</span> <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>vs 30j</span></>}
              deltaDir="up" sparkPoints="0,16 20,17 40,11 60,14 80,9 100,10 120,6" sparkColor="var(--v2-ok)" />
            <Stat label="Taux de retour" value="64%"
              delta={<><span>▼ 1,2%</span> <span style={{ color: 'var(--v2-faint)', fontWeight: 500 }}>vs 30j</span></>}
              deltaDir="down" sparkPoints="0,8 20,9 40,7 60,11 80,10 100,13 120,14" sparkColor="var(--v2-bad)" />
            <Stat label="Récompenses dues" value="47"
              delta={<Badge tone="honey" bare>18 VIP</Badge>}
              sparkPoints="0,14 20,12 40,13 60,9 80,11 100,8 120,7" sparkColor="var(--v2-honey)" />
          </div>

          {/* Chart + insights */}
          <div className="v2-lower">
            <Card>
              <CardHeader title="Rétention & visites" actions={
                <div className="v2-seg">
                  <button>7j</button>
                  <button className="is-on">30j</button>
                  <button>90j</button>
                </div>
              } />
              <div className="v2-chart-wrap">
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
                  <path d="M0,120 C40,110 70,95 110,98 C150,101 175,70 210,66 C250,61 280,78 320,58 C360,40 400,46 460,28 L460,150 L0,150 Z" fill="url(#v2ag)" />
                  <path d="M0,120 C40,110 70,95 110,98 C150,101 175,70 210,66 C250,61 280,78 320,58 C360,40 400,46 460,28" fill="none" stroke="var(--v2-a-600)" strokeWidth="2.4" />
                  <circle cx="460" cy="28" r="4" fill="var(--v2-a-600)" stroke="var(--v2-surface)" strokeWidth="2.5" />
                </svg>
                <div className="v2-mono" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 4px 10px' }}>
                  {['16 juin', '26 juin', '6 juil', '12 juil'].map((d) => (
                    <span key={d} style={{ color: 'var(--v2-faint)', fontSize: 11 }}>{d}</span>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="À regarder" actions={<Badge tone="accent">3 signaux</Badge>} />
              <div className="v2-insight">
                <div className="v2-ins">
                  <div className="v2-ins__ico" style={{ background: 'var(--v2-honey-bg)', color: 'var(--v2-honey)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z" /></svg>
                  </div>
                  <div className="v2-ins__tx"><b>18 clients VIP</b> approchent d&apos;une récompense. Une campagne ciblée convertirait ~60%.<div className="v2-ins__mt">Fidélité · maintenant</div></div>
                </div>
                <div className="v2-ins">
                  <div className="v2-ins__ico" style={{ background: 'var(--v2-bad-bg)', color: 'var(--v2-bad)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                  </div>
                  <div className="v2-ins__tx"><b>142 clients inactifs</b> depuis 45 jours. Un email « on vous a gardé une place » les relance.<div className="v2-ins__mt">Rétention · à faire</div></div>
                </div>
                <div className="v2-ins">
                  <div className="v2-ins__ico" style={{ background: 'var(--v2-ok-bg)', color: 'var(--v2-ok)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                  <div className="v2-ins__tx"><b>Campagne « Fête nationale »</b> envoyée à 890 clients · 34% ouverts.<div className="v2-ins__mt">Campagnes · hier</div></div>
                </div>
              </div>
            </Card>
          </div>

          {/* Recent customers */}
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
                {CUSTOMERS.map((c) => (
                  <tr key={c.email}>
                    <td style={{ paddingLeft: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="v2-avatar" style={{ background: c.color }}>{c.initials}</span>
                        <div>
                          <div style={{ fontWeight: 570 }}>{c.name}</div>
                          <div style={{ color: 'var(--v2-faint)', fontSize: 11.5 }}>{c.email}</div>
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
        </div>
      </div>
    </div>
  );
}
