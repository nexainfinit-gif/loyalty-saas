import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getAuthUrl, disconnectCalendar } from '@/lib/google-calendar-sync';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/gcal — returns Google Calendar connection status + auth URL
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { data: resto } = await supabaseAdmin
    .from('restaurants')
    .select('google_calendar_enabled')
    .eq('id', auth.restaurantId)
    .single();

  const connected = resto?.google_calendar_enabled ?? false;
  const authUrl = getAuthUrl(auth.restaurantId);
  const configured = !!authUrl;

  return NextResponse.json({ connected, configured, authUrl });
}

/**
 * DELETE /api/gcal — disconnect Google Calendar
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  await disconnectCalendar(auth.restaurantId);

  return NextResponse.json({ success: true });
}
