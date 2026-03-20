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

      {/* Issued passes — visual cards */}
      {passList.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('wallet.simplePassList')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {passList.map(p => {
              const cust = p.customer as unknown as { first_name: string; last_name: string; email: string; total_points: number; stamps_count: number; total_visits: number } | null;
              const color = restaurantColor ?? '#4F6BED';
              const name = cust ? `${cust.first_name} ${cust.last_name ?? ''}`.trim() : '—';

              return (
                <div key={p.id} className={`rounded-[16px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.08)] ${p.status !== 'active' ? 'opacity-50' : ''}`}>
                  {/* Pass header */}
                  <div className="px-4 pt-3.5 pb-2" style={{ background: color }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white text-[10px] font-bold">
                          {(restaurantName ?? 'R').charAt(0)}
                        </div>
                        <div>
                          <p className="text-white text-[11px] font-semibold leading-tight">{restaurantName ?? ''}</p>
                          <p className="text-white/50 text-[8px] uppercase tracking-wider">{t('wallet.simplePoints')}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.platform === 'apple' ? 'bg-white/15 text-white' : 'bg-white/15 text-white'}`}>
                        {p.platform === 'apple' ? '' : '●'} {p.platform === 'apple' ? 'Apple' : 'Google'}
                      </span>
                    </div>
                  </div>

                  {/* Pass body */}
                  <div className="bg-white px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{name}</p>
                        <p className="text-[10px] text-gray-400">{cust?.email ?? ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900 tabular-nums">{cust?.total_points ?? 0}</p>
                        <p className="text-[10px] text-gray-400">points</p>
                      </div>
                    </div>

                    {/* Mini stats */}
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        <span className="text-[10px] text-gray-400">{cust?.total_visits ?? 0} {t('wallet.simpleVisits')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-success-500' : 'bg-gray-300'}`} />
                        <span className="text-[10px] text-gray-400">
                          {p.status === 'active' ? t('wallet.simpleStatusActive') : p.status === 'revoked' ? t('wallet.simpleStatusRevoked') : t('wallet.simpleStatusExpired')}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-300 ml-auto">{new Date(p.issued_at).toLocaleDateString(locale)}</span>
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
