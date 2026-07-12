import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;

  const { data: affiliate } = await supabaseAdmin
    .from('affiliates')
    .select('*')
    .eq('id', id)
    .single();

  if (!affiliate) return NextResponse.json({ error: 'Affilié introuvable.' }, { status: 404 });

  const { data: referrals } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, plan, subscription_status, created_at')
    .eq('affiliate_id', id)
    .order('created_at', { ascending: false });

  const { data: commissions } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('*')
    .eq('affiliate_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({ affiliate, referrals: referrals ?? [], commissions: commissions ?? [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (body?.action === 'mark_paid') {
    const commissionIds: string[] = body.commissionIds;
    if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
      return NextResponse.json({ error: 'commissionIds requis.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('affiliate_commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .in('id', commissionIds)
      .eq('affiliate_id', id)
      .eq('status', 'pending');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, paid: commissionIds.length });
  }

  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
