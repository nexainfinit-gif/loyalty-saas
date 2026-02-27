import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('*')
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
    c.first_name,
    c.last_name,
    c.email,
    c.points,
    c.birth_date ?? '',
    c.postal_code ?? '',
    c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('fr-BE') : '',
    new Date(c.created_at).toLocaleDateString('fr-BE'),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.join(';'))
    .join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="clients.csv"',
    },
  });
}