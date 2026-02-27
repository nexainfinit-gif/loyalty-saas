import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendBirthdayEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  // Sécurité : vérifier le token cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  // Trouver tous les clients dont c'est l'anniversaire aujourd'hui
  const { data: customers, error } = await supabase
    .from('customers')
    .select('*, restaurants(*)')
    .eq('marketing_consent', true)
    .not('birth_date', 'is', null);

  if (error || !customers) {
    return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 });
  }

  const birthdayCustomers = customers.filter((c) => {
    const birth = new Date(c.birth_date);
    return birth.getMonth() + 1 === month && birth.getDate() === day;
  });

  // Envoyer les emails
  const results = await Promise.allSettled(
    birthdayCustomers.map((c) =>
      sendBirthdayEmail({
        to: c.email,
        firstName: c.first_name,
        restaurantName: c.restaurants.name,
        restaurantColor: c.restaurants.color,
      })
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`Anniversaires : ${sent} envoyés, ${failed} échoués`);

  return NextResponse.json({
    success: true,
    sent,
    failed,
    total: birthdayCustomers.length,
  });
}
