import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Convert #rrggbb → "rgb(r, g, b)" required by Apple Wallet pass.json */
function hexToAppleRgb(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 'rgb(79, 107, 237)';
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

/** Build a Unicode stamp-progress string: "● ● ● ● ○ ○ ○ ○ ○ ○" */
function stampGrid(filled: number, total: number): string {
  return Array.from({ length: total }, (_, i) => (i < filled ? '●' : '○')).join(' ');
}

/* ── Route ────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // ── DEV-ONLY bypass: ?demo=1 skips auth and returns mock data ────────────
  // Requires explicit opt-in via WALLET_PREVIEW_DEMO=true (never set on hosted envs).
  const DEMO_ENABLED = process.env.WALLET_PREVIEW_DEMO === 'true';
  if (DEMO_ENABLED && searchParams.get('demo') === '1') {
    const demoColor  = '#4f6bed';
    const demoStamps = 4;
    const demoTotal  = 10;
    return NextResponse.json({
      passJson: {
        formatVersion:      1,
        passTypeIdentifier: 'pass.YOUR_BUNDLE_ID',
        serialNumber:       'DEMO_UUID',
        teamIdentifier:     'YOUR_TEAM_ID',
        organizationName:   'Mon Restaurant',
        description:        'Carte de fidélité – Mon Restaurant',
        backgroundColor:    hexToAppleRgb(demoColor),
        foregroundColor:    'rgb(255, 255, 255)',
        labelColor:         'rgb(200, 215, 255)',
        logoText:           'Mon Restaurant',
        storeCard: {
          headerFields:    [{ key: 'stamp_count', label: 'TAMPONS',     value: `${demoStamps} / ${demoTotal}` }],
          primaryFields:   [{ key: 'member_name', label: 'CLIENT',      value: 'Marie Dupont' }],
          secondaryFields: [{ key: 'stamp_grid',  label: 'PROGRESSION', value: stampGrid(demoStamps, demoTotal) }],
          auxiliaryFields: [{ key: 'reward',      label: 'RÉCOMPENSE',  value: 'Café offert' }],
          backFields: [
            { key: 'program_info', label: 'Programme de fidélité', value: 'Accumulez des tampons à chaque visite chez Mon Restaurant. Présentez ce QR code en caisse.' },
            { key: 'privacy',      label: 'Données personnelles',  value: 'Carte nominative et non transférable. Conforme au RGPD.' },
          ],
        },
        barcode: { message: 'DEMO_QR_TOKEN', format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', altText: 'Scannez ce code en caisse' },
      },
      meta: {
        restaurantId:    null,          // no real restaurant in demo mode
        restaurantName:  'Mon Restaurant',
        primaryColor:    demoColor,
        logoUrl:         null,
        plan:            'pro',
        programType:     'stamps',
        stampsTotal:     demoTotal,
        exampleStamps:   demoStamps,
        examplePoints:   240,
        rewardThreshold: 500,
        rewardMessage:   'Café offert',
        imagesRequired: [
          { file: 'icon.png',      size: '29 × 29 px',   notes: 'Shown in notification banners and passbook list' },
          { file: 'icon@2x.png',   size: '58 × 58 px',   notes: 'Retina icon' },
          { file: 'icon@3x.png',   size: '87 × 87 px',   notes: 'Super-Retina icon' },
          { file: 'logo.png',      size: '160 × 50 px',  notes: 'Top-left logo on card face' },
          { file: 'logo@2x.png',   size: '320 × 100 px', notes: 'Retina logo' },
          { file: 'thumbnail.png', size: '90 × 90 px',   notes: '(optional) right-side thumbnail on storeCard' },
        ],
      },
    });
  }

  // ── Auth: platform owner only ─────────────────────────────────────────────
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;

  if (!guard.restaurantId) return NextResponse.json({ error: 'Restaurant introuvable' }, { status: 404 });

  const { data: restaurant } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, primary_color, logo_url, plan')
    .eq('id', guard.restaurantId)
    .single();

  if (!restaurant) return NextResponse.json({ error: 'Restaurant introuvable' }, { status: 404 });

  const { data: loyalty } = await supabaseAdmin
    .from('loyalty_settings')
    .select('program_type, stamps_total, reward_threshold, reward_message')
    .eq('restaurant_id', restaurant.id)
    .single();

  /* ── Preview values ─────────────────────────────────────────────────────── */
  const primaryColor    = restaurant.primary_color ?? '#4f6bed';
  const programType     = loyalty?.program_type ?? 'points';
  const stampsTotal     = loyalty?.stamps_total ?? 10;
  const exampleStamps   = Math.max(1, Math.round(stampsTotal * 0.4));
  const examplePoints   = 240;
  const rewardThreshold = loyalty?.reward_threshold ?? 500;
  const rewardMessage   = loyalty?.reward_message ?? 'Café offert';
  const isStamps        = programType === 'stamps';

  /* ── pass.json template ─────────────────────────────────────────────────── */
  /*
   * SIGNING NOTE (for when you have Apple certificates):
   *   1. Replace all PLACEHOLDER values below.
   *   2. Add required PNG images to the .pkpass zip bundle.
   *   3. Generate manifest.json (SHA-1 hash per file).
   *   4. Sign manifest.json:
   *        openssl smime -sign -signer passcertificate.pem -inkey passkey.pem \
   *          -certfile WWDR.pem -in manifest.json -out signature \
   *          -outform DER -binary
   *   5. Zip: pass.json + manifest.json + signature + images → bundle.pkpass
   *   6. Serve with Content-Type: application/vnd.apple.pkpass
   */
  const passJson = {
    // ── Identification — replace before signing ──────────────────────────────
    formatVersion:      1,
    passTypeIdentifier: 'pass.YOUR_BUNDLE_ID',    // ← Apple Developer Portal → Identifiers
    serialNumber:       'CUSTOMER_UUID',           // ← customer.id at generation time
    teamIdentifier:     'YOUR_TEAM_ID',            // ← Apple Developer account Team ID

    // ── Metadata ─────────────────────────────────────────────────────────────
    organizationName: restaurant.name,
    description:      `Carte de fidélité – ${restaurant.name}`,

    // ── Colours (Apple Wallet requires rgb() string format) ───────────────────
    backgroundColor: hexToAppleRgb(primaryColor),
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor:      'rgb(200, 215, 255)',
    logoText:        restaurant.name,

    // ── Pass fields ───────────────────────────────────────────────────────────
    storeCard: {
      headerFields: [
        {
          key:   isStamps ? 'stamp_count'    : 'points_balance',
          label: isStamps ? 'TAMPONS'        : 'POINTS',
          value: isStamps ? `${exampleStamps} / ${stampsTotal}` : `${examplePoints} pts`,
        },
      ],
      primaryFields: [
        {
          key:   'member_name',
          label: 'CLIENT',
          value: 'Marie Dupont',  // ← customer.first_name + ' ' + customer.last_name
        },
      ],
      secondaryFields: isStamps
        ? [
            {
              key:   'stamp_grid',
              label: 'PROGRESSION',
              value: stampGrid(exampleStamps, stampsTotal),
            },
          ]
        : [
            {
              key:   'points_progress',
              label: 'OBJECTIF',
              value: `${examplePoints} / ${rewardThreshold} pts`,
            },
            {
              key:   'reward_label',
              label: 'RÉCOMPENSE',
              value: rewardMessage,
            },
          ],
      auxiliaryFields: isStamps
        ? [
            {
              key:   'reward',
              label: 'RÉCOMPENSE',
              value: rewardMessage,
            },
          ]
        : [],
      backFields: [
        {
          key:   'program_info',
          label: 'Programme de fidélité',
          value: `Accumulez des ${isStamps ? 'tampons' : 'points'} à chaque visite chez ${restaurant.name}. Présentez ce QR code en caisse.`,
        },
        {
          key:   'privacy',
          label: 'Données personnelles',
          value: 'Carte nominative et non transférable. Conforme au RGPD.',
        },
      ],
    },

    // ── QR barcode ────────────────────────────────────────────────────────────
    barcode: {
      message:         'CUSTOMER_QR_TOKEN',   // ← customer.qr_token at generation time
      format:          'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText:         'Scannez ce code en caisse',
    },
  };

  /* ── Response ───────────────────────────────────────────────────────────── */
  return NextResponse.json({
    passJson,
    meta: {
      restaurantId:     restaurant.id,
      restaurantName:   restaurant.name,
      primaryColor,
      logoUrl:          restaurant.logo_url,
      plan:             restaurant.plan,
      programType,
      stampsTotal,
      exampleStamps,
      examplePoints,
      rewardThreshold,
      rewardMessage,
      // Images that must be included in the .pkpass zip bundle (as PNG files)
      imagesRequired: [
        { file: 'icon.png',      size: '29 × 29 px',   notes: 'Shown in notification banners and passbook list' },
        { file: 'icon@2x.png',   size: '58 × 58 px',   notes: 'Retina icon' },
        { file: 'icon@3x.png',   size: '87 × 87 px',   notes: 'Super-Retina icon' },
        { file: 'logo.png',      size: '160 × 50 px',  notes: 'Top-left logo on card face' },
        { file: 'logo@2x.png',   size: '320 × 100 px', notes: 'Retina logo' },
        { file: 'thumbnail.png', size: '90 × 90 px',   notes: '(optional) right-side thumbnail on storeCard' },
      ],
    },
  });
}
