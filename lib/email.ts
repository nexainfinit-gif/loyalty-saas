import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Escape HTML special characters to prevent injection in email templates. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Validate a CSS hex color; fall back to brand default if malformed. */
function safeCssColor(color: string): string {
  return /^#[0-9A-Fa-f]{3,6}$/.test(color) ? color : '#FF6B35';
}

interface WelcomeEmailProps {
  to: string;
  firstName: string;
  restaurantName: string;
  restaurantColor: string;
  qrToken: string;
}

export async function sendWelcomeEmail({
  to,
  firstName,
  restaurantName,
  restaurantColor,
  qrToken,
}: WelcomeEmailProps) {
  const scanUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/${qrToken}`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(scanUrl)}&size=250`;
  const safeColor = safeCssColor(restaurantColor);
  const safeName  = esc(restaurantName);
  const safeFname = esc(firstName);

  await resend.emails.send({
    from: 'Carte Fidélité <noreply@rebites.be>',
    to,
    subject: `Bienvenue chez ${restaurantName} ! 🎉`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

        <div style="background: ${safeColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
          <h1 style="color: white; margin: 0; font-size: 1.5rem;">🎉 Bienvenue !</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">${safeName}</p>
        </div>

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${safeFname}</strong> !
        </p>

        <p style="color: #374151;">
          Votre carte fidélité <strong>${safeName}</strong> est prête.
          Présentez ce QR code à chaque visite pour gagner des points.
        </p>

        <div style="text-align: center; margin: 2rem 0;">
          <img
            src="${qrUrl}"
            alt="QR Code fidélité"
            style="border-radius: 12px; border: 4px solid ${safeColor};"
          />
        </div>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1rem; margin-bottom: 2rem;">
          <p style="margin: 0; color: #6b7280; font-size: 0.85rem; text-align: center;">
            💡 Conseil : faites une capture d'écran de ce QR code pour l'avoir toujours avec vous !
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          Conformément au RGPD, vous pouvez demander la suppression de vos données
          à tout moment en répondant à cet email ou en cliquant sur
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?token=${qrToken}" style="color: #9ca3af; text-decoration: underline;">Se désinscrire</a>.<br/>
          ${safeName} — Programme de fidélité
        </p>
      </div>
    `,
  });
}

interface BirthdayEmailProps {
  to: string;
  firstName: string;
  restaurantName: string;
  restaurantColor: string;
  /** qr_token used to build a one-click unsubscribe URL. Optional for backward compat. */
  qrToken?: string;
}

export async function sendBirthdayEmail({
  to,
  firstName,
  restaurantName,
  restaurantColor,
  qrToken,
}: BirthdayEmailProps) {
  const safeColor  = safeCssColor(restaurantColor);
  const safeName   = esc(restaurantName);
  const safeFname  = esc(firstName);
  const unsubUrl   = qrToken
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?token=${qrToken}`
    : null;

  await resend.emails.send({
    from: 'Carte Fidélité <noreply@rebites.be>',
    to,
    subject: `Joyeux anniversaire ${firstName} ! 🎂`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem;">

        <div style="background: ${safeColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
          <h1 style="color: white; margin: 0; font-size: 2rem;">🎂</h1>
          <h2 style="color: white; margin: 0.5rem 0 0 0;">Joyeux anniversaire !</h2>
        </div>

        <p style="color: #374151;">
          Bonjour <strong>${safeFname}</strong> !
        </p>

        <p style="color: #374151;">
          Toute l'équipe de <strong>${safeName}</strong> vous souhaite
          un très joyeux anniversaire ! 🎉
        </p>

        <p style="color: #374151;">
          Pour fêter ça, venez nous rendre visite aujourd'hui et profitez
          d'une surprise spéciale anniversaire !
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeName} — Programme de fidélité<br/>
          ${unsubUrl ? `<a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">Se désinscrire</a>` : ''}
        </p>
      </div>
    `,
  });
}