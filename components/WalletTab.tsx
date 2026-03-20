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

/* ── Visual card preview ────────────────────────────────── */

function WalletCardPreview({ template, t, isDraft }: { template: Template; t: (key: string, vars?: Record<string, string | number>) => string; isDraft?: boolean }) {
  const color = template.primary_color ?? '#4F6BED';
  const kind = template.pass_kind;

  return (
    <div className={`relative group ${isDraft ? 'opacity-60' : ''}`}>
      {/* Card */}
      <div
        className="rounded-2xl overflow-hidden shadow-lg transition-transform group-hover:scale-[1.02]"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
      >
        {/* Card header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">
              {kind === 'stamps' ? t('wallet.simpleStamps') : t('wallet.simplePoints')}
            </p>
            <p className="text-white text-sm font-bold mt-0.5">{template.name}</p>
          </div>
          {template.is_default && (
            <span className="bg-white/20 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
              {t('wallet.simpleDefault')}
            </span>
          )}
        </div>

        {/* Card body — visual stamps or points */}
        <div className="px-5 pb-4">
          {kind === 'stamps' ? (
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-full border-2 ${i < 4 ? 'bg-white border-white' : 'border-white/40'}`}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-white tabular-nums">42</span>
              <span className="text-white/60 text-sm font-medium">pts</span>
            </div>
          )}
        </div>

        {/* Card footer */}
        <div className="bg-black/10 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-white/70 text-xs">{template.active_passes} {t('wallet.simplePasses')}</span>
          </div>
          {isDraft && (
            <span className="text-white/50 text-[10px] font-semibold uppercase">{t('wallet.simpleDraft')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
