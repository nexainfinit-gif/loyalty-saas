'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ─────────────────────────────────────────────────────────────
   Données Wallet (onglet Wallet v2, lecture seule). Templates via
   /api/wallet/templates + compteurs de pass actifs. L'édition des
   templates (studio) reste sur le dashboard actuel.
   ───────────────────────────────────────────────────────────── */

export interface WalletTemplate {
  id: string;
  name: string;
  pass_kind: 'stamps' | 'points' | 'event';
  status: 'published' | 'draft' | 'archived';
  primary_color: string | null;
  is_default: boolean;
  active_passes: number;
  config_json: Record<string, unknown>;
}

type Status = 'loading' | 'ready' | 'error';

export function useWalletData(restaurantId: string | null) {
  const [status, setStatus] = useState<Status>('loading');
  const [templates, setTemplates] = useState<WalletTemplate[]>([]);
  const [stats, setStats] = useState({ total: 0, apple: 0, google: 0 });

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setStatus('error'); return; }
        const [tmplRes, passesRes] = await Promise.all([
          fetch('/api/wallet/templates', { headers: { Authorization: `Bearer ${session.access_token}` } })
            .then((r) => (r.ok ? r.json() : null)).catch(() => null),
          supabase.from('wallet_passes').select('platform, status').eq('restaurant_id', restaurantId).limit(2000),
        ]);
        if (cancelled) return;
        const tmpls = ((tmplRes?.templates ?? []) as WalletTemplate[]).filter((t) => t.status !== 'archived');
        setTemplates(tmpls);
        const passes = (passesRes.data ?? []) as { platform: string; status: string }[];
        const active = passes.filter((p) => p.status === 'active');
        setStats({
          total: active.length,
          apple: active.filter((p) => p.platform === 'apple').length,
          google: active.filter((p) => p.platform === 'google').length,
        });
        setStatus('ready');
      } catch { if (!cancelled) setStatus('error'); }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  return { status, templates, stats };
}
