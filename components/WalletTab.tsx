'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Template {
  id: string;
  name: string;
  pass_kind: 'stamps' | 'points' | 'event';
  status: 'published' | 'draft' | 'archived';
  primary_color: string | null;
  is_default: boolean;
  active_passes: number;
  config_json: Record<string, unknown>;
}

interface WalletPass {
  id: string;
  platform: 'apple' | 'google';
  status: 'active' | 'revoked' | 'expired';
  issued_at: string;
  customer: { first_name: string; last_name: string; email: string; total_points: number; stamps_count: number; total_visits: number } | null;
}

interface Props {
  restaurantId: string;
  restaurantName?: string;
  restaurantColor?: string;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function WalletTab({ restaurantId, restaurantName, restaurantColor, locale, t }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPasses, setTotalPasses] = useState(0);
  const [applePasses, setApplePasses] = useState(0);
  const [googlePasses, setGooglePasses] = useState(0);
  const [passList, setPassList] = useState<WalletPass[]>([]);

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [tmplRes, passesRes] = await Promise.all([
      fetch('/api/wallet/templates', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      supabase.from('wallet_passes')
        .select('id, platform, status, issued_at, customer:customers(first_name, last_name, email, total_points, stamps_count, total_visits)')
        .eq('restaurant_id', restaurantId)
        .order('issued_at', { ascending: false })
        .limit(100),
    ]);

    if (tmplRes.ok) {
      const data = await tmplRes.json();
      setTemplates((data.templates ?? []).filter((t: Template) => t.status !== 'archived'));
    }

    const passes = (passesRes.data ?? []) as unknown as WalletPass[];
    setPassList(passes);
    const active = passes.filter(p => p.status === 'active');
    setTotalPasses(active.length);
    setApplePasses(active.filter(p => p.platform === 'apple').length);
    setGooglePasses(active.filter(p => p.platform === 'google').length);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const published = templates.filter(t => t.status === 'published');
  const drafts = templates.filter(t => t.status === 'draft');

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('wallet.simpleTitle')}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{t('wallet.simpleTabDesc')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{totalPasses}</p>
          <p className="text-xs text-gray-500 mt-1">{t('wallet.simpleTotal')}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{applePasses}</p>
          <p className="text-xs text-gray-500 mt-1">Apple Wallet</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] text-center">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{googlePasses}</p>
          <p className="text-xs text-gray-500 mt-1">Google Wallet</p>
        </div>
      </div>

      {/* Card templates visual */}
      {published.length === 0 && drafts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-12 text-center">
          <div className="text-4xl mb-4">🎴</div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">{t('wallet.simpleNoTemplates')}</h3>
          <p className="text-sm text-gray-400">{t('wallet.simpleNoTemplatesHint')}</p>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('wallet.simpleTemplates')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {published.map(tmpl => (
              <WalletCardPreview key={tmpl.id} template={tmpl} t={t} />
            ))}
            {drafts.map(tmpl => (
              <WalletCardPreview key={tmpl.id} template={tmpl} t={t} isDraft />
            ))}
          </div>
        </div>
      )}

      {/* Issued passes — Apple Wallet style */}
      {passList.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('wallet.simplePassList')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {passList.map(p => {
              const cust = p.customer as unknown as { first_name: string; last_name: string; email: string; total_points: number; stamps_count: number; total_visits: number } | null;
              const color = restaurantColor ?? '#4F6BED';
              const fg = '#ffffff';
              const labelColor = 'rgba(255,255,255,0.6)';
              const name = cust ? `${cust.first_name} ${cust.last_name ?? ''}`.trim() : '—';
              const points = cust?.total_points ?? 0;
              const stamps = cust?.stamps_count ?? 0;
              const visits = cust?.total_visits ?? 0;
              const stampsTotal = 10;
              const filled = Math.min(stamps, stampsTotal);

              return (
                <div key={p.id} className={`${p.status !== 'active' ? 'opacity-50' : ''}`}>
                  <div
                    className="w-full mx-auto overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.15)] select-none"
                    style={{ background: color, borderRadius: 13, maxWidth: 340, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
                  >
                    {/* Logo row */}
                    <div className="flex items-center justify-between" style={{ padding: '12px 14px 8px' }}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-shrink-0 flex items-center justify-center font-bold"
                          style={{ color: fg, width: 30, height: 30, borderRadius: 8, backgroundColor: `${fg}22`, fontSize: 14 }}>
                          {(restaurantName ?? 'R').charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate" style={{ color: fg, fontSize: 15, fontWeight: 600 }}>
                          {restaurantName ?? ''}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p style={{ color: labelColor, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontWeight: 500 }}>VISITES</p>
                        <p style={{ color: fg, fontSize: 13, fontWeight: 500 }}>{visits}</p>
                      </div>
                    </div>

                    {/* Primary field — stamps or points */}
                    <div style={{ padding: '10px 14px 6px' }}>
                      <p style={{ color: labelColor, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontWeight: 500 }}>TAMPONS</p>
                      <p style={{ color: fg, fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{filled} / {stampsTotal}</p>
                    </div>

                    {/* Stamp grid */}
                    <div style={{ padding: '4px 14px 8px' }}>
                      {(() => {
                        const row1 = Math.ceil(stampsTotal / 2);
                        const row2 = stampsTotal - row1;
                        const sz = 24;
                        const renderStamp = (idx: number) => (
                          <div key={idx} className="flex items-center justify-center"
                            style={{ width: sz, height: sz, borderRadius: '50%', border: `1.5px solid ${idx < filled ? fg : `${fg}55`}`, backgroundColor: idx < filled ? fg : 'transparent' }}>
                            {idx < filled && <span style={{ fontSize: sz * 0.4, fontWeight: 700, color: color, lineHeight: 1 }}>✓</span>}
                          </div>
                        );
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>{Array.from({ length: row1 }, (_, i) => renderStamp(i))}</div>
                            {row2 > 0 && <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>{Array.from({ length: row2 }, (_, i) => renderStamp(row1 + i))}</div>}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Secondary fields */}
                    <div className="flex" style={{ padding: '4px 14px 6px' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: labelColor, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontWeight: 500 }}>CLIENT</p>
                        <p className="truncate" style={{ color: fg, fontSize: 13, fontWeight: 500 }}>{name}</p>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: labelColor, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontWeight: 500 }}>POINTS</p>
                        <p style={{ color: fg, fontSize: 13, fontWeight: 500 }}>{points}</p>
                      </div>
                    </div>

                    {/* Platform badge + status */}
                    <div className="flex items-center justify-between" style={{ padding: '4px 14px 8px' }}>
                      <span style={{ color: labelColor, fontSize: 9, fontWeight: 600 }}>
                        {p.platform === 'apple' ? ' Apple Wallet' : '● Google Wallet'}
                      </span>
                      <span style={{ color: labelColor, fontSize: 9 }}>{new Date(p.issued_at).toLocaleDateString(locale)}</span>
                    </div>

                    {/* QR code */}
                    <div className="flex flex-col items-center" style={{ padding: '10px 14px 14px', borderTop: `1px solid ${fg}15` }}>
                      <div style={{ backgroundColor: '#fff', borderRadius: 10, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 120, height: 120, background: `repeating-conic-gradient(${color} 0% 25%, #fff 0% 50%) 0 0 / 8px 8px`, borderRadius: 4 }} />
                      </div>
                      <p style={{ color: fg, opacity: 0.4, fontSize: 10, marginTop: 6 }}>
                        Présentez ce code au comptoir
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Apple Wallet–style card preview ─────────────────────── */

function WalletCardPreview({ template, t, isDraft }: { template: Template; t: (key: string, vars?: Record<string, string | number>) => string; isDraft?: boolean }) {
  const color = template.primary_color ?? '#4F6BED';
  const kind = template.pass_kind;
  const stampsTotal = 10;
  const stampsFilled = 4;

  return (
    <div className={`relative group ${isDraft ? 'opacity-60' : ''}`}>
      <div
        className="rounded-[18px] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-transform group-hover:scale-[1.02]"
        style={{ background: color, aspectRatio: '3.375 / 2.125' }}
      >
        {/* ── Top strip: logo area + pass type ── */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-xs font-bold">
              {template.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white text-[13px] font-semibold leading-tight">{template.name}</p>
              <p className="text-white/50 text-[9px] font-medium uppercase tracking-wider">
                {kind === 'stamps' ? t('wallet.simpleStamps') : t('wallet.simplePoints')}
              </p>
            </div>
          </div>
          {template.is_default && (
            <span className="bg-white/15 backdrop-blur-sm text-white text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/10">
              {t('wallet.simpleDefault')}
            </span>
          )}
        </div>

        {/* ── Separator line ── */}
        <div className="mx-4 mt-2.5 mb-2 border-t border-white/10" />

        {/* ── Main content: stamps or points ── */}
        <div className="px-4 flex-1">
          {kind === 'stamps' ? (
            <div>
              <div className="flex gap-[6px] flex-wrap">
                {Array.from({ length: stampsTotal }, (_, i) => (
                  <div
                    key={i}
                    className="w-[22px] h-[22px] rounded-full flex items-center justify-center"
                    style={{ background: i < stampsFilled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                  >
                    {i < stampsFilled && (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill={color} stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-white/40 text-[10px] mt-1.5">{stampsFilled} / {stampsTotal}</p>
            </div>
          ) : (
            <div>
              <p className="text-white/40 text-[9px] font-medium uppercase tracking-wider mb-0.5">{t('wallet.simplePoints')}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-white text-[28px] font-bold tabular-nums leading-none">42</span>
                <span className="text-white/40 text-xs font-medium">pts</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom bar: QR + info ── */}
        <div className="mt-auto px-4 pb-3 pt-1.5 flex items-end justify-between">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-white/30 text-[10px]">{template.active_passes} {t('wallet.simplePasses')}</span>
          </div>
          {/* Mini QR placeholder */}
          <div className="w-8 h-8 rounded-[4px] bg-white/90 p-[3px]">
            <div className="w-full h-full" style={{
              backgroundImage: `
                linear-gradient(90deg, ${color} 25%, transparent 25%, transparent 50%, ${color} 50%, ${color} 75%, transparent 75%),
                linear-gradient(${color} 25%, transparent 25%, transparent 50%, ${color} 50%, ${color} 75%, transparent 75%)
              `,
              backgroundSize: '4px 4px',
            }} />
          </div>
        </div>
      </div>

      {/* Draft overlay */}
      {isDraft && (
        <div className="absolute inset-0 rounded-[18px] bg-black/30 flex items-center justify-center">
          <span className="bg-black/60 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">{t('wallet.simpleDraft')}</span>
        </div>
      )}
    </div>
  );
}
