import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary seed route — DELETE after use

export async function GET() {
  // Check campaigns table constraints
  const { data, error } = await supabaseAdmin.rpc('get_check_constraints', {}).maybeSingle();
  // Fallback: try inserting with different types and see which work
  const types = ['reengagement', 'birthday', 'near_reward', 'double_points', 'promo', 'custom', 'email', 'sms', 'push', 'welcome', 'reminder', 'promotion', 'offer'];
  const valid: string[] = [];
  for (const t of types) {
    const { error: e } = await supabaseAdmin.from('campaigns').insert({
      restaurant_id: '00000000-0000-0000-0000-000000000000',
      name: 'test', type: t, segment_type: 'all', segment: 'all',
      subject: 'test', body: 'test', recipients_count: 0, status: 'draft',
    });
    if (!e) {
      valid.push(t);
      // Clean up
      await supabaseAdmin.from('campaigns').delete().eq('name', 'test').eq('type', t);
    } else if (!e.message.includes('type_check')) {
      valid.push(`${t} (other error: ${e.message})`);
    }
  }
  return NextResponse.json({ valid_types: valid, rpc_error: error?.message });
}

export async function POST() {
  // 1. Find the first restaurant
  const { data: restaurant, error: rErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (rErr || !restaurant) {
    return NextResponse.json({ error: 'No restaurant found', detail: rErr }, { status: 404 });
  }

  const rid = restaurant.id;

  // 2. WIPE existing data
  await supabaseAdmin.from('transactions').delete().eq('restaurant_id', rid);
  await supabaseAdmin.from('campaigns').delete().eq('restaurant_id', rid);
  await supabaseAdmin.from('customers').delete().eq('restaurant_id', rid);
  await supabaseAdmin.from('loyalty_settings').delete().eq('restaurant_id', rid);

  // 3. Set loyalty settings — stamps mode, 10 stamps
  await supabaseAdmin.from('loyalty_settings').insert({
    restaurant_id: rid,
    program_type: 'stamps',
    points_per_scan: 10,
    reward_threshold: 100,
    reward_message: 'Bravo ! Votre 10ème visite est offerte 🎉',
    stamps_total: 10,
  });

  // 4. Generate 65 demo customers with realistic distribution
  const now = new Date();
  const DAY = 86400000;

  // Customer profiles: name, daysAgoJoined, visits, lastVisitDaysAgo, hasBirthdaySoon
  const profiles: Array<{
    first: string; last: string; daysAgo: number; visits: number;
    lastVisit: number; birthdaySoon: boolean; vip: boolean;
  }> = [
    // === VIP / Power users (frequent visitors, high engagement) ===
    { first: 'Sophie', last: 'Martin', daysAgo: 85, visits: 22, lastVisit: 1, birthdaySoon: false, vip: true },
    { first: 'Lucas', last: 'Dupont', daysAgo: 78, visits: 19, lastVisit: 0, birthdaySoon: false, vip: true },
    { first: 'Emma', last: 'Bernard', daysAgo: 90, visits: 18, lastVisit: 2, birthdaySoon: true, vip: true },
    { first: 'Hugo', last: 'Leroy', daysAgo: 82, visits: 16, lastVisit: 1, birthdaySoon: false, vip: true },
    { first: 'Léa', last: 'Moreau', daysAgo: 75, visits: 15, lastVisit: 3, birthdaySoon: false, vip: true },
    { first: 'Nathan', last: 'Simon', daysAgo: 88, visits: 14, lastVisit: 0, birthdaySoon: false, vip: true },
    { first: 'Chloé', last: 'Laurent', daysAgo: 70, visits: 13, lastVisit: 2, birthdaySoon: false, vip: true },
    { first: 'Raphaël', last: 'Michel', daysAgo: 65, visits: 12, lastVisit: 1, birthdaySoon: true, vip: true },

    // === Regular customers (visit every 1-2 weeks) — mostly joined 31-90 days ago ===
    { first: 'Manon', last: 'Garcia', daysAgo: 65, visits: 8, lastVisit: 4, birthdaySoon: false, vip: false },
    { first: 'Louis', last: 'Thomas', daysAgo: 70, visits: 7, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Camille', last: 'Robert', daysAgo: 62, visits: 7, lastVisit: 5, birthdaySoon: false, vip: false },
    { first: 'Arthur', last: 'Richard', daysAgo: 72, visits: 6, lastVisit: 6, birthdaySoon: true, vip: false },
    { first: 'Julie', last: 'Dubois', daysAgo: 68, visits: 6, lastVisit: 2, birthdaySoon: false, vip: false },
    { first: 'Théo', last: 'Petit', daysAgo: 55, visits: 6, lastVisit: 7, birthdaySoon: false, vip: false },
    { first: 'Sarah', last: 'Roux', daysAgo: 50, visits: 5, lastVisit: 4, birthdaySoon: false, vip: false },
    { first: 'Maxime', last: 'David', daysAgo: 64, visits: 5, lastVisit: 8, birthdaySoon: false, vip: false },
    { first: 'Alice', last: 'Bertrand', daysAgo: 58, visits: 5, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Antoine', last: 'Morel', daysAgo: 66, visits: 5, lastVisit: 10, birthdaySoon: false, vip: false },
    { first: 'Inès', last: 'Fournier', daysAgo: 52, visits: 4, lastVisit: 5, birthdaySoon: false, vip: false },
    { first: 'Paul', last: 'Girard', daysAgo: 56, visits: 4, lastVisit: 6, birthdaySoon: true, vip: false },

    // === Near reward (8-9 stamps, close to free item) — joined 45-70 days ago ===
    { first: 'Clara', last: 'Bonnet', daysAgo: 68, visits: 9, lastVisit: 2, birthdaySoon: false, vip: false },
    { first: 'Romain', last: 'Fontaine', daysAgo: 70, visits: 9, lastVisit: 4, birthdaySoon: false, vip: false },
    { first: 'Lina', last: 'Mercier', daysAgo: 60, visits: 8, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Gabriel', last: 'Chevalier', daysAgo: 65, visits: 8, lastVisit: 1, birthdaySoon: false, vip: false },
    { first: 'Zoé', last: 'Robin', daysAgo: 55, visits: 8, lastVisit: 5, birthdaySoon: false, vip: false },

    // === New customers (joined recently, 1-3 visits) ===
    { first: 'Adrien', last: 'Blanc', daysAgo: 7, visits: 2, lastVisit: 1, birthdaySoon: false, vip: false },
    { first: 'Jade', last: 'Guerin', daysAgo: 5, visits: 1, lastVisit: 5, birthdaySoon: false, vip: false },
    { first: 'Baptiste', last: 'Muller', daysAgo: 3, visits: 1, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Ambre', last: 'Henry', daysAgo: 10, visits: 3, lastVisit: 2, birthdaySoon: false, vip: false },
    { first: 'Victor', last: 'Rousseau', daysAgo: 6, visits: 2, lastVisit: 0, birthdaySoon: false, vip: false },
    { first: 'Eva', last: 'Perrin', daysAgo: 4, visits: 1, lastVisit: 4, birthdaySoon: false, vip: false },
    { first: 'Thomas', last: 'Masson', daysAgo: 8, visits: 2, lastVisit: 1, birthdaySoon: false, vip: false },
    { first: 'Nina', last: 'Denis', daysAgo: 2, visits: 1, lastVisit: 2, birthdaySoon: false, vip: false },
    { first: 'Mathis', last: 'Marchand', daysAgo: 9, visits: 3, lastVisit: 0, birthdaySoon: false, vip: false },
    { first: 'Lucie', last: 'Lemaire', daysAgo: 1, visits: 1, lastVisit: 1, birthdaySoon: false, vip: false },
    { first: 'Enzo', last: 'Duval', daysAgo: 11, visits: 2, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Margaux', last: 'Picard', daysAgo: 6, visits: 1, lastVisit: 6, birthdaySoon: false, vip: false },

    // === Inactive / At-risk (haven't visited in 30+ days) ===
    { first: 'Alexandre', last: 'Andre', daysAgo: 80, visits: 5, lastVisit: 35, birthdaySoon: false, vip: false },
    { first: 'Lola', last: 'Colin', daysAgo: 70, visits: 4, lastVisit: 42, birthdaySoon: false, vip: false },
    { first: 'Julien', last: 'Arnaud', daysAgo: 85, visits: 3, lastVisit: 50, birthdaySoon: false, vip: false },
    { first: 'Charlotte', last: 'Schmitt', daysAgo: 60, visits: 2, lastVisit: 38, birthdaySoon: false, vip: false },
    { first: 'Axel', last: 'Barbier', daysAgo: 75, visits: 6, lastVisit: 45, birthdaySoon: false, vip: false },
    { first: 'Louise', last: 'Renard', daysAgo: 90, visits: 7, lastVisit: 55, birthdaySoon: false, vip: false },
    { first: 'Clément', last: 'Gaillard', daysAgo: 65, visits: 3, lastVisit: 40, birthdaySoon: false, vip: false },
    { first: 'Marie', last: 'Brun', daysAgo: 88, visits: 4, lastVisit: 60, birthdaySoon: false, vip: false },
    { first: 'Pierre', last: 'Roy', daysAgo: 72, visits: 2, lastVisit: 48, birthdaySoon: false, vip: false },
    { first: 'Anaïs', last: 'Noel', daysAgo: 55, visits: 3, lastVisit: 33, birthdaySoon: false, vip: false },
    { first: 'Ethan', last: 'Faure', daysAgo: 68, visits: 5, lastVisit: 52, birthdaySoon: true, vip: false },
    { first: 'Mélanie', last: 'Legrand', daysAgo: 78, visits: 4, lastVisit: 44, birthdaySoon: false, vip: false },
    { first: 'Noé', last: 'Garnier', daysAgo: 82, visits: 3, lastVisit: 58, birthdaySoon: false, vip: false },

    // === Additional customers — mostly recent (< 30 days) to show growth ===
    { first: 'Léo', last: 'Fabre', daysAgo: 14, visits: 4, lastVisit: 2, birthdaySoon: false, vip: false },
    { first: 'Rose', last: 'Brunet', daysAgo: 12, visits: 3, lastVisit: 4, birthdaySoon: false, vip: false },
    { first: 'Sacha', last: 'Lemoine', daysAgo: 18, visits: 4, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Agathe', last: 'Carpentier', daysAgo: 16, visits: 3, lastVisit: 5, birthdaySoon: true, vip: false },
    { first: 'Malo', last: 'Dufour', daysAgo: 20, visits: 3, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Romane', last: 'Blanchard', daysAgo: 22, visits: 4, lastVisit: 4, birthdaySoon: false, vip: false },
    { first: 'Oscar', last: 'Caron', daysAgo: 19, visits: 2, lastVisit: 6, birthdaySoon: false, vip: false },
    { first: 'Célia', last: 'Maillard', daysAgo: 25, visits: 5, lastVisit: 2, birthdaySoon: false, vip: false },
    { first: 'Valentin', last: 'Rivière', daysAgo: 8, visits: 2, lastVisit: 2, birthdaySoon: false, vip: false },
    { first: 'Elsa', last: 'Leclerc', daysAgo: 15, visits: 2, lastVisit: 3, birthdaySoon: false, vip: false },
    { first: 'Nolan', last: 'Guillot', daysAgo: 21, visits: 5, lastVisit: 4, birthdaySoon: false, vip: false },
    { first: 'Lilou', last: 'Tessier', daysAgo: 17, visits: 6, lastVisit: 1, birthdaySoon: false, vip: false },
    { first: 'Gabin', last: 'Charpentier', daysAgo: 23, visits: 4, lastVisit: 5, birthdaySoon: false, vip: false },
    { first: 'Mila', last: 'Vidal', daysAgo: 13, visits: 3, lastVisit: 2, birthdaySoon: false, vip: false },
  ];

  const customers: Array<Record<string, unknown>> = profiles.map((p) => {
    const createdAt = new Date(now.getTime() - p.daysAgo * DAY);
    const lastVisitAt = new Date(now.getTime() - p.lastVisit * DAY);
    const totalPoints = p.visits * 10;
    const stampsCount = p.visits % 10;
    const completedCards = Math.floor(p.visits / 10);

    // Birthday: soon = within next 7 days, otherwise random
    let birthDate: string;
    if (p.birthdaySoon) {
      const bd = new Date(now.getTime() + Math.floor(Math.random() * 7) * DAY);
      birthDate = `1992-${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`;
    } else {
      const year = 1975 + Math.floor(Math.random() * 27);
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      birthDate = `${year}-${month}-${day}`;
    }

    const email = `${p.first.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.${p.last.toLowerCase()}@demo.com`;

    return {
      restaurant_id: rid,
      first_name: p.first,
      last_name: p.last,
      email,
      birth_date: birthDate,
      qr_token: crypto.randomUUID(),
      total_points: totalPoints,
      total_visits: p.visits,
      stamps_count: stampsCount,
      completed_cards: completedCards,
      last_visit_at: lastVisitAt.toISOString(),
      created_at: createdAt.toISOString(),
    };
  });

  const { data: insertedCustomers, error: cErr } = await supabaseAdmin
    .from('customers')
    .insert(customers)
    .select('id, first_name, total_visits, created_at');

  if (cErr) {
    return NextResponse.json({ error: 'Customer insert failed', detail: cErr }, { status: 500 });
  }

  // 5. Generate transactions
  const transactions: Array<Record<string, unknown>> = [];

  for (const cust of insertedCustomers ?? []) {
    const profile = profiles.find(p => p.first === cust.first_name);
    if (!profile) continue;

    const visits = profile.visits;
    const custCreated = new Date(cust.created_at);
    const lastVisitAt = new Date(now.getTime() - profile.lastVisit * DAY);

    // Spread scan transactions evenly between creation and last visit
    for (let v = 0; v < visits; v++) {
      const progress = visits > 1 ? v / (visits - 1) : 0;
      const txTime = new Date(
        custCreated.getTime() + progress * (lastVisitAt.getTime() - custCreated.getTime())
      );
      // Add small random jitter (±hours)
      txTime.setTime(txTime.getTime() + (Math.random() - 0.5) * 6 * 3600000);

      transactions.push({
        customer_id: cust.id,
        restaurant_id: rid,
        points_delta: 10,
        type: 'visit',
        created_at: txTime.toISOString(),
      });
    }

  }

  // Insert in batches
  let txInserted = 0;
  for (let i = 0; i < transactions.length; i += 500) {
    const batch = transactions.slice(i, i + 500);
    const { error: tErr } = await supabaseAdmin.from('transactions').insert(batch);
    if (tErr) {
      return NextResponse.json({ error: 'Transaction insert failed', detail: tErr, inserted: txInserted }, { status: 500 });
    }
    txInserted += batch.length;
  }

  // 6. Generate realistic campaigns history
  const campaigns = [
    {
      restaurant_id: rid,
      name: 'Lancement programme fidélité',
      type: 'email',
      segment_type: 'all',
      segment: 'all',
      subject: 'Bienvenue dans notre programme fidélité !',
      body: 'Découvrez notre programme de fidélité et gagnez des récompenses à chaque visite.',
      recipients_count: 25,
      status: 'sent',
      sent_at: new Date(now.getTime() - 75 * DAY).toISOString(),
    },
    {
      restaurant_id: rid,
      name: 'Double points — Ouverture terrasse',
      type: 'email',
      segment_type: 'all',
      segment: 'all',
      subject: 'Double points cette semaine !',
      body: 'Profitez du double de points à chaque visite cette semaine.',
      recipients_count: 40,
      status: 'sent',
      sent_at: new Date(now.getTime() - 52 * DAY).toISOString(),
    },
    {
      restaurant_id: rid,
      name: 'Relance clients inactifs (février)',
      type: 'email',
      segment_type: 'inactive_45',
      segment: 'inactive_45',
      subject: 'On vous manque !',
      body: 'Cela fait un moment, revenez nous voir.',
      recipients_count: 18,
      status: 'sent',
      sent_at: new Date(now.getTime() - 38 * DAY).toISOString(),
    },
    {
      restaurant_id: rid,
      name: 'Vœux anniversaire — Mars',
      type: 'email',
      segment_type: 'birthday',
      segment: 'birthday',
      subject: 'Joyeux anniversaire !',
      body: 'Une surprise vous attend pour votre anniversaire.',
      recipients_count: 6,
      status: 'sent',
      sent_at: new Date(now.getTime() - 9 * DAY).toISOString(),
    },
    {
      restaurant_id: rid,
      name: 'Promo weekend — Café offert',
      type: 'email',
      segment_type: 'all',
      segment: 'all',
      subject: 'Offre spéciale ce weekend !',
      body: 'Un café offert pour toute visite ce weekend.',
      recipients_count: 52,
      status: 'sent',
      sent_at: new Date(now.getTime() - 21 * DAY).toISOString(),
    },
    {
      restaurant_id: rid,
      name: 'Récompense proche — Dernier tampon !',
      type: 'email',
      segment_type: 'near_reward',
      segment: 'near_reward',
      subject: 'Plus qu\'un tampon !',
      body: 'Vous êtes si proche de votre récompense.',
      recipients_count: 8,
      status: 'sent',
      sent_at: new Date(now.getTime() - 5 * DAY).toISOString(),
    },
    {
      restaurant_id: rid,
      name: 'Relance inactifs — Mars',
      type: 'email',
      segment_type: 'inactive_45',
      segment: 'inactive_45',
      subject: 'Vos points vous attendent',
      body: 'Revenez profiter de vos points accumulés.',
      recipients_count: 13,
      status: 'sent',
      sent_at: new Date(now.getTime() - 3 * DAY).toISOString(),
    },
  ];

  // Insert campaigns one by one, skip any that fail the type check
  let campaignsInserted = 0;
  for (const camp of campaigns) {
    const { error: campErr } = await supabaseAdmin.from('campaigns').insert(camp);
    if (!campErr) campaignsInserted++;
  }

  // 7. Set average_ticket setting for revenue KPIs
  await supabaseAdmin.from('restaurant_settings').upsert({
    restaurant_id: rid,
    key: 'average_ticket',
    value: '18.50',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'restaurant_id,key' });

  // Summary
  const vipCount = profiles.filter(p => p.vip).length;
  const inactiveCount = profiles.filter(p => p.lastVisit > 30).length;
  const nearRewardCount = profiles.filter(p => p.visits % 10 >= 8).length;
  const newCount = profiles.filter(p => p.daysAgo <= 14).length;
  const birthdayCount = profiles.filter(p => p.birthdaySoon).length;

  return NextResponse.json({
    success: true,
    restaurant: restaurant.name,
    summary: {
      total_customers: profiles.length,
      vip_customers: vipCount,
      inactive_at_risk: inactiveCount,
      near_reward: nearRewardCount,
      new_this_month: newCount,
      birthday_soon: birthdayCount,
      transactions: txInserted,
      campaigns: campaignsInserted,
      average_ticket: '18.50€',
    },
  });
}
