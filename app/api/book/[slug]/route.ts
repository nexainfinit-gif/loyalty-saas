import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const limiter = rateLimit({ prefix: 'book-page', limit: 30, windowMs: 60_000 });

/**
 * GET /api/book/[slug]
 *
 * Public endpoint — returns all data needed to render the booking page:
 *   - business info (name, primary_color, logo_url)
 *   - active services
 *   - active staff with their service_ids
 *   - staff availability schedules
 *   - appointment settings (opening hours, slot duration, etc.)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  if (!limiter.check(ip).success) {
    return NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 });
  }

  const { slug } = await params;

  // 1. Resolve restaurant by slug
  const { data: restaurant, error: restErr } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, slug, primary_color, logo_url')
    .eq('slug', slug)
    .single();

  if (restErr || !restaurant) {
    return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
  }

  // 2. Parallel fetch: services, staff, availability, settings
  const [servicesRes, staffRes, availabilityRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from('services')
      .select('id, name, duration_minutes, price, category, active')
      .eq('restaurant_id', restaurant.id)
      .eq('active', true)
      .order('category')
      .order('name'),

    supabaseAdmin
      .from('staff_members')
      .select('id, name, avatar_url, service_ids, active')
      .eq('restaurant_id', restaurant.id)
      .eq('active', true)
      .order('name'),

    supabaseAdmin
      .from('staff_availability')
      .select('staff_id, day_of_week, start_time, end_time, is_working')
      .eq('restaurant_id', restaurant.id),

    supabaseAdmin
      .from('appointment_settings')
      .select('slot_duration_minutes, buffer_minutes, max_advance_days, min_advance_hours, working_days, opening_time, closing_time')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle(),
  ]);

  // Default settings when none configured
  const settings = settingsRes.data ?? {
    slot_duration_minutes: 15,
    buffer_minutes: 0,
    max_advance_days: 30,
    min_advance_hours: 2,
    working_days: [1, 2, 3, 4, 5, 6],
    opening_time: '09:00',
    closing_time: '19:00',
  };

  return NextResponse.json({
    business: {
      name: restaurant.name,
      slug: restaurant.slug,
      primaryColor: restaurant.primary_color,
      logoUrl: restaurant.logo_url,
    },
    services: servicesRes.data ?? [],
    staff: staffRes.data ?? [],
    availability: availabilityRes.data ?? [],
    settings,
  });
}
