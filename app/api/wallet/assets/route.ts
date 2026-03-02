import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'wallet-assets';
const ALLOWED_TYPES = ['empty', 'filled'] as const;

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Restaurant lookup ────────────────────────────────────────────────────
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', session.user.id)
    .single();

  if (!restaurant) return NextResponse.json({ error: 'Restaurant introuvable' }, { status: 404 });

  // ── Parse form data ──────────────────────────────────────────────────────
  const form = await request.formData();
  const type = form.get('type') as string | null;
  const file = form.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
  if (!ALLOWED_TYPES.includes(type as typeof ALLOWED_TYPES[number])) {
    return NextResponse.json({ error: 'Type invalide (empty | filled)' }, { status: 400 });
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  const bytes = Buffer.from(await file.arrayBuffer());
  const path  = `${restaurant.id}/stamp-${type}.png`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/png', upsert: true });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

  // Append cache-busting timestamp so the browser reloads the new image
  return NextResponse.json({ url: `${publicUrl}?t=${Date.now()}` });
}
