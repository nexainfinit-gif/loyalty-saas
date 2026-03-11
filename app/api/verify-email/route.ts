import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return new NextResponse(errorHtml('Lien invalide', 'Le lien de vérification est invalide ou incomplet.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Find customer with this verification token
  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, email_verified, restaurant_id')
    .eq('email_verification_token', token)
    .single();

  if (error || !customer) {
    return new NextResponse(errorHtml('Lien expiré', 'Ce lien de vérification est invalide ou a déjà été utilisé.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (customer.email_verified) {
    return new NextResponse(successHtml(customer.first_name, true), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Mark as verified and clear token
  const { error: updateError } = await supabaseAdmin
    .from('customers')
    .update({
      email_verified: true,
      email_verification_token: null,
    })
    .eq('id', customer.id);

  if (updateError) {
    return new NextResponse(errorHtml('Erreur', 'Une erreur est survenue. Veuillez réessayer.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new NextResponse(successHtml(customer.first_name, false), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function successHtml(firstName: string, alreadyVerified: boolean): string {
  const safeName = firstName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const message = alreadyVerified
    ? 'Votre adresse email a déjà été vérifiée.'
    : 'Votre adresse email a été vérifiée avec succès !';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email vérifié</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: white; border-radius: 24px; padding: 2.5rem; max-width: 400px; width: 100%; box-shadow: 0 4px 40px rgba(0,0,0,0.08); text-align: center; }
    .icon { width: 64px; height: 64px; background: #ecfdf5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; font-size: 2rem; }
    h1 { font-size: 1.5rem; color: #111; margin: 0 0 0.5rem; }
    p { color: #555; font-size: 0.95rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h1>Bonjour ${safeName} !</h1>
    <p>${message}</p>
    <p style="color: #aaa; font-size: 0.8rem; margin-top: 2rem;">Vous pouvez fermer cette page.</p>
  </div>
</body>
</html>`;
}

function errorHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: white; border-radius: 24px; padding: 2.5rem; max-width: 400px; width: 100%; box-shadow: 0 4px 40px rgba(0,0,0,0.08); text-align: center; }
    .icon { width: 64px; height: 64px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; font-size: 2rem; }
    h1 { font-size: 1.5rem; color: #111; margin: 0 0 0.5rem; }
    p { color: #555; font-size: 0.95rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
