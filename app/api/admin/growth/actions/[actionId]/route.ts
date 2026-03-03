import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/growth/actions/[actionId]
 * Transitions a growth action to executed or dismissed.
 * Auth: platform owner only.
 *
 * Body: { status: 'executed' | 'dismissed' | 'in_progress' }
 *
 * Response: { action: GrowthActionRow }
 */

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:     ['in_progress', 'executed', 'dismissed'],
  in_progress: ['executed', 'dismissed'],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  const { actionId } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const newStatus = body.status;
  if (!newStatus) {
    return NextResponse.json({ error: '`status` field is required.' }, { status: 400 });
  }

  // Fetch current action
  const { data: action, error: fetchErr } = await supabaseAdmin
    .from('growth_actions')
    .select('id, status')
    .eq('id', actionId)
    .maybeSingle();

  if (fetchErr || !action) {
    return NextResponse.json({ error: 'Action not found.' }, { status: 404 });
  }

  const allowed = ALLOWED_TRANSITIONS[action.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from '${action.status}' to '${newStatus}'.` },
      { status: 422 },
    );
  }

  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'executed') {
    updatePayload.executed_at = new Date().toISOString();
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('growth_actions')
    .update(updatePayload)
    .eq('id', actionId)
    .select()
    .single();

  if (updateErr) {
    console.error('[admin/growth/actions/patch] update error:', updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ action: updated });
}
