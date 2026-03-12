'use client';

import { useTranslation } from '@/lib/i18n';

export default function PrivacyPage() {
  const { t, locale } = useTranslation();

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <a href={`/${locale}`} className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-3 inline-block">
            {t('privacy.back')}
          </a>
          <h1 className="text-2xl font-bold text-gray-900">{t('privacy.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('privacy.lastUpdate')}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <Section title={t('privacy.section1Title')}>
          <p>
            {t('privacy.section1Text')}
          </p>
          <p>Contact : <strong>privacy@rebites.be</strong></p>
        </Section>

        <Section title={t('privacy.section2Title')}>
          <p>{t('privacy.section2Intro')}</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>{t('privacy.section2Merchants')}</strong> : email, nom du commerce, ville, t&eacute;l&eacute;phone (optionnel), type d&apos;activit&eacute;.</li>
            <li><strong>{t('privacy.section2Customers')}</strong> : pr&eacute;nom, nom, email, date de naissance (optionnel), code postal (optionnel).</li>
            <li><strong>{t('privacy.section2Usage')}</strong> : scans QR, historique de points/tampons, visites.</li>
          </ul>
        </Section>

        <Section title={t('privacy.section3Title')}>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('privacy.section3Item1')}</li>
            <li>{t('privacy.section3Item2')}</li>
            <li>{t('privacy.section3Item3')}</li>
            <li>{t('privacy.section3Item4')}</li>
            <li>{t('privacy.section3Item5')}</li>
          </ul>
        </Section>

        <Section title={t('privacy.section4Title')}>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>{t('privacy.section4Consent')}</strong> : inscription au programme fid&eacute;lit&eacute;, r&eacute;ception d&apos;offres marketing.</li>
            <li><strong>{t('privacy.section4Contract')}</strong> : gestion du compte commer&ccedil;ant, facturation.</li>
            <li><strong>{t('privacy.section4Interest')}</strong> : am&eacute;lioration du service, pr&eacute;vention de la fraude.</li>
          </ul>
        </Section>

        <Section title={t('privacy.section5Title')}>
          <p>
            {t('privacy.section5Text')}
          </p>
        </Section>

        <Section title={t('privacy.section6Title')}>
          <p>{t('privacy.section6Intro')}</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Supabase</strong> (h&eacute;bergement base de donn&eacute;es &mdash; serveurs UE).</li>
            <li><strong>Resend</strong> (envoi d&apos;emails transactionnels et marketing).</li>
            <li><strong>Stripe</strong> (paiements et facturation des commer&ccedil;ants).</li>
            <li><strong>Vercel</strong> (h&eacute;bergement de l&apos;application).</li>
            <li><strong>Google / Apple</strong> (g&eacute;n&eacute;ration de cartes Wallet).</li>
          </ul>
        </Section>

        <Section title={t('privacy.section7Title')}>
          <p>{t('privacy.section7Intro')}</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>{t('privacy.section7Access')}</strong> : obtenir une copie de vos donn&eacute;es.</li>
            <li><strong>{t('privacy.section7Rectification')}</strong> : corriger vos donn&eacute;es inexactes.</li>
            <li><strong>{t('privacy.section7Erasure')}</strong> : demander la suppression de vos donn&eacute;es.</li>
            <li><strong>{t('privacy.section7Opposition')}</strong> : vous opposer au traitement marketing.</li>
            <li><strong>{t('privacy.section7Portability')}</strong> : recevoir vos donn&eacute;es dans un format structur&eacute;.</li>
            <li><strong>{t('privacy.section7Withdrawal')}</strong> : &agrave; tout moment, sans affecter la lic&eacute;it&eacute; du traitement ant&eacute;rieur.</li>
          </ul>
          <p className="mt-2">
            {t('privacy.section7Contact')}
          </p>
        </Section>

        <Section title={t('privacy.section8Title')}>
          <p>
            {t('privacy.section8Text')}
          </p>
        </Section>

        <Section title={t('privacy.section9Title')}>
          <p>
            {t('privacy.section9Text')}
          </p>
        </Section>

        <Section title={t('privacy.section10Title')}>
          <p>
            {t('privacy.section10Text')}
          </p>
        </Section>

        <div className="border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-400 text-center">
            {t('privacy.footer')}
          </p>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-900 mb-3">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}
