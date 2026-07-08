'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';

/**
 * Invitation à installer l'app (PWA) — affichée uniquement quand l'utilisateur
 * N'EST PAS déjà en mode app (icône écran d'accueil).
 * iOS : pas d'installation programmatique → on montre le geste (Partager →
 * Sur l'écran d'accueil). Android : bouton natif via beforeinstallprompt.
 * Refus mémorisé 30 jours (localStorage).
 */
const SNOOZE_KEY = 'install-banner-snooze';
const SNOOZE_MS = 30 * 24 * 3600 * 1000;

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

export default function InstallAppBanner() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'hidden' | 'ios' | 'android'>('hidden');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Android : l'événement n'arrive que si l'app est installable et pas installée.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Décision différée (évite le setState synchrone + laisse la page respirer).
    const timer = setTimeout(() => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      if (standalone) return; // déjà en mode app
      const snoozedAt = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (Date.now() - snoozedAt < SNOOZE_MS) return;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) setMode('ios');
    }, 2000);

    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); clearTimeout(timer); };
  }, []);

  // Android : n'afficher que quand le navigateur confirme l'installabilité.
  useEffect(() => {
    if (!deferred) return;
    const snoozedAt = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (Date.now() - snoozedAt < SNOOZE_MS) return;
    const timer = setTimeout(() => setMode('android'), 2000);
    return () => clearTimeout(timer);
  }, [deferred]);

  if (mode === 'hidden') return null;

  const dismiss = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setMode('hidden');
  };

  return (
    <div className="fixed bottom-4 inset-x-4 z-40 max-w-md mx-auto lg:left-auto lg:right-6 lg:mx-0">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-4 flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{t('install.title')}</p>
          {mode === 'ios' ? (
            <p className="text-xs text-gray-500 mt-0.5">
              {t('install.iosHint')}{' '}
              <svg className="inline w-3.5 h-3.5 -mt-0.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>{' '}
              {t('install.iosHint2')}
            </p>
          ) : (
            <button
              onClick={async () => { await deferred?.prompt(); dismiss(); }}
              className="mt-1.5 px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors"
            >
              {t('install.androidBtn')}
            </button>
          )}
        </div>
        <button onClick={dismiss} aria-label={t('install.dismiss')} className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
}
