import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyRwgAuth, mapBookingStatus } from '@/lib/reserve-with-google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ bookingId: z.string().uuid() });

/**
 * POST /api/rwg/v3/booking-status — statut d'une réservation (Google poll).
 */
export async function POST(request: Request) {
  if (!verifyRwgAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { data: appt } = await supabaseAdmin
    .from('appointments')
    .select('id, status, date, start_time, end_time')
    .eq('id', parsed.data.bookingId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    bookingId: appt.id,
    status: mapBookingStatus(appt.status),
    date: appt.date,
    startTime: appt.start_time,
    endTime: appt.end_time,
  });
}
