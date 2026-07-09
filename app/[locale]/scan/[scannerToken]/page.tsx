'use client'

// SÉCURITÉ (2026-07-09) : le scanner caisse par lien (scanner_token) est
// désactivé — un lien partageable donnait un accès illimité à l'attribution
// de points. Le staff se connecte désormais avec son compte équipe
// (email + code) et utilise le scanner du dashboard.
import LocaleLink from '@/components/LocaleLink'
import { useTranslation } from '@/lib/i18n'

export default function ScannerLinkDisabledPage() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8 max-w-sm w-full text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">{t('scanner.linkDisabledTitle')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('scanner.linkDisabledDesc')}</p>
        <LocaleLink
          href="/dashboard/login"
          className="inline-flex px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          {t('scanner.linkDisabledCta')}
        </LocaleLink>
      </div>
    </div>
  )
}
