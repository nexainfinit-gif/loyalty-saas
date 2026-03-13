export const runtime = 'nodejs';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { pushPassUpdate } from '@/lib/apns';

// GET /api/debug-apns?pass_id=6b4b9958-8c61-412c-9746-87e0fbcbf421
export async function GET(req: Request) {
  const passId = new URL(req.url).searchParams.get('pass_id');
  if (!passId) return Response.json({ error: 'pass_id required' });

  const steps: Record<string, unknown> = {};

  // Step 1: Check pass exists
  const { data: pass, error: passErr } = await supabaseAdmin
    .from('wallet_passes')
    .select('id, customer_id, platform, status, pass_version, authentication_token')
    .eq('id', passId)
    .maybeSingle();

  steps.pass = pass ?? passErr?.message;

  // Step 2: Check registrations
  const { data: regs, error: regErr } = await supabaseAdmin
    .from('wallet_push_registrations')
    .select('id, device_id, push_token, pass_id, serial_number')
    .eq('pass_id', passId);

  steps.registrations = regs ?? regErr?.message;
  steps.registrationCount = regs?.length ?? 0;

  // Step 3: Try push
  try {
    const pushResults = await pushPassUpdate(passId);
    steps.pushResults = pushResults;
  } catch (err) {
    steps.pushError = err instanceof Error ? err.message : String(err);
  }

  return Response.json(steps, { headers: { 'Content-Type': 'application/json' } });
}
