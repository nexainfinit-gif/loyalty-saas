import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

/*
 * GET /api/wallet/classes
 *
 * Returns computed Google Wallet classIds for this restaurant's published templates,
 * along with whether each class exists in the Google API.
 */

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID!;
const BASE      = 'https://walletobjects.googleapis.com/walletobjects/v1';

async function classExists(classId: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/loyaltyClass/${encodeURIComponent(classId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });

  // Fetch distinct pass_kinds from published templates
  const { data: templates, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id, pass_kind')
    .eq('restaurant_id', guard.restaurantId)
    .eq('status', 'published');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate pass_kinds
  const passKinds = [...new Set((templates ?? []).map(t => t.pass_kind))] as string[];

  // Compute classIds
  const classIds = passKinds.map(pk => ({
    classId:  `${ISSUER_ID}.r${guard.restaurantId!.replace(/-/g, '')}_${pk}`,
    passKind: pk,
  }));

  // Check existence in Google (need OAuth token)
  let googleToken = '';
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_WALLET_CLIENT_EMAIL!,
        private_key:  process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
    googleToken = (await auth.getAccessToken()) ?? '';
  } catch {
    // Return without existence check if auth fails
    return NextResponse.json({
      classes: classIds.map(c => ({ ...c, exists: null })),
    });
  }

  const withExistence = await Promise.all(
    classIds.map(async (c) => ({
      ...c,
      exists: await classExists(c.classId, googleToken),
    })),
  );

  return NextResponse.json({ classes: withExistence });
}
