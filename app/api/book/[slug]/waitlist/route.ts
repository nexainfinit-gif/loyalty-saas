import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Rate limit: 5 waitlist joins per IP per minute
const limiter = rateLimit({ prefix: 'waitlist-join', limit: 5, windowMs: 60_000 });

const schema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clientName: z.string().trim().min(1).max(100),
  clientEmail: z.string().trim().email().max(255),
  clientPhone: z.string().trim().max(30).optional().default(''),
});

/**
 * POST /api/book/[slug]/waitlist
 * Public endpoint: client joins the waiting list for a specific date/service.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans une minute.' },
      { status: 429 },
    );
  }

  const { slug } = await params;

  // Resolve restaurant
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides.' },
      { status: 400 },
    );
  }

  const { serviceId, staffId, date, clientName, clientEmail, clientPhone } = parsed.data;

  // Prevent duplicates: same email + date + service + restaurant
  const { data: existing } = await supabaseAdmin
    .from('waiting_list')
    .select('id')
    .eq('restaurant_id', restaurant.id)
    .eq('client_email', clientEmail)
    .eq('desired_date', date)
    .eq('service_id', serviceId)
    .eq('status', 'waiting')
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'Vous êtes déjà sur la liste d\'attente pour ce créneau.' },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin
    .from('waiting_list')
    .insert({
      restaurant_id: restaurant.id,
      service_id: serviceId,
      staff_id: staffId,
      desired_date: date,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
    });

  if (error) {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
