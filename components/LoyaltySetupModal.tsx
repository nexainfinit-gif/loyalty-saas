'use client';
import { useTranslation } from '@/lib/i18n';

/**
 * Pop-up de configuration OBLIGATOIRE du programme de fidélité.
 *
 * S'affiche tant que le restaurant n'a aucun programme configuré. Non-fermable :
 * pas de croix, pas de « passer », pas de fermeture au clic extérieur — le
 * commerçant DOIT configurer son programme avant d'utiliser le dashboard.
 * À l'enregistrement, sa carte Wallet est créée automatiquement.
 */
type SetupFields = {
  program_type:     'points' | 'stamps';
  points_per_scan:  number;
  reward_threshold: number;
  stamps_total:     number;
  reward_message:   string;
};

interface Props {
  settings: SetupFields;
  onChange: (partial: Partial<SetupFields>) => void;
  onSave:   () => Promise<void>;
  saving:   boolean;
}

export default function LoyaltySetupModal({ settings, onChange, onSave, saving }: Props) {
  const { t } = useTranslation();
  const isStamps = settings.program_type === 'stamps';

  const canSave =
    settings.reward_message.trim().length > 0 &&
    (isStamps ? settings.stamps_total > 0 : settings.reward_threshold > 0);

  return (
    <div className="fixed inset-0 z-[120] bg-gray-900/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.2)] w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header — pas de bouton fermer */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t('loyaltySetup.title')}</h2>
          <p className="text-sm text-gray-500 mt-1">{t('loyaltySetup.subtitle')}</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Type de programme */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">{t('loyaltySetup.typeLabel')}</label>
            <div className="grid grid-cols-2 gap-3">
              {(['points', 'stamps'] as const).map((mode) => {
                const active = settings.program_type === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onChange({ program_type: mode })}
                    className={[
                      'rounded-xl border p-4 text-left transition-colors',
                      active ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-gray-200 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <div className="text-2xl mb-1">{mode === 'points' ? '⭐' : '🎟️'}</div>
                    <p className="text-sm font-semibold text-gray-900">
                      {mode === 'points' ? t('loyaltySetup.modePoints') : t('loyaltySetup.modeStamps')}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {mode === 'points' ? t('loyaltySetup.modePointsDesc') : t('loyaltySetup.modeStampsDesc')}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paramètres selon le mode */}
          {isStamps ? (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{t('loyaltySetup.stampsTotalLabel')}</label>
              <input
                type="number" min={1} max={50}
                value={settings.stamps_total}
                onChange={(e) => onChange({ stamps_total: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">{t('loyaltySetup.thresholdLabel')}</label>
                <input
                  type="number" min={1}
                  value={settings.reward_threshold}
                  onChange={(e) => onChange({ reward_threshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">{t('loyaltySetup.perScanLabel')}</label>
                <input
                  type="number" min={1}
                  value={settings.points_per_scan}
                  onChange={(e) => onChange({ points_per_scan: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
                />
              </div>
            </div>
          )}

          {/* Message de récompense */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('loyaltySetup.rewardLabel')}</label>
            <input
              type="text" maxLength={80}
              value={settings.reward_message}
              onChange={(e) => onChange({ reward_message: e.target.value })}
              placeholder={t('loyaltySetup.rewardPlaceholder')}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20"
            />
          </div>

          <p className="text-[11px] text-gray-400">{t('loyaltySetup.walletHint')}</p>
        </div>

        {/* Action — un seul bouton, obligatoire */}
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || saving}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? t('common.savingDots') : t('loyaltySetup.saveBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
