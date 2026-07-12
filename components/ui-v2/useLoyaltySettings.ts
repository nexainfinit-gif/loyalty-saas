'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ─────────────────────────────────────────────────────────────
   Réglages de fidélité (onglet Fidélité v2). Charge la ligne
   complète loyalty_settings et enregistre via le MÊME upsert que
   le dashboard existant (mêmes colonnes → aucune régression).
   ───────────────────────────────────────────────────────────── */

export interface LoyaltySettings {
  points_per_scan: number;
  reward_threshold: number;
  reward_message: string;
  program_type: 'points' | 'stamps';
  stamps_total: number;
  mode_changed_at: string | null;
  previous_program_type: string | null;
  vip_threshold_points: number;
  vip_threshold_stamps: number;
  welcome_bonus_points: number;
  birthday_bonus_points: number;
  max_scans_per_day: number;
  min_scan_delay_minutes: number;
  notify_reward_reached: boolean;
  notify_near_reward: boolean;
  notify_inactive: boolean;
  card_color: string | null;
  welcome_text: string | null;
  stamp_shape: string;
}

const DEFAULTS: LoyaltySettings = {
  points_per_scan: 10,
  reward_threshold: 100,
  reward_message: '',
  program_type: 'points',
  stamps_total: 10,
  mode_changed_at: null,
  previous_program_type: null,
  vip_threshold_points: 500,
  vip_threshold_stamps: 5,
  welcome_bonus_points: 0,
  birthday_bonus_points: 0,
  max_scans_per_day: 1,
  min_scan_delay_minutes: 0,
  notify_reward_reached: true,
  notify_near_reward: false,
  notify_inactive: false,
  card_color: null,
  welcome_text: null,
  stamp_shape: 'star',
};

type Status = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function useLoyaltySettings(restaurantId: string | null) {
  const [status, setStatus] = useState<Status>('loading');
  const [settings, setSettings] = useState<LoyaltySettings>(DEFAULTS);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('loyalty_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle();
      if (cancelled) return;
      if (error) { setStatus('error'); return; }
      if (data) setSettings({ ...DEFAULTS, ...(data as Partial<LoyaltySettings>) });
      setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  function setField<K extends keyof LoyaltySettings>(key: K, value: LoyaltySettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaveState('idle');
  }

  async function save() {
    if (!restaurantId) return;
    setSaveState('saving');
    // Mêmes colonnes que dashboard/page.tsx saveLoyaltySettings (2026) : on ne
    // touche PAS return_grace_days (géré ailleurs) — l'upsert le laisse intact.
    const { error } = await supabase.from('loyalty_settings').upsert({
      restaurant_id: restaurantId,
      points_per_scan: settings.points_per_scan,
      reward_threshold: settings.reward_threshold,
      reward_message: settings.reward_message,
      program_type: settings.program_type,
      stamps_total: settings.stamps_total,
      mode_changed_at: settings.mode_changed_at,
      previous_program_type: settings.previous_program_type,
      vip_threshold_points: settings.vip_threshold_points,
      vip_threshold_stamps: settings.vip_threshold_stamps,
      welcome_bonus_points: settings.welcome_bonus_points,
      birthday_bonus_points: settings.birthday_bonus_points,
      max_scans_per_day: settings.max_scans_per_day,
      min_scan_delay_minutes: settings.min_scan_delay_minutes,
      notify_reward_reached: settings.notify_reward_reached,
      notify_near_reward: settings.notify_near_reward,
      notify_inactive: settings.notify_inactive,
      card_color: settings.card_color,
      welcome_text: settings.welcome_text,
      stamp_shape: settings.stamp_shape,
    }, { onConflict: 'restaurant_id' });
    if (error) { setSaveState('error'); return; }
    setSaveState('saved');
  }

  return { status, settings, setField, save, saveState };
}
