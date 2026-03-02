import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import { ensureLoyaltyClass } from '@/lib/google-wallet';

/*
 * POST /api/wallet/classes/sync
 *
 * Ensures all Google Wallet loyalty classes for this restaurant's
 * published templates exist in the Google API.
 */

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID!;

export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  // Fetch restaurant for name/color/logo
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('name, primary_color, logo_url')
    .eq('id', guard.restaurantId)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  // Fetch published templates, get distinct pass_kinds
  const { data: templates, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('pass_kind')
    .eq('restaurant_id', guard.restaurantId)
    .eq('status', 'published');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const passKinds = [...new Set((templates ?? []).map(t => t.pass_kind))] as ('stamps' | 'points' | 'event')[];

  if (passKinds.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, classIds: [] });
  }

  // Ensure each class exists
  const results = await Promise.allSettled(
    passKinds.map(async (passKind) => {
      const classId = `${ISSUER_ID}.r${guard.restaurantId!.replace(/-/g, '')}_${passKind}`;
      const result  = await ensureLoyaltyClass({
        classId,
        restaurantName: restaurant.name,
        primaryColor:   restaurant.primary_color ?? '#4f6bed',
        passKind,
        logoUrl:        restaurant.logo_url,
      });
      return { classId, ok: result.ok };
    }),
  );

  let synced = 0;
  let failed = 0;
  const classIds: string[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) {
      synced++;
      classIds.push(r.value.classId);
    } else {
      failed++;
    }
  }

  return NextResponse.json({ synced, failed, classIds });
}
