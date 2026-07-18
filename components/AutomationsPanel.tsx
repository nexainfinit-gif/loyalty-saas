'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

/**
 * Panneau « Automations » de l'onglet Campagnes — rend visible et pilotable
 * ce qui tourne tout seul (crons + notifications au scan). Sans lui, le
 * commerçant ne sait même pas que l'anniversaire ou la relance existent.
 * Les toggles écrivent directement loyalty_settings (mêmes colonnes que
 * l'onglet Fidélité — notify_*, winback_days 057).
 */

interface Settings {
  notify_reward_reached: boolean;
  notify_near_reward: boolean;
  notify_inactive: boolean;
  winback_days: number | null;
  birthday_bonus_points: number | null;
  program_type: string | null;
}

interface Props {
  restaurantId: string;
  bookingActive: boolean;
  onGoToLoyalty: () => void;
}

export default function AutomationsPanel({ restaurantId, bookingActive, onGoToLoyalty }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [daysDraft, setDaysDraft] = useState<string>('');

  useEffect(() => {
    let stop = false;
    supabase
      .from('loyalty_settings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        if (stop || !data) return;
        setSettings(data as Settings);
        setDaysDraft(String((data as Settings).winback_days ?? 45));
      });
    return () => { stop = true; };
  }, [restaurantId]);

  const patch = async (fields: Partial<Settings>) => {
    // Optimiste + upsert partiel (merge sur restaurant_id, ne touche que ces colonnes)
    setSettings((prev) => (prev ? { ...prev, ...fields } : prev));
    const { error } = await supabase
      .from('loyalty_settings')
      .upsert({ restaurant_id: restaurantId, ...fields }, { onConflict: 'restaurant_id' });
    if (error) {
      toast.error(
        'winback_days' in fields
          ? 'Sauvegarde impossible — la migration 057 est-elle exécutée ?'
          : 'Sauvegarde impossible. Réessayez.',
      );
    }
  };

  const unit = settings?.program_type === 'stamps' ? 'tampons' : 'points';
  const bonus = settings?.birthday_bonus_points ?? 0;

  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex-shrink-0 w-10 h-5 rounded-full relative transition-colors ${on ? 'bg-primary-600' : 'bg-gray-200'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  );

  const OnPill = () => (
    <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-success-50 text-success-700">
      Actif
    </span>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Automations</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Ces messages partent tout seuls, sans action de votre part.
        </p>
      </div>

      <div className="divide-y divide-gray-50">
        {/* 🎂 Anniversaire — toujours actif */}
        <div className="px-5 py-3.5 flex items-start gap-3">
          <span className="text-lg flex-shrink-0">🎂</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Anniversaire</p>
            <p className="text-xs text-gray-400">
              Email de vœux + notification sur la carte Wallet le jour J
              {bonus > 0
                ? ` · ${bonus} ${unit} offerts`
                : ' · '}
              {bonus <= 0 && (
                <button onClick={onGoToLoyalty} className="underline hover:text-gray-600">
                  configurer un bonus
                </button>
              )}
            </p>
          </div>
          <OnPill />
        </div>

        {/* 🏆 Récompense atteinte */}
        <div className="px-5 py-3.5 flex items-start gap-3">
          <span className="text-lg flex-shrink-0">🏆</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Récompense atteinte</p>
            <p className="text-xs text-gray-400">Email dès que la carte est pleine — « votre récompense vous attend »</p>
          </div>
          <Toggle
            on={!!settings?.notify_reward_reached}
            onClick={() => patch({ notify_reward_reached: !settings?.notify_reward_reached })}
          />
        </div>

        {/* 🔔 Proche récompense */}
        <div className="px-5 py-3.5 flex items-start gap-3">
          <span className="text-lg flex-shrink-0">🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Proche de la récompense</p>
            <p className="text-xs text-gray-400">Email d&apos;encouragement à 80 % de l&apos;objectif</p>
          </div>
          <Toggle
            on={!!settings?.notify_near_reward}
            onClick={() => patch({ notify_near_reward: !settings?.notify_near_reward })}
          />
        </div>

        {/* 😴 Relance des inactifs */}
        <div className="px-5 py-3.5 flex items-start gap-3">
          <span className="text-lg flex-shrink-0">😴</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Relance des inactifs</p>
            <p className="text-xs text-gray-400">
              Email « vos {unit} vous attendent » après
              {' '}
              {settings?.notify_inactive ? (
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={daysDraft}
                  onChange={(e) => setDaysDraft(e.target.value)}
                  onBlur={() => {
                    const v = Math.min(365, Math.max(7, parseInt(daysDraft, 10) || 45));
                    setDaysDraft(String(v));
                    if (v !== (settings?.winback_days ?? 45)) patch({ winback_days: v });
                  }}
                  className="w-14 px-1.5 py-0.5 rounded-lg border border-gray-200 text-xs text-center focus:outline-none focus:border-gray-900 tabular-nums"
                />
              ) : (
                <span>{settings?.winback_days ?? 45}</span>
              )}
              {' '}jours sans visite · max 1 relance par période
            </p>
          </div>
          <Toggle
            on={!!settings?.notify_inactive}
            onClick={() => patch({ notify_inactive: !settings?.notify_inactive })}
          />
        </div>

        {/* Réservations — affichées seulement si le module est actif */}
        {bookingActive && (
          <>
            <div className="px-5 py-3.5 flex items-start gap-3">
              <span className="text-lg flex-shrink-0">⏰</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Rappels de rendez-vous</p>
                <p className="text-xs text-gray-400">Carte Wallet (gratuit) + WhatsApp selon votre quota — réglages dans Réservations</p>
              </div>
              <OnPill />
            </div>
            <div className="px-5 py-3.5 flex items-start gap-3">
              <span className="text-lg flex-shrink-0">📅</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Suivi après rendez-vous</p>
                <p className="text-xs text-gray-400">Email le lendemain d&apos;une visite honorée — re-réservation + avis Google</p>
              </div>
              <OnPill />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
