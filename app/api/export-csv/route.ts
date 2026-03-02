import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

export async function GET(request: Request) {
  // Auth: platform owner only — isolates export to their own restaurant
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { data: customers, error } = await supabaseAdmin
    .from('customers')
    .select(
      'first_name, last_name, email, total_points, birth_date, postal_code, last_visit_at, created_at',
    )
    .eq('restaurant_id', guard.restaurantId)
    .order('created_at', { ascending: false });

  if (error || !customers) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  const headers = [
    'Prénom',
    'Nom',
    'Email',
    'Points',
    'Date de naissance',
    'Code postal',
    'Dernière visite',
    'Inscrit le',
  ];

  const rows = customers.map((c) => [
    c.first_name   ?? '',
    c.last_name    ?? '',
    c.email        ?? '',
    c.total_points ?? 0,
    c.birth_date   ?? '',
    c.postal_code  ?? '',
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
