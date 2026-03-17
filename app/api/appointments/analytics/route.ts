import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

/**
 * GET /api/appointments/analytics?period=30d
 *
 * Returns appointment analytics: KPIs, status breakdown, staff performance,
 * service popularity, daily trends, and busiest day/hour analysis.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') ?? '30d';
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  // Fetch all appointments in the period
  const { data: appointments, error } = await supabaseAdmin
    .from('appointments')
    .select('id, date, start_time, end_time, status, staff_id, service_id, created_at')
    .eq('restaurant_id', auth.restaurantId)
    .gte('date', since)
    .order('date');

  if (error) {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }

  const all = appointments ?? [];

  // Fetch services and staff for name resolution
  const [servicesRes, staffRes] = await Promise.all([
    supabaseAdmin
      .from('services')
      .select('id, name, price, duration_minutes')
      .eq('restaurant_id', auth.restaurantId),
    supabaseAdmin
      .from('staff_members')
      .select('id, name')
      .eq('restaurant_id', auth.restaurantId),
  ]);

  const servicesMap = new Map(
    (servicesRes.data ?? []).map((s) => [s.id, s])
  );
  const staffMap = new Map(
    (staffRes.data ?? []).map((s) => [s.id, s])
  );

  // ── KPIs ──────────────────────────────────────────────────
  const total = all.length;
  const completed = all.filter((a) => a.status === 'completed').length;
  const cancelled = all.filter((a) => a.status === 'cancelled').length;
  const noShow = all.filter((a) => a.status === 'no_show').length;
  const confirmed = all.filter((a) => a.status === 'confirmed').length;

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const noShowRate = total > 0 ? Math.round((noShow / total) * 100) : 0;
  const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  // Estimated revenue from completed appointments
  const estimatedRevenue = all
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => {
      const svc = servicesMap.get(a.service_id);
      return sum + (svc?.price ?? 0);
    }, 0);

  // Average per day
  const avgPerDay = days > 0 ? +(total / days).toFixed(1) : 0;

  // ── Status breakdown (for pie chart) ──────────────────────
  const statusBreakdown = [
    { status: 'completed', count: completed },
    { status: 'confirmed', count: confirmed },
    { status: 'cancelled', count: cancelled },
    { status: 'no_show', count: noShow },
  ].filter((s) => s.count > 0);

  // ── Staff performance ─────────────────────────────────────
  const staffStats = new Map<string, { total: number; completed: number; noShow: number; revenue: number }>();
  for (const a of all) {
    if (!a.staff_id) continue;
    const s = staffStats.get(a.staff_id) ?? { total: 0, completed: 0, noShow: 0, revenue: 0 };
    s.total++;
    if (a.status === 'completed') {
      s.completed++;
      s.revenue += servicesMap.get(a.service_id)?.price ?? 0;
    }
    if (a.status === 'no_show') s.noShow++;
    staffStats.set(a.staff_id, s);
  }

  const byStaff = Array.from(staffStats.entries())
    .map(([id, stats]) => ({
      id,
      name: staffMap.get(id)?.name ?? 'Inconnu',
      total: stats.total,
      completed: stats.completed,
      noShow: stats.noShow,
      completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      noShowRate: stats.total > 0 ? Math.round((stats.noShow / stats.total) * 100) : 0,
      revenue: stats.revenue,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Service popularity ────────────────────────────────────
  const serviceStats = new Map<string, { total: number; completed: number; revenue: number }>();
  for (const a of all) {
    if (!a.service_id) continue;
    const s = serviceStats.get(a.service_id) ?? { total: 0, completed: 0, revenue: 0 };
    s.total++;
    if (a.status === 'completed') {
      s.completed++;
      s.revenue += servicesMap.get(a.service_id)?.price ?? 0;
    }
    serviceStats.set(a.service_id, s);
  }

  const byService = Array.from(serviceStats.entries())
    .map(([id, stats]) => ({
      id,
      name: servicesMap.get(id)?.name ?? 'Inconnu',
      duration: servicesMap.get(id)?.duration_minutes ?? 0,
      price: servicesMap.get(id)?.price ?? 0,
      total: stats.total,
      completed: stats.completed,
      revenue: stats.revenue,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Daily trend ───────────────────────────────────────────
  const dailyMap = new Map<string, { total: number; completed: number; noShow: number; cancelled: number }>();
  for (const a of all) {
    const d = dailyMap.get(a.date) ?? { total: 0, completed: 0, noShow: 0, cancelled: 0 };
    d.total++;
    if (a.status === 'completed') d.completed++;
    if (a.status === 'no_show') d.noShow++;
    if (a.status === 'cancelled') d.cancelled++;
    dailyMap.set(a.date, d);
  }

  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Busiest day of week ───────────────────────────────────
  const dayOfWeekNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const byDayOfWeek = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    label: dayOfWeekNames[i],
    count: 0,
  }));
  for (const a of all) {
    const dow = new Date(a.date + 'T00:00:00').getDay();
    byDayOfWeek[dow].count++;
  }

  // ── Busiest hours ─────────────────────────────────────────
  const byHour = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}:00`,
    count: 0,
  }));
  for (const a of all) {
    if (!a.start_time) continue;
    const h = parseInt(a.start_time.split(':')[0], 10);
    if (h >= 0 && h < 24) byHour[h].count++;
  }

  // Filter to only hours with data
  const peakHours = byHour.filter((h) => h.count > 0);

  return NextResponse.json({
    period,
    days,
    kpis: {
      total,
      completed,
      cancelled,
      noShow,
      confirmed,
      completionRate,
      noShowRate,
      cancellationRate,
      estimatedRevenue,
      avgPerDay,
    },
    statusBreakdown,
    byStaff,
    byService,
    dailyTrend,
    byDayOfWeek,
    peakHours,
  });
}
