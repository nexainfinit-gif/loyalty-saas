import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Diagnostic Brevo — TEMPORAIRE. Teste la clé API sans envoyer d'email
 * (appelle GET /v3/account). Renvoie le statut + la réponse Brevo pour
 * diagnostiquer un échec d'envoi. Protégé par ?secret=<CRON_SECRET>.
 * À SUPPRIMER une fois Brevo opérationnel.
 */
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé (ajoutez ?secret=<CRON_SECRET>).' }, { status: 401 });
  }

  const key = process.env.BREVO_API_KEY;
  if (!key) {
    return NextResponse.json({ configured: false, message: 'BREVO_API_KEY absent sur ce déploiement.' });
  }

  let accountStatus = 0;
  let accountBody: unknown = null;
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key, accept: 'application/json' },
    });
    accountStatus = res.status;
    accountBody = await res.json().catch(async () => await res.text());
  } catch (err) {
    accountBody = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    keyConfigured: true,
    keyPrefix: key.slice(0, 8),          // ex. "xkeysib-" attendu
    keyLength: key.length,
    accountStatus,                        // 200 = clé OK ; 401 = clé invalide ; 403 = IP/permission
    account: accountBody,                 // infos compte si OK, message d'erreur Brevo sinon
  });
}
