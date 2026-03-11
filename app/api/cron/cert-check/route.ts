import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { Resend } from 'resend';
import { getCertExpiryDate } from '@/lib/apple-wallet';
import { logger } from '@/lib/logger';

const CTX = 'cron/cert-check';

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Weekly cron — checks Apple Wallet certificate expiry and sends an alert
 * email to ADMIN_EMAIL if the cert expires within 60 days.
 *
 * Vercel cron schedule: every Monday at 8 AM UTC
 *   "0 8 * * 1"
 */
export async function GET(req: NextRequest) {
  // Security: validate CRON_SECRET with timing-safe comparison
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!timingSafeCompare(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check certificate expiry
  const expiryDate = getCertExpiryDate();

  if (!expiryDate) {
    logger.info({ ctx: CTX, msg: 'Apple Wallet certificate not configured — skipping' });
    return NextResponse.json({
      status: 'skipped',
      reason: 'cert_not_configured',
    });
  }

  const now = Date.now();
  const daysUntilExpiry = Math.floor((expiryDate.getTime() - now) / 86400000);
  const expiryIso = expiryDate.toISOString();
  const expired = daysUntilExpiry <= 0;

  logger.info({
    ctx: CTX,
    msg: `Certificate expires ${expiryIso} (${daysUntilExpiry} days)`,
    daysUntilExpiry,
  });

  // Only alert if < 60 days remaining
  if (daysUntilExpiry >= 60) {
    return NextResponse.json({
      status: 'ok',
      daysUntilExpiry,
      expiryDate: expiryIso,
    });
  }

  // Send alert email if ADMIN_EMAIL is configured
  const adminEmail = process.env.ADMIN_EMAIL;
  let emailSent = false;

  if (adminEmail) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const urgencyLabel = expired
        ? 'EXPIRÉ'
        : daysUntilExpiry <= 7
          ? 'CRITIQUE'
          : daysUntilExpiry <= 30
            ? 'URGENT'
            : 'ATTENTION';

      const statusColor = expired || daysUntilExpiry <= 7
        ? '#dc2626'
        : daysUntilExpiry <= 30
          ? '#f59e0b'
          : '#3b82f6';

      await resend.emails.send({
        from: 'Rebites Alertes <noreply@rebites.be>',
        to: adminEmail,
        subject: `[${urgencyLabel}] Certificat Apple Wallet — ${expired ? 'expiré' : `expire dans ${daysUntilExpiry} jours`}`,
        html: `
          <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

            <div style="background: ${statusColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
              <h1 style="color: white; margin: 0; font-size: 1.5rem;">${urgencyLabel}</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">Certificat Apple Wallet</p>
            </div>

            <p style="color: #374151; font-size: 1rem;">
              Le certificat Apple Wallet ${expired ? '<strong>a expiré</strong>' : `expire dans <strong>${daysUntilExpiry} jours</strong>`}.
            </p>

            <div style="background: #f9fafb; border-radius: 12px; padding: 1.25rem; margin: 1.5rem 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Date d'expiration</td>
                  <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${expiryDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Jours restants</td>
                  <td style="color: ${statusColor}; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${expired ? 'Expiré' : `${daysUntilExpiry} jours`}</td>
                </tr>
              </table>
            </div>

            <p style="color: #374151; font-size: 0.9rem;">
              <strong>Action requise :</strong> renouvelez le certificat Pass Type ID dans votre compte
              Apple Developer, puis mettez à jour la variable d'environnement
              <code style="background: #f3f4f6; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem;">APPLE_PASS_CERT_P12_BASE64</code>.
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

            <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
              Rebites — Alerte automatique certificat
            </p>
          </div>
        `,
      });

      emailSent = true;
      logger.info({ ctx: CTX, msg: `Alert email sent to ${adminEmail}`, daysUntilExpiry });
    } catch (err) {
      logger.error({ ctx: CTX, msg: 'Failed to send alert email', err });
    }
  } else {
    logger.warn({ ctx: CTX, msg: 'ADMIN_EMAIL not set — alert email skipped', daysUntilExpiry });
  }

  return NextResponse.json({
    status: expired ? 'expired' : 'expiring_soon',
    daysUntilExpiry,
    expiryDate: expiryIso,
    emailSent,
  });
}
