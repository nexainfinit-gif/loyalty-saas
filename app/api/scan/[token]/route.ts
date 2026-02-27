import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  console.log('Token reçu:', token);
  // Trouver le client par son QR token
  const { data: customer, error } = await supabase
    .from('customers')
    .select('*, restaurants(*)')
    .eq('qr_token', token)
    .single();

  if (error || !customer) {
    return new NextResponse(
      `<!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>QR Code invalide</title>
      </head>
      <body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2;">
        <div style="background:white;border-radius:16px;padding:2rem;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.1);">
          <div style="font-size:4rem;">❌</div>
          <h1 style="color:#dc2626;">QR Code invalide</h1>
        </div>
      </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // Incrémenter les points
  const newPoints = customer.points + 1;

  await supabase
    .from('customers')
    .update({
      points: newPoints,
      last_visit_at: new Date().toISOString(),
    })
    .eq('id', customer.id);

  // Enregistrer dans l'historique
  await supabase.from('scan_history').insert({
    customer_id: customer.id,
    restaurant_id: customer.restaurant_id,
    points_added: 1,
  });

  // Page de confirmation
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>+1 Point !</title>
      <style>
        body {
          font-family: system-ui;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: #f0fdf4;
        }
        .card {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          text-align: center;
          box-shadow: 0 4px 24px rgba(0,0,0,0.1);
          max-width: 320px;
          width: 90%;
        }
        .emoji { font-size: 4rem; }
        .points { font-size: 3rem; font-weight: bold; color: #15803d; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="emoji">🎉</div>
        <h1 style="color:#16a34a;">+1 point !</h1>
        <div class="points">${newPoints}</div>
        <p style="color:#374151;">points au total</p>
        <p style="color:#6b7280;font-size:0.9rem;">
          Bonjour <strong>${customer.first_name}</strong> !<br>
          Merci pour votre visite chez<br>
          <strong>${customer.restaurants.name}</strong>
        </p>
      </div>
    </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}