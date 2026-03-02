import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendBirthdayEmail } from '@/lib/email';

export async function GET(req: NextRequest) {
  // Security: validate CRON_SECRET before any DB access
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const month = today.getMonth() + 1;
  const day   = today.getDate();

  // Use supabaseAdmin (service role) — cron runs server-side with no user session.
  // Filter: consent_marketing = true (matching the column name used at registration).
  const { data: customers, error } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, email, birth_date, qr_token, restaurants(name, primary_color)')
    .eq('consent_marketing', true)
    .not('birth_date', 'is', null)
    .not('email', 'is', null);

  if (error || !customers) {
    console.error('[cron/birthdays] DB error:', error);
    return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 });
  }

  const birthdayCustomers = customers.filter((c) => {
    const birth = new Date(c.birth_date as string);
    return birth.getMonth() + 1 === month && birth.getDate() === day;
  });

  const results = await Promise.allSettled(
    birthdayCustomers.map((c) => {
      const restaurant = c.restaurants as { name: string; primary_color: string } | null;
      if (!restaurant) return Promise.resolve();

      return sendBirthdayEmail({
        to:              c.email as string,
        firstName:       c.first_name as string,
        restaurantName:  restaurant.name,
        restaurantColor: restaurant.primary_color,
        qrToken:         c.qr_token as string | undefined,
      });
    })
  );

  const sent   = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`[cron/birthdays] sent=${sent} failed=${failed} total=${birthdayCustomers.length}`);

  return NextResponse.json({
    success: true,
    sent,
    failed,
    total: birthdayCustomers.length,
  });
}
