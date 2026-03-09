import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/server-auth';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_MIME: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  // Auth: any authenticated restaurant owner
  const guard = await requireAuth(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
  }

  // Validate MIME type against server-side allowlist (never trust file.name extension)
  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'Format non supporté. Utilisez PNG, JPEG ou WebP.' },
      { status: 415 },
    );
  }

  // Validate file size
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Fichier trop grand (max 2 Mo).' },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Storage path is derived entirely from the authenticated restaurantId — never from client input
  const storagePath = `${guard.restaurantId}/logo.${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('logos')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabaseAdmin.storage.from('logos').getPublicUrl(storagePath);

  return NextResponse.json({ url: data.publicUrl });
}
