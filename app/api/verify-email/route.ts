import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { autoIssueApplePass } from '@/lib/wallet-auto-issue';

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
    // Already verified — still show wallet buttons
    const appleWalletUrl = await getAppleWalletUrl(customer.restaurant_id, customer.id);
    return new NextResponse(successHtml(customer.first_name, true, appleWalletUrl), {
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

  // Auto-issue Apple Wallet pass now that email is confirmed
  const appleWalletUrl = await getAppleWalletUrl(customer.restaurant_id, customer.id);

  return new NextResponse(successHtml(customer.first_name, false, appleWalletUrl), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function getAppleWalletUrl(restaurantId: string, customerId: string): Promise<string | null> {
  // Check for existing Apple pass
  const { data: existingPass } = await supabaseAdmin
    .from('wallet_passes')
    .select('id')
    .eq('customer_id', customerId)
    .eq('restaurant_id', restaurantId)
    .eq('platform', 'apple')
    .eq('status', 'active')
    .maybeSingle();

  if (existingPass) {
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${existingPass.id}/pkpass`;
  }

  // Issue new pass
  const applePassId = await autoIssueApplePass({ restaurantId, customerId });
  if (applePassId) {
    return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/wallet/passes/${applePassId}/pkpass`;
  }
  return null;
}

function successHtml(firstName: string, alreadyVerified: boolean, appleWalletUrl: string | null): string {
  const safeName = firstName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const message = alreadyVerified
    ? 'Votre adresse email a déjà été vérifiée.'
    : 'Votre adresse email a été vérifiée avec succès !';

  const walletSection = appleWalletUrl ? `
    <div style="background: #f8f9fa; border-radius: 16px; padding: 1.25rem; margin-top: 1.5rem; border: 1.5px solid #e5e7eb;">
      <p style="font-size: 0.85rem; font-weight: 600; color: #111; margin: 0 0 0.75rem;">📱 Ajoutez votre carte à votre Wallet</p>
      <a href="${appleWalletUrl}" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: #000; color: white; text-decoration: none; padding: 0.875rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
        <svg width="20" height="24" viewBox="0 0 20 24" fill="white"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
        Ajouter à Apple Wallet
      </a>
    </div>` : '';

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
    ${walletSection}
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
