import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/client/appointments?token=UUID
 * Returns the client's appointments (past and upcoming).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Token manquant.' }, { status: 400 });
  }

  // Validate session
  const { data: session } = await supabaseAdmin
    .from('client_sessions')
    .select('customer_id, restaurant_id, expires_at')
    .eq('token', token)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Session invalide ou expirée.' }, { status: 401 });
  }

  // Fetch customer email to match appointments
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('email')
    .eq('id', session.customer_id)
    .single();

  if (!customer?.email) {
    return NextResponse.json({ appointments: [] });
  }

  // Fetch appointments by client_email
  const { data: appointments } = await supabaseAdmin
    .from('appointments')
    .select('id, date, start_time, end_time, status, cancel_token, service:services(name, price, duration_minutes), staff:staff_members(name)')
    .eq('restaurant_id', session.restaurant_id)
    .eq('client_email', customer.email)
    .order('date', { ascending: false })
    .limit(50);

  return NextResponse.json({ appointments: appointments ?? [] });
}
