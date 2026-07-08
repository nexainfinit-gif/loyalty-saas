import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyRwgAuth, mapBookingStatus } from '@/lib/reserve-with-google';
import { refreshAppointmentOnPass } from '@/lib/booking-wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  bookingId: z.string().uuid(),
  action: z.enum(['cancel']), // seul l'annulation est supportée côté RwG
});

/**
 * POST /api/rwg/v3/update-booking — annulation d'une réservation depuis Google.
 * (Le report se fait en annulant + recréant côté Google.)
 */
export async function POST(request: Request) {
  if (!verifyRwgAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { data: appt } = await supabaseAdmin
    .from('appointments')
    .select('id, restaurant_id, status, client_email')
    .eq('id', parsed.data.bookingId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (appt.status === 'cancelled') {
    return NextResponse.json({ bookingId: appt.id, status: 'CANCELED' });
  }

  // Garde concurrente : n'annule que si toujours confirmé.
  const { data: updated } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appt.id)
    .in('status', ['confirmed', 'pending_payment'])
    .select('id')
    .maybeSingle();
  if (!updated) return NextResponse.json({ error: 'Not cancellable' }, { status: 409 });

  // Met à jour la carte Wallet du client (prochain RDV).
  await refreshAppointmentOnPass(appt.restaurant_id, appt.client_email);

  return NextResponse.json({ bookingId: appt.id, status: mapBookingStatus('cancelled') });
}
