import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { sendWelcomeEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  console.log('=== API REGISTER START ===');
  const body = await req.json();
  console.log('Body reçu:', body);
  console.log('Clé Resend:', process.env.RESEND_API_KEY ? 'OK' : 'MANQUANTE');

  const {
    restaurantSlug,
    firstName,
    lastName,
    email,
    birthDate,
    postalCode,
    marketingConsent,
  } = body;

  // Validation
  if (!firstName || !lastName || !email || !marketingConsent) {
    return NextResponse.json(
      { error: 'Champs requis manquants' },
      { status: 400 }
    );
  }

  // Récupérer le restaurant
  const { data: restaurant, error: restError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', restaurantSlug)
    .single();

console.log('Restaurant trouvé:', restaurant);
console.log('Erreur restaurant:', restError);

  if (restError || !restaurant) {
    return NextResponse.json(
      { error: 'Restaurant introuvable' },
      { status: 404 }
    );
  }
    
  // Créer le client
  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      restaurant_id: restaurant.id,
      first_name: firstName,
      last_name: lastName,
      email: email.toLowerCase().trim(),
      birth_date: birthDate || null,
      postal_code: postalCode || null,
      marketing_consent: true,
      consent_date: new Date().toISOString(),
    })
    .select()
    .single();
    console.log('Customer data:', customer);
    console.log('Customer error:', error);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Vous êtes déjà inscrit(e) pour ce restaurant.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  // Envoyer l'email de bienvenue
try {
  await sendWelcomeEmail({
    to: email,
    firstName,
    restaurantName: restaurant.name,
    restaurantColor: restaurant.color,
    qrToken: customer.qr_token,
  });
  console.log('Email envoyé avec succès');
} catch (emailError) {
  console.error('Erreur email:', emailError);
}

console.log('Client créé avec succès:', customer.id);
  return NextResponse.json({
    success: true,
    qrToken: customer.qr_token,
    customerName: `${firstName} ${lastName}`,
    restaurantName: restaurant.name,
  });
}