import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

const serviceSchema = z.object({
  name:             z.string().trim().min(1).max(100),
  duration_minutes: z.number().int().min(5).max(480),
  price:            z.number().min(0).max(99999),
  category:         z.string().trim().min(1).max(50),
  active:           z.boolean().optional().default(true),
});

/** GET /api/appointments/services — list all services for the authenticated restaurant */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('services')
    .select('*')
    .eq('restaurant_id', auth.restaurantId)
    .order('category')
    .order('name');

  if (error) return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  return NextResponse.json({ services: data });
}

/** POST /api/appointments/services — create a new service */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();
  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .insert({ restaurant_id: auth.restaurantId, ...parsed.data })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Erreur lors de la création.' }, { status: 500 });
  return NextResponse.json({ service: data }, { status: 201 });
}

/** PUT /api/appointments/services — update an existing service */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const body = await request.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'ID manquant.' }, { status: 400 });

  const parsed = serviceSchema.partial().safeParse(rest);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .update(parsed.data)
    .eq('id', id)
    .eq('restaurant_id', auth.restaurantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 });
  return NextResponse.json({ service: data });
}

/** DELETE /api/appointments/services — delete a service */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!auth.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID manquant.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('services')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', auth.restaurantId);

  if (error) return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
