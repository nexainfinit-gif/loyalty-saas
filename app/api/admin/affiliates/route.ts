import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { data: affiliates } = await supabaseAdmin
    .from('affiliates')
    .select('*')
    .order('created_at', { ascending: false });

  const ids = (affiliates ?? []).map(a => a.id);

  let stats: Record<string, { referrals: number; total_pending: number; total_paid: number }> = {};
  if (ids.length > 0) {
    const { data: referrals } = await supabaseAdmin
      .from('restaurants')
      .select('affiliate_id')
      .in('affiliate_id', ids);

    const { data: commissions } = await supabaseAdmin
      .from('affiliate_commissions')
      .select('affiliate_id, commission_amount, status')
      .in('affiliate_id', ids);

    for (const id of ids) {
      const refCount = (referrals ?? []).filter(r => r.affiliate_id === id).length;
      const comms = (commissions ?? []).filter(c => c.affiliate_id === id);
      const totalPending = comms.filter(c => c.status === 'pending').reduce((s, c) => s + c.commission_amount, 0);
      const totalPaid = comms.filter(c => c.status === 'paid').reduce((s, c) => s + c.commission_amount, 0);
      stats[id] = { referrals: refCount, total_pending: totalPending, total_paid: totalPaid };
    }
  }

  const enriched = (affiliates ?? []).map(a => ({
    ...a,
    referrals: stats[a.id]?.referrals ?? 0,
    total_pending: stats[a.id]?.total_pending ?? 0,
    total_paid: stats[a.id]?.total_paid ?? 0,
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  if (!body?.name?.trim() || !body?.email?.trim()) {
    return NextResponse.json({ error: 'Nom et email requis.' }, { status: 400 });
  }

  const code = body.code?.trim().toUpperCase() || generateCode();
  const commissionRate = Math.min(100, Math.max(0, parseFloat(body.commission_rate ?? '20') || 20));

  const { data: existing } = await supabaseAdmin
    .from('affiliates')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'Ce code est déjà utilisé.' }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('affiliates')
    .insert({
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      code,
      commission_rate: commissionRate,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id requis.' }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.email !== undefined) update.email = body.email.trim().toLowerCase();
  if (body.phone !== undefined) update.phone = body.phone?.trim() || null;
  if (body.commission_rate !== undefined) update.commission_rate = Math.min(100, Math.max(0, parseFloat(body.commission_rate) || 20));
  if (body.status !== undefined && ['active', 'inactive'].includes(body.status)) update.status = body.status;
  if (body.notes !== undefined) update.notes = body.notes?.trim() || null;

  const { error } = await supabaseAdmin
    .from('affiliates')
    .update(update)
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
