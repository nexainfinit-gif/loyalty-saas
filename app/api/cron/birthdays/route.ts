import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendBirthdayEmail } from '@/lib/email';

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: NextRequest) {
  // Security: validate CRON_SECRET with timing-safe comparison
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!timingSafeCompare(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const month = today.getMonth() + 1;
  const day   = today.getDate();

  // Use supabaseAdmin (service role) — cron runs server-side with no user session.
  // Filter: consent_marketing = true (matching the column name used at registration).
  const { data: customers, error } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, email, birth_date, qr_token, restaurant_id, restaurants(name, primary_color)')
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

  // Group by restaurant to enforce per-restaurant rate limits
  const MAX_BIRTHDAY_EMAILS_PER_RESTAURANT = 50;
  const byRestaurant = new Map<string, typeof birthdayCustomers>();
  for (const c of birthdayCustomers) {
    const rid = (c as { restaurant_id: string }).restaurant_id;
    const list = byRestaurant.get(rid) ?? [];
    list.push(c);
    byRestaurant.set(rid, list);
  }

  const emailTasks: Promise<void>[] = [];
  for (const [restaurantId, group] of byRestaurant) {
    const capped = group.slice(0, MAX_BIRTHDAY_EMAILS_PER_RESTAURANT);
    if (capped.length < group.length) {
      console.warn(`[cron/birthdays] restaurant ${restaurantId}: capped ${group.length} → ${capped.length}`);
    }
    for (const c of capped) {
      const restaurant = c.restaurants as unknown as { name: string; primary_color: string } | null;
      if (!restaurant) continue;
      emailTasks.push(
        sendBirthdayEmail({
          to:              c.email as string,
          firstName:       c.first_name as string,
          restaurantName:  restaurant.name,
          restaurantColor: restaurant.primary_color,
          qrToken:         c.qr_token as string | undefined,
        }),
      );
    }
  }

  const results = await Promise.allSettled(emailTasks);

  const sent   = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`[cron/birthdays] sent=${sent} failed=${failed} total=${birthdayCustomers.length} restaurants=${byRestaurant.size}`);

  return NextResponse.json({
    success: true,
    sent,
    failed,
    total: birthdayCustomers.length,
  });
}
