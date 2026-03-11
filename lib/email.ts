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
  appleWalletUrl?: string | null;
}

export async function sendWelcomeEmail({
  to,
  firstName,
  restaurantName,
  restaurantColor,
  qrToken,
  appleWalletUrl,
}: WelcomeEmailProps) {
  const scanUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/${qrToken}`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(scanUrl)}&size=250`;
  const safeColor = safeCssColor(restaurantColor);
  const safeName  = esc(restaurantName);
  const safeFname = esc(firstName);

  await resend.emails.send({
    from: `${restaurantName} <noreply@rebites.be>`,
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

        ${appleWalletUrl ? `
        <div style="text-align: center; margin-bottom: 2rem;">
          <a href="${appleWalletUrl}" target="_blank" style="display: inline-block; background: #000000; color: #ffffff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
             Ajouter à Apple Wallet
          </a>
        </div>
        ` : ''}

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

/* ── Booking confirmation email ─────────────────────────────────────────── */

interface BookingConfirmationProps {
  to: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  date: string;        // "2026-03-15"
  startTime: string;   // "14:00"
  endTime: string;     // "14:45"
  price: number;
  durationMinutes: number;
  businessName: string;
  businessColor: string;
  businessSlug: string;
  confirmationMessage?: string | null;
}

export async function sendBookingConfirmationEmail({
  to,
  clientName,
  serviceName,
  staffName,
  date,
  startTime,
  endTime,
  price,
  durationMinutes,
  businessName,
  businessColor,
  businessSlug,
  confirmationMessage,
}: BookingConfirmationProps) {
  const safeColor     = safeCssColor(businessColor);
  const safeBizName   = esc(businessName);
  const safeClient    = esc(clientName);
  const safeService   = esc(serviceName);
  const safeStaff     = esc(staffName);
  const safeMessage   = confirmationMessage ? esc(confirmationMessage) : null;

  // Format date for display (e.g., "Samedi 15 mars 2026")
  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const displayDate = `${dayNames[dateObj.getDay()]} ${d} ${monthNames[m - 1]} ${y}`;

  // Google Calendar link (no API needed — uses URL scheme)
  const gcalStart = `${date.replace(/-/g, '')}T${startTime.replace(':', '')}00`;
  const gcalEnd   = `${date.replace(/-/g, '')}T${endTime.replace(':', '')}00`;
  const gcalUrl   = `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${encodeURIComponent(`${serviceName} — ${businessName}`)}`
    + `&dates=${gcalStart}/${gcalEnd}`
    + `&details=${encodeURIComponent(`Service : ${serviceName}\nAvec : ${staffName}\nDurée : ${durationMinutes} min\nPrix : ${price}€`)}`
    + `&location=${encodeURIComponent(businessName)}`;

  const bookingPageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/book/${businessSlug}`;

  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject: `Rendez-vous confirmé — ${businessName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

        <div style="background: ${safeColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
          <h1 style="color: white; margin: 0; font-size: 1.5rem;">Rendez-vous confirmé</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">${safeBizName}</p>
        </div>

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${safeClient}</strong>,
        </p>

        <p style="color: #374151;">
          Votre rendez-vous est confirmé. Voici le récapitulatif :
        </p>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1.25rem; margin: 1.5rem 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Service</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safeService}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Professionnel</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safeStaff}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Date</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${displayDate}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Heure</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${startTime} — ${endTime}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Durée</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${durationMinutes} min</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Prix</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${price}&euro;</td>
            </tr>
          </table>
        </div>

        ${safeMessage ? `<p style="color: #374151; font-style: italic; background: #f0fdf4; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.9rem;">${safeMessage}</p>` : ''}

        <div style="text-align: center; margin: 1.5rem 0;">
          <a href="${gcalUrl}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
            Ajouter à Google Calendar
          </a>
        </div>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1rem; margin: 1.5rem 0;">
          <p style="margin: 0; color: #6b7280; font-size: 0.8rem;">
            <strong>Besoin de modifier ou annuler ?</strong><br/>
            Contactez directement ${safeBizName} par téléphone ou en répondant à cet email.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeBizName} — Réservation en ligne par <a href="https://rebites.be" style="color: #9ca3af; text-decoration: underline;">Rebites</a>
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
    from: `${restaurantName} <noreply@rebites.be>`,
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

/* ── Appointment reminder email ────────────────────────────────────────── */

interface ReminderEmailProps {
  to: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  date: string;        // "2026-03-15"
  startTime: string;   // "14:00"
  endTime: string;     // "14:45"
  durationMinutes: number;
  businessName: string;
  businessColor: string;
  businessSlug: string;
  hoursUntil: number;  // 24 or 2
}

export async function sendReminderEmail({
  to,
  clientName,
  serviceName,
  staffName,
  date,
  startTime,
  endTime,
  durationMinutes,
  businessName,
  businessColor,
  businessSlug,
  hoursUntil,
}: ReminderEmailProps) {
  const safeColor     = safeCssColor(businessColor);
  const safeBizName   = esc(businessName);
  const safeClient    = esc(clientName);
  const safeService   = esc(serviceName);
  const safeStaff     = esc(staffName);

  // Format date for display
  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const displayDate = `${dayNames[dateObj.getDay()]} ${d} ${monthNames[m - 1]} ${y}`;

  const timeLabel = hoursUntil <= 2 ? 'dans 2 heures' : 'demain';
  const subject = hoursUntil <= 2
    ? `Rappel — Votre rendez-vous dans 2h chez ${businessName}`
    : `Rappel — Votre rendez-vous demain chez ${businessName}`;

  // Google Calendar link
  const gcalStart = `${date.replace(/-/g, '')}T${startTime.replace(':', '')}00`;
  const gcalEnd   = `${date.replace(/-/g, '')}T${endTime.replace(':', '')}00`;
  const gcalUrl   = `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${encodeURIComponent(`${serviceName} — ${businessName}`)}`
    + `&dates=${gcalStart}/${gcalEnd}`
    + `&details=${encodeURIComponent(`Service : ${serviceName}\nAvec : ${staffName}\nDurée : ${durationMinutes} min`)}`
    + `&location=${encodeURIComponent(businessName)}`;

  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

        <div style="background: ${safeColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
          <h1 style="color: white; margin: 0; font-size: 1.5rem;">Rappel</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">Votre rendez-vous est ${timeLabel}</p>
        </div>

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${safeClient}</strong>,
        </p>

        <p style="color: #374151;">
          Nous vous rappelons votre rendez-vous ${timeLabel} :
        </p>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1.25rem; margin: 1.5rem 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Service</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safeService}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Professionnel</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safeStaff}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Date</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${displayDate}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Heure</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${startTime} — ${endTime}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 1.5rem 0;">
          <a href="${gcalUrl}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
            Voir dans Google Calendar
          </a>
        </div>

        <div style="background: #fffbeb; border-radius: 12px; padding: 1rem; margin: 1.5rem 0;">
          <p style="margin: 0; color: #92400e; font-size: 0.8rem;">
            <strong>Empêchement ?</strong><br/>
            Merci de prévenir ${safeBizName} le plus tôt possible par téléphone ou en répondant à cet email.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeBizName} — Réservation en ligne par <a href="https://rebites.be" style="color: #9ca3af; text-decoration: underline;">Rebites</a>
        </p>
      </div>
    `,
  });
}