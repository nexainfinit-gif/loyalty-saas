import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireFeature } from '@/lib/server-auth';

export async function GET(request: Request) {
  const guard = await requireAuth(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }
  const featureGate = requireFeature(guard, 'export_csv', 'Export CSV');
  if (featureGate) return featureGate;

  const { data: customers, error } = await supabaseAdmin
    .from('customers')
    .select(
      'first_name, last_name, email, total_points, stamps_count, birth_date, last_visit_at, created_at, total_visits',
    )
    .eq('restaurant_id', guard.restaurantId)
    .order('created_at', { ascending: false });

  if (error || !customers) {
    return NextResponse.json({ error: error?.message ?? 'Erreur serveur' }, { status: 500 });
  }

  const headers = [
    'Prénom',
    'Nom',
    'Email',
    'Points',
    'Tampons',
    'Visites',
    'Date de naissance',
    'Dernière visite',
    'Inscrit le',
  ];

  const rows = customers.map((c) => [
    c.first_name    ?? '',
    c.last_name     ?? '',
    c.email         ?? '',
    c.total_points  ?? 0,
    c.stamps_count  ?? 0,
    c.total_visits  ?? 0,
    c.birth_date    ?? '',
    c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('fr-BE') : '',
    new Date(c.created_at).toLocaleDateString('fr-BE'),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(String).join(';'))
    .join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="clients.csv"',
    },
  });
}
