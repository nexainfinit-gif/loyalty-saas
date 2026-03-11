export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <a href="/" className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-3 inline-block">
            ← Retour
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Politique de confidentialité</h1>
          <p className="text-sm text-gray-500 mt-1">Dernière mise à jour : 11 mars 2026</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <Section title="1. Responsable du traitement">
          <p>
            ReBites SRL, ci-après &quot;ReBites&quot;, &quot;nous&quot;, est responsable du traitement
            des données personnelles collectées via la plateforme ReBites (rebites.be).
          </p>
          <p>Contact : <strong>privacy@rebites.be</strong></p>
        </Section>

        <Section title="2. Données collectées">
          <p>Nous collectons les données suivantes :</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Commerçants</strong> : email, nom du commerce, ville, téléphone (optionnel), type d&apos;activité.</li>
            <li><strong>Clients finaux</strong> : prénom, nom, email, date de naissance (optionnel), code postal (optionnel).</li>
            <li><strong>Données d&apos;utilisation</strong> : scans QR, historique de points/tampons, visites.</li>
          </ul>
        </Section>

        <Section title="3. Finalités du traitement">
          <ul className="list-disc pl-5 space-y-1">
            <li>Gestion du programme de fidélité (points, tampons, récompenses).</li>
            <li>Envoi de communications marketing (avec consentement explicite).</li>
            <li>Génération de cartes digitales (Apple Wallet, Google Wallet).</li>
            <li>Statistiques anonymisées pour les commerçants.</li>
            <li>Envoi d&apos;emails transactionnels (bienvenue, anniversaire).</li>
          </ul>
        </Section>

        <Section title="4. Base légale">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Consentement</strong> : inscription au programme fidélité, réception d&apos;offres marketing.</li>
            <li><strong>Exécution du contrat</strong> : gestion du compte commerçant, facturation.</li>
            <li><strong>Intérêt légitime</strong> : amélioration du service, prévention de la fraude.</li>
          </ul>
        </Section>

        <Section title="5. Durée de conservation">
          <p>
            Les données des clients finaux sont conservées tant que le programme de fidélité du commerçant
            est actif. Les données sont supprimées dans un délai de 30 jours après la clôture du compte
            ou sur demande de suppression.
          </p>
        </Section>

        <Section title="6. Partage des données">
          <p>Nous ne vendons jamais vos données. Elles peuvent être partagées avec :</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Supabase</strong> (hébergement base de données — serveurs UE).</li>
            <li><strong>Resend</strong> (envoi d&apos;emails transactionnels et marketing).</li>
            <li><strong>Stripe</strong> (paiements et facturation des commerçants).</li>
            <li><strong>Vercel</strong> (hébergement de l&apos;application).</li>
            <li><strong>Google / Apple</strong> (génération de cartes Wallet).</li>
          </ul>
        </Section>

        <Section title="7. Vos droits (RGPD)">
          <p>Conformément au Règlement Général sur la Protection des Données, vous disposez des droits suivants :</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Droit d&apos;accès</strong> : obtenir une copie de vos données.</li>
            <li><strong>Droit de rectification</strong> : corriger vos données inexactes.</li>
            <li><strong>Droit à l&apos;effacement</strong> : demander la suppression de vos données.</li>
            <li><strong>Droit d&apos;opposition</strong> : vous opposer au traitement marketing.</li>
            <li><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré.</li>
            <li><strong>Droit de retrait du consentement</strong> : à tout moment, sans affecter la licéité du traitement antérieur.</li>
          </ul>
          <p className="mt-2">
            Pour exercer vos droits, contactez-nous à <strong>privacy@rebites.be</strong>.
            Nous répondrons dans un délai de 30 jours.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            ReBites utilise uniquement des cookies essentiels au fonctionnement de la plateforme
            (session d&apos;authentification Supabase). Aucun cookie de tracking publicitaire n&apos;est utilisé.
          </p>
        </Section>

        <Section title="9. Sécurité">
          <p>
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger
            vos données : chiffrement en transit (TLS), isolation des données par commerçant,
            authentification forte, et accès restreint aux données sensibles.
          </p>
        </Section>

        <Section title="10. Réclamation">
          <p>
            Si vous estimez que le traitement de vos données ne respecte pas le RGPD,
            vous pouvez introduire une réclamation auprès de l&apos;Autorité de protection
            des données (APD) : <strong>www.autoriteprotectiondonnees.be</strong>.
          </p>
        </Section>

        <div className="border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-400 text-center">
            ReBites · Plateforme de fidélité pour commerces
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
