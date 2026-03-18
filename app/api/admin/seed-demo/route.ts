// app/api/admin/seed-demo/route.ts
//
// POST — Creates 5 demo restaurants with varied business types, plans, and customer data.
// DELETE — Removes all demo restaurants (is_demo = true) and cascading data.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ── Demo restaurant definitions ──────────────────────────────────────────── */

interface DemoConfig {
  name:          string;
  slug:          string;
  businessType:  string;
  planKey:       string;
  color:         string;
  programType:   'stamps' | 'points';
  stampsTotal:   number;
  pointsPerScan: number;
  rewardThreshold: number;
  rewardMessage: string;
  avgTicket:     string;
  customers:     CustomerProfile[];
  campaigns:     CampaignSeed[];
}

interface CustomerProfile {
  first: string; last: string; daysAgo: number; visits: number;
  lastVisit: number; birthdaySoon: boolean; vip: boolean;
}

interface CampaignSeed {
  name: string; segment: string; subject: string; body: string;
  recipientsCount: number; daysAgo: number;
}

const DEMO_CONFIGS: DemoConfig[] = [
  // ── 1. Restaurant (Pro, stamps) ───────────────────────────────────────────
  {
    name: 'Le Bistrot Parisien', slug: 'demo-bistrot', businessType: 'restaurant',
    planKey: 'pro', color: '#4F6BED', programType: 'stamps', stampsTotal: 10,
    pointsPerScan: 10, rewardThreshold: 100, rewardMessage: '10ème repas offert !',
    avgTicket: '22.50',
    customers: [
      { first: 'Sophie', last: 'Martin', daysAgo: 85, visits: 22, lastVisit: 1, birthdaySoon: false, vip: true },
      { first: 'Lucas', last: 'Dupont', daysAgo: 78, visits: 19, lastVisit: 0, birthdaySoon: false, vip: true },
      { first: 'Emma', last: 'Bernard', daysAgo: 90, visits: 18, lastVisit: 2, birthdaySoon: true, vip: true },
      { first: 'Hugo', last: 'Leroy', daysAgo: 82, visits: 16, lastVisit: 1, birthdaySoon: false, vip: true },
      { first: 'Léa', last: 'Moreau', daysAgo: 75, visits: 15, lastVisit: 3, birthdaySoon: false, vip: true },
      { first: 'Manon', last: 'Garcia', daysAgo: 65, visits: 8, lastVisit: 4, birthdaySoon: false, vip: false },
      { first: 'Louis', last: 'Thomas', daysAgo: 70, visits: 7, lastVisit: 3, birthdaySoon: false, vip: false },
      { first: 'Camille', last: 'Robert', daysAgo: 62, visits: 7, lastVisit: 5, birthdaySoon: false, vip: false },
      { first: 'Arthur', last: 'Richard', daysAgo: 72, visits: 6, lastVisit: 6, birthdaySoon: true, vip: false },
      { first: 'Julie', last: 'Dubois', daysAgo: 68, visits: 6, lastVisit: 2, birthdaySoon: false, vip: false },
      { first: 'Clara', last: 'Bonnet', daysAgo: 68, visits: 9, lastVisit: 2, birthdaySoon: false, vip: false },
      { first: 'Romain', last: 'Fontaine', daysAgo: 70, visits: 9, lastVisit: 4, birthdaySoon: false, vip: false },
      { first: 'Adrien', last: 'Blanc', daysAgo: 7, visits: 2, lastVisit: 1, birthdaySoon: false, vip: false },
      { first: 'Jade', last: 'Guerin', daysAgo: 5, visits: 1, lastVisit: 5, birthdaySoon: false, vip: false },
      { first: 'Baptiste', last: 'Muller', daysAgo: 3, visits: 1, lastVisit: 3, birthdaySoon: false, vip: false },
      { first: 'Alexandre', last: 'Andre', daysAgo: 80, visits: 5, lastVisit: 35, birthdaySoon: false, vip: false },
      { first: 'Lola', last: 'Colin', daysAgo: 70, visits: 4, lastVisit: 42, birthdaySoon: false, vip: false },
      { first: 'Julien', last: 'Arnaud', daysAgo: 85, visits: 3, lastVisit: 50, birthdaySoon: false, vip: false },
      { first: 'Léo', last: 'Fabre', daysAgo: 14, visits: 4, lastVisit: 2, birthdaySoon: false, vip: false },
      { first: 'Rose', last: 'Brunet', daysAgo: 12, visits: 3, lastVisit: 4, birthdaySoon: false, vip: false },
    ],
    campaigns: [
      { name: 'Lancement fidélité', segment: 'all', subject: 'Bienvenue !', body: 'Programme fidélité lancé.', recipientsCount: 20, daysAgo: 75 },
      { name: 'Relance inactifs', segment: 'inactive_45', subject: 'On vous manque !', body: 'Revenez nous voir.', recipientsCount: 8, daysAgo: 30 },
      { name: 'Double points terrasse', segment: 'all', subject: 'Double points !', body: 'Profitez-en cette semaine.', recipientsCount: 18, daysAgo: 15 },
      { name: 'Anniversaires mars', segment: 'birthday', subject: 'Joyeux anniversaire !', body: 'Surprise !', recipientsCount: 3, daysAgo: 5 },
      { name: 'Promo midi', segment: 'all', subject: 'Menu midi à -20%', body: 'Offre limitée.', recipientsCount: 20, daysAgo: 2 },
    ],
  },

  // ── 2. Café (Starter, points) ─────────────────────────────────────────────
  {
    name: 'Café des Artistes', slug: 'demo-cafe', businessType: 'cafe',
    planKey: 'starter', color: '#10B981', programType: 'points', stampsTotal: 10,
    pointsPerScan: 5, rewardThreshold: 50, rewardMessage: 'Café offert !',
    avgTicket: '4.80',
    customers: [
      { first: 'Marie', last: 'Leclerc', daysAgo: 60, visits: 30, lastVisit: 0, birthdaySoon: false, vip: true },
      { first: 'Thomas', last: 'Petit', daysAgo: 55, visits: 25, lastVisit: 1, birthdaySoon: false, vip: true },
      { first: 'Inès', last: 'Roux', daysAgo: 50, visits: 20, lastVisit: 0, birthdaySoon: true, vip: true },
      { first: 'Paul', last: 'Girard', daysAgo: 45, visits: 12, lastVisit: 2, birthdaySoon: false, vip: false },
      { first: 'Chloé', last: 'Laurent', daysAgo: 40, visits: 10, lastVisit: 3, birthdaySoon: false, vip: false },
      { first: 'Nathan', last: 'Simon', daysAgo: 35, visits: 8, lastVisit: 1, birthdaySoon: false, vip: false },
      { first: 'Sarah', last: 'David', daysAgo: 30, visits: 6, lastVisit: 4, birthdaySoon: false, vip: false },
      { first: 'Maxime', last: 'Morel', daysAgo: 25, visits: 5, lastVisit: 5, birthdaySoon: false, vip: false },
      { first: 'Eva', last: 'Perrin', daysAgo: 10, visits: 3, lastVisit: 2, birthdaySoon: false, vip: false },
      { first: 'Victor', last: 'Masson', daysAgo: 5, visits: 1, lastVisit: 5, birthdaySoon: false, vip: false },
      { first: 'Nina', last: 'Denis', daysAgo: 3, visits: 1, lastVisit: 3, birthdaySoon: false, vip: false },
      { first: 'Ethan', last: 'Faure', daysAgo: 70, visits: 6, lastVisit: 48, birthdaySoon: false, vip: false },
      { first: 'Charlotte', last: 'Brun', daysAgo: 65, visits: 4, lastVisit: 38, birthdaySoon: false, vip: false },
      { first: 'Mila', last: 'Vidal', daysAgo: 14, visits: 4, lastVisit: 1, birthdaySoon: false, vip: false },
      { first: 'Gabin', last: 'Tessier', daysAgo: 8, visits: 2, lastVisit: 2, birthdaySoon: false, vip: false },
    ],
    campaigns: [
      { name: 'Happy hour fidélité', segment: 'all', subject: 'Points x2 !', body: 'Happy hour fidélité.', recipientsCount: 15, daysAgo: 40 },
      { name: 'Nouveau blend', segment: 'active', subject: 'Nouveau café !', body: 'Découvrez notre blend.', recipientsCount: 10, daysAgo: 12 },
      { name: 'Relance', segment: 'inactive_45', subject: 'Un café ?', body: 'Votre café préféré vous attend.', recipientsCount: 5, daysAgo: 3 },
    ],
  },

  // ── 3. Salon de coiffure (Pro, stamps) ────────────────────────────────────
  {
    name: 'Élégance Coiffure', slug: 'demo-coiffure', businessType: 'salon_coiffure',
    planKey: 'pro', color: '#8B5CF6', programType: 'stamps', stampsTotal: 8,
    pointsPerScan: 10, rewardThreshold: 80, rewardMessage: 'Coupe gratuite !',
    avgTicket: '38.00',
    customers: [
      { first: 'Célia', last: 'Maillard', daysAgo: 120, visits: 12, lastVisit: 5, birthdaySoon: false, vip: true },
      { first: 'Romane', last: 'Blanchard', daysAgo: 100, visits: 10, lastVisit: 8, birthdaySoon: false, vip: true },
      { first: 'Agathe', last: 'Carpentier', daysAgo: 90, visits: 8, lastVisit: 12, birthdaySoon: true, vip: true },
      { first: 'Lilou', last: 'Chevalier', daysAgo: 80, visits: 7, lastVisit: 15, birthdaySoon: false, vip: false },
      { first: 'Zoé', last: 'Robin', daysAgo: 85, visits: 7, lastVisit: 10, birthdaySoon: false, vip: false },
      { first: 'Lina', last: 'Mercier', daysAgo: 70, visits: 6, lastVisit: 20, birthdaySoon: false, vip: false },
      { first: 'Margaux', last: 'Picard', daysAgo: 60, visits: 5, lastVisit: 18, birthdaySoon: false, vip: false },
      { first: 'Ambre', last: 'Henry', daysAgo: 45, visits: 3, lastVisit: 14, birthdaySoon: false, vip: false },
      { first: 'Louise', last: 'Renard', daysAgo: 30, visits: 2, lastVisit: 8, birthdaySoon: false, vip: false },
      { first: 'Jade', last: 'Guerin', daysAgo: 15, visits: 1, lastVisit: 15, birthdaySoon: false, vip: false },
      { first: 'Alice', last: 'Bertrand', daysAgo: 10, visits: 1, lastVisit: 10, birthdaySoon: false, vip: false },
      { first: 'Anaïs', last: 'Noel', daysAgo: 95, visits: 5, lastVisit: 55, birthdaySoon: false, vip: false },
      { first: 'Mélanie', last: 'Legrand', daysAgo: 88, visits: 4, lastVisit: 60, birthdaySoon: false, vip: false },
    ],
    campaigns: [
      { name: 'Lancement carte fidélité', segment: 'all', subject: 'Votre carte fidélité !', body: 'Programme lancé.', recipientsCount: 13, daysAgo: 90 },
      { name: 'Promo coloration', segment: 'all', subject: 'Coloration -30%', body: 'Offre limitée.', recipientsCount: 10, daysAgo: 30 },
      { name: 'Relance clientes', segment: 'inactive_45', subject: 'On vous attend !', body: 'Prenez RDV.', recipientsCount: 4, daysAgo: 10 },
      { name: 'Anniversaire', segment: 'birthday', subject: 'Cadeau !', body: 'Brushing offert.', recipientsCount: 2, daysAgo: 3 },
    ],
  },

  // ── 4. Salon de beauté (Starter, stamps) ──────────────────────────────────
  {
    name: 'Belle & Zen', slug: 'demo-beaute', businessType: 'salon_beaute',
    planKey: 'starter', color: '#EC4899', programType: 'stamps', stampsTotal: 6,
    pointsPerScan: 10, rewardThreshold: 60, rewardMessage: 'Soin visage offert !',
    avgTicket: '55.00',
    customers: [
      { first: 'Clara', last: 'Fontaine', daysAgo: 110, visits: 10, lastVisit: 7, birthdaySoon: false, vip: true },
      { first: 'Rose', last: 'Lemoine', daysAgo: 95, visits: 8, lastVisit: 12, birthdaySoon: true, vip: true },
      { first: 'Elsa', last: 'Rivière', daysAgo: 80, visits: 6, lastVisit: 15, birthdaySoon: false, vip: false },
      { first: 'Lucie', last: 'Guillot', daysAgo: 65, visits: 5, lastVisit: 10, birthdaySoon: false, vip: false },
      { first: 'Camille', last: 'Caron', daysAgo: 50, visits: 4, lastVisit: 18, birthdaySoon: false, vip: false },
      { first: 'Sarah', last: 'Dufour', daysAgo: 40, visits: 3, lastVisit: 12, birthdaySoon: false, vip: false },
      { first: 'Manon', last: 'Barbier', daysAgo: 25, visits: 2, lastVisit: 8, birthdaySoon: false, vip: false },
      { first: 'Julie', last: 'Gaillard', daysAgo: 12, visits: 1, lastVisit: 12, birthdaySoon: false, vip: false },
      { first: 'Charlotte', last: 'Schmitt', daysAgo: 100, visits: 4, lastVisit: 50, birthdaySoon: false, vip: false },
      { first: 'Marie', last: 'Brun', daysAgo: 85, visits: 3, lastVisit: 45, birthdaySoon: false, vip: false },
    ],
    campaigns: [
      { name: 'Carte fidélité', segment: 'all', subject: 'Votre carte !', body: 'Découvrez votre carte fidélité.', recipientsCount: 10, daysAgo: 80 },
      { name: 'Promo été', segment: 'all', subject: 'Été radieux !', body: 'Épilation -25%.', recipientsCount: 8, daysAgo: 20 },
      { name: 'Relance', segment: 'inactive_45', subject: 'Prenez soin de vous', body: 'Offre spéciale retour.', recipientsCount: 3, daysAgo: 5 },
    ],
  },

  // ── 5. Boutique (Free, points) ────────────────────────────────────────────
  {
    name: 'La Boutique Mode', slug: 'demo-boutique', businessType: 'boutique',
    planKey: 'free', color: '#F59E0B', programType: 'points', stampsTotal: 10,
    pointsPerScan: 1, rewardThreshold: 50, rewardMessage: '-10% sur votre prochain achat !',
    avgTicket: '45.00',
    customers: [
      { first: 'Léa', last: 'Moreau', daysAgo: 60, visits: 8, lastVisit: 3, birthdaySoon: false, vip: true },
      { first: 'Chloé', last: 'Laurent', daysAgo: 55, visits: 6, lastVisit: 5, birthdaySoon: false, vip: false },
      { first: 'Emma', last: 'Bernard', daysAgo: 45, visits: 5, lastVisit: 7, birthdaySoon: true, vip: false },
      { first: 'Inès', last: 'Fournier', daysAgo: 40, visits: 4, lastVisit: 10, birthdaySoon: false, vip: false },
      { first: 'Jade', last: 'Dubois', daysAgo: 30, visits: 3, lastVisit: 8, birthdaySoon: false, vip: false },
      { first: 'Ambre', last: 'Henry', daysAgo: 20, visits: 2, lastVisit: 5, birthdaySoon: false, vip: false },
      { first: 'Nina', last: 'Denis', daysAgo: 10, visits: 1, lastVisit: 10, birthdaySoon: false, vip: false },
      { first: 'Lola', last: 'Colin', daysAgo: 70, visits: 4, lastVisit: 40, birthdaySoon: false, vip: false },
    ],
    campaigns: [
      { name: 'Ouverture fidélité', segment: 'all', subject: 'Cumulez des points !', body: 'Notre carte fidélité est arrivée.', recipientsCount: 8, daysAgo: 50 },
      { name: 'Soldes', segment: 'all', subject: 'Soldes -50%', body: 'Soldes sur toute la collection.', recipientsCount: 8, daysAgo: 10 },
    ],
  },
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

const DAY = 86400000;

function buildCustomerRow(p: CustomerProfile, rid: string, now: Date) {
  const createdAt = new Date(now.getTime() - p.daysAgo * DAY);
  const lastVisitAt = new Date(now.getTime() - p.lastVisit * DAY);
  const totalPoints = p.visits * 10;
  const stampsCount = p.visits % 10;

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
    completed_cards: Math.floor(p.visits / 10),
    last_visit_at: lastVisitAt.toISOString(),
    created_at: createdAt.toISOString(),
    consent_marketing: true,
  };
}

function buildTransactions(
  customers: Array<{ id: string; first_name: string; created_at: string }>,
  profiles: CustomerProfile[],
  rid: string,
  now: Date,
) {
  const txs: Array<Record<string, unknown>> = [];
  for (const cust of customers) {
    const profile = profiles.find(p => p.first === cust.first_name);
    if (!profile) continue;
    const custCreated = new Date(cust.created_at);
    const lastVisitAt = new Date(now.getTime() - profile.lastVisit * DAY);

    for (let v = 0; v < profile.visits; v++) {
      const progress = profile.visits > 1 ? v / (profile.visits - 1) : 0;
      const txTime = new Date(
        custCreated.getTime() + progress * (lastVisitAt.getTime() - custCreated.getTime()),
      );
      txTime.setTime(txTime.getTime() + (Math.random() - 0.5) * 6 * 3600000);
      txs.push({
        customer_id: cust.id,
        restaurant_id: rid,
        points_delta: 10,
        type: 'visit',
        created_at: txTime.toISOString(),
      });
    }
  }
  return txs;
}

/* ── POST: Seed 5 demo restaurants ─────────────────────────────────────────── */

export async function POST(req: Request) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  const ownerId = guard.userId;
  const now = new Date();

  // Load plan IDs
  const { data: plans } = await supabaseAdmin.from('plans').select('id, key');
  const planMap = new Map((plans ?? []).map(p => [p.key, p.id]));

  const results: string[] = [];

  for (const cfg of DEMO_CONFIGS) {
    const planId = planMap.get(cfg.planKey);
    if (!planId) {
      results.push(`${cfg.name}: plan '${cfg.planKey}' not found, skipped`);
      continue;
    }

    // Check if already exists (idempotent)
    const { data: existing } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('slug', cfg.slug)
      .maybeSingle();

    let rid: string;

    if (existing) {
      rid = existing.id;
      // Wipe existing data for re-seed
      await supabaseAdmin.from('transactions').delete().eq('restaurant_id', rid);
      await supabaseAdmin.from('campaigns').delete().eq('restaurant_id', rid);
      await supabaseAdmin.from('customers').delete().eq('restaurant_id', rid);
      await supabaseAdmin.from('loyalty_settings').delete().eq('restaurant_id', rid);
      // Update restaurant fields
      await supabaseAdmin.from('restaurants').update({
        name: cfg.name,
        business_type: cfg.businessType,
        plan: cfg.planKey,
        plan_id: planId,
        primary_color: cfg.color,
        is_demo: true,
        owner_id: ownerId,
        subscription_status: 'active',
      }).eq('id', rid);
    } else {
      // Create restaurant
      const { data: newResto, error: createErr } = await supabaseAdmin
        .from('restaurants')
        .insert({
          name: cfg.name,
          slug: cfg.slug,
          business_type: cfg.businessType,
          plan: cfg.planKey,
          plan_id: planId,
          primary_color: cfg.color,
          owner_id: ownerId,
          is_demo: true,
          subscription_status: 'active',
        })
        .select('id')
        .single();

      if (createErr || !newResto) {
        results.push(`${cfg.name}: create failed — ${createErr?.message}`);
        continue;
      }
      rid = newResto.id;
    }

    // Loyalty settings
    await supabaseAdmin.from('loyalty_settings').insert({
      restaurant_id: rid,
      program_type: cfg.programType,
      points_per_scan: cfg.pointsPerScan,
      reward_threshold: cfg.rewardThreshold,
      reward_message: cfg.rewardMessage,
      stamps_total: cfg.stampsTotal,
    });

    // Customers
    const customerRows = cfg.customers.map(p => buildCustomerRow(p, rid, now));
    const { data: insertedCustomers, error: cErr } = await supabaseAdmin
      .from('customers')
      .insert(customerRows)
      .select('id, first_name, created_at');

    if (cErr) {
      results.push(`${cfg.name}: customer insert failed — ${cErr.message}`);
      continue;
    }

    // Transactions
    const txs = buildTransactions(insertedCustomers ?? [], cfg.customers, rid, now);
    for (let i = 0; i < txs.length; i += 500) {
      await supabaseAdmin.from('transactions').insert(txs.slice(i, i + 500));
    }

    // Campaigns
    for (const camp of cfg.campaigns) {
      await supabaseAdmin.from('campaigns').insert({
        restaurant_id: rid,
        name: camp.name,
        type: 'email',
        segment_type: (() => {
          // Map to allowed CHECK values: all, inactive_30, birthday, vip, custom
          const m: Record<string, string> = { all: 'all', birthday: 'birthday', vip: 'vip', inactive_45: 'inactive_30', near_reward: 'custom', active: 'all' };
          return m[camp.segment] ?? 'custom';
        })(),
        segment: camp.segment,
        subject: camp.subject,
        body: camp.body,
        recipients_count: camp.recipientsCount,
        status: 'sent',
        sent_at: new Date(now.getTime() - camp.daysAgo * DAY).toISOString(),
      });
    }

    // Restaurant settings
    await supabaseAdmin.from('restaurant_settings').upsert({
      restaurant_id: rid,
      key: 'average_ticket',
      value: cfg.avgTicket,
      updated_at: now.toISOString(),
    }, { onConflict: 'restaurant_id,key' });

    results.push(`${cfg.name}: ${cfg.customers.length} customers, ${txs.length} txs, ${cfg.campaigns.length} campaigns`);
  }

  return NextResponse.json({ success: true, results });
}

/* ── DELETE: Cleanup all demo restaurants ───────────────────────────────────── */

export async function DELETE(req: Request) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  // Find demo restaurants owned by this user only
  const { data: demoRestos } = await supabaseAdmin
    .from('restaurants')
    .select('id')
    .eq('is_demo', true)
    .eq('owner_id', guard.userId);

  if (!demoRestos?.length) {
    return NextResponse.json({ deleted: 0 });
  }

  const ids = demoRestos.map(r => r.id);

  // Cascade delete data
  for (const rid of ids) {
    await supabaseAdmin.from('transactions').delete().eq('restaurant_id', rid);
    await supabaseAdmin.from('campaigns').delete().eq('restaurant_id', rid);
    await supabaseAdmin.from('customers').delete().eq('restaurant_id', rid);
    await supabaseAdmin.from('loyalty_settings').delete().eq('restaurant_id', rid);
    await supabaseAdmin.from('restaurant_settings').delete().eq('restaurant_id', rid);
  }

  // Delete restaurants
  await supabaseAdmin.from('restaurants').delete().in('id', ids);

  return NextResponse.json({ deleted: ids.length });
}
