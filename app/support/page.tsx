import Link from 'next/link';

/* ─── FAQ data ────────────────────────────────────────────── */
const faqs = [
  {
    q: 'Comment creer ma premiere carte de fidelite ?',
    a: 'Rendez-vous dans Wallet Studio depuis le menu lateral du dashboard. Creez un template de carte, personnalisez-le avec vos couleurs et votre logo, puis definissez-le comme template par defaut.',
  },
  {
    q: 'Comment scanner un QR code client ?',
    a: 'Ouvrez la page /dashboard/scanner depuis votre telephone mobile. Vous pouvez aussi ajouter un raccourci sur votre ecran d\u2019accueil pour un acces rapide.',
  },
  {
    q: 'Comment envoyer une campagne email ?',
    a: 'Dans le dashboard, allez dans l\u2019onglet Campagnes. Choisissez le type de campagne, redigez votre message et selectionnez vos destinataires. Cliquez sur Envoyer pour lancer la campagne.',
  },
  {
    q: 'Comment configurer Apple Wallet ?',
    a: 'Vous avez besoin d\u2019un compte Apple Developer. Creez un Pass Type ID dans le portail developer, generez un certificat .p12, puis configurez les variables d\u2019environnement APPLE_PASS_TYPE_IDENTIFIER, APPLE_TEAM_IDENTIFIER, APPLE_PASS_CERT_P12_BASE64, APPLE_PASS_CERT_PASSPHRASE et APPLE_WWDR_PEM.',
  },
  {
    q: 'Mon pass Apple ne se telecharge pas',
    a: 'Verifiez que toutes les variables d\u2019environnement APPLE_PASS_* sont correctement configurees dans votre projet Vercel. Assurez-vous que le certificat .p12 est valide et que le mot de passe correspond. Consultez les logs Vercel pour plus de details.',
  },
  {
    q: 'Comment ajouter le scanner sur l\u2019ecran d\u2019accueil ?',
    a: 'Ouvrez /dashboard/scanner dans Safari sur votre iPhone ou iPad. Appuyez sur le bouton Partager (icone carree avec une fleche), puis selectionnez "Sur l\u2019ecran d\u2019accueil". Sur Android, ouvrez le menu du navigateur et selectionnez "Ajouter a l\u2019ecran d\u2019accueil".',
  },
];

/* ─── Page ────────────────────────────────────────────────── */
export default function SupportPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour au dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Centre d&apos;aide</h1>
          <p className="mt-1 text-sm text-gray-500">
            Retrouvez les reponses aux questions les plus frequentes ou contactez notre equipe.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col gap-8">
        {/* ── Contact card ─────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Nous contacter</h2>
          <p className="text-sm text-gray-500 mb-4">
            Notre equipe repond generalement sous 24 heures ouvrables.
          </p>
          <a
            href="mailto:support@rebites.be"
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            support@rebites.be
          </a>
        </section>

        {/* ── FAQ ───────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Questions frequentes</h2>
          <div className="flex flex-col gap-4">
            {faqs.map((faq, i) => (
              <details
                key={i}
                className="group bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                  <span>{faq.q}</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ── Footer note ──────────────────────────────── */}
        <p className="text-xs text-gray-400 text-center pb-4">
          Rebites &mdash; Plateforme de fidelite pour commerces
        </p>
      </main>
    </div>
  );
}
