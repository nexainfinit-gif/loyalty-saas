import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

const BUCKET       = 'wallet-assets';
const MAX_BYTES    = 5 * 1024 * 1024; // 5 MB
const SIGNED_TTL   = 3600;            // 1 hour

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
};

/* ── Route ────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  // ── Auth: platform owner only ─────────────────────────────────────────────
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  // ── Parse form data ──────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  const type         = (form.get('type')         as string | null) ?? '';
  const restaurantId = (form.get('restaurantId') as string | null) ?? '';
  const file         = form.get('file') as File | null;

  if (!['empty', 'filled', 'strip', 'logo'].includes(type)) {
    return NextResponse.json({ error: 'type doit être "empty", "filled", "strip" ou "logo".' }, { status: 400 });
  }
  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId manquant.' }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
  }

  // ── Validate file ────────────────────────────────────────────────────────
  const ext = ALLOWED_MIME(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: `Format non supporté (${file.type}). Utilisez PNG, JPEG, WebP ou SVG.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Fichier trop grand (max 5 Mo).' }, { status: 413 });
  }

  // ── Validate the supplied restaurantId belongs to this owner ─────────────
  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', guard.userId)
    .single();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant introuvable ou accès refusé.' }, { status: 403 });
  }

  // ── Upload using service role (bypasses RLS, bucket stays private) ────────
  const bytes = Buffer.from(await file.arrayBuffer());
  const path  = `${restaurantId}/stamps/${type}.${ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // ── Create signed URL (1 hour) — bucket stays private ────────────────────
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);

  if (signErr || !signed) {
    return NextResponse.json({ error: 'Impossible de générer le lien signé.' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function ALLOWED_MIME(mime: string): string | null {
  return ALLOWED_TYPES[mime] ?? null;
}
