import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendWelcomeEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json();

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
    qrToken: customer.qr_token,
  });
  console.log('Email envoyé avec succès');
} catch (emailError) {
  console.error('Erreur email:', emailError);
};

  return NextResponse.json({
    success: true,
    qrToken: customer.qr_token,
    customerName: `${firstName} ${lastName}`,
    restaurantName: restaurant.name,
  });
}