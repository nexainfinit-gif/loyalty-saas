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

interface Props {
  restaurantId: string;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function WalletTab({ restaurantId, locale, t }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPasses, setTotalPasses] = useState(0);
  const [applePasses, setApplePasses] = useState(0);
  const [googlePasses, setGooglePasses] = useState(0);

  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [tmplRes, passesRes] = await Promise.all([
      fetch('/api/wallet/templates', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      supabase.from('wallet_passes').select('platform, status').eq('restaurant_id', restaurantId).eq('status', 'active'),
    ]);

    if (tmplRes.ok) {
      const data = await tmplRes.json();
      setTemplates((data.templates ?? []).filter((t: Template) => t.status !== 'archived'));
    }

    const passes = passesRes.data ?? [];
    setTotalPasses(passes.length);
    setApplePasses(passes.filter(p => p.platform === 'apple').length);
    setGooglePasses(passes.filter(p => p.platform === 'google').length);
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
