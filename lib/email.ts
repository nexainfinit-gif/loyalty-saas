import { mailer as resend } from '@/lib/mailer';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Logo de l'établissement pour l'en-tête d'email — résolu par slug quand la
 * fonction l'a, sinon par nom (unique en pratique sur la plateforme).
 * Best-effort : null en cas d'échec, l'email part sans logo.
 */
async function logoFor(opts: { slug?: string | null; name?: string | null }): Promise<string | null> {
  try {
    if (opts.slug) {
      const { data } = await supabaseAdmin.from('restaurants').select('logo_url').eq('slug', opts.slug).maybeSingle();
      if (data) return data.logo_url ?? null;
    }
    if (opts.name) {
      const { data } = await supabaseAdmin.from('restaurants').select('logo_url').eq('name', opts.name).limit(1).maybeSingle();
      return data?.logo_url ?? null;
    }
  } catch { /* best-effort */ }
  return null;
}

/** Escape HTML special characters to prevent injection in email templates. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * En-tête d'email brandé établissement : logo sur tuile blanche (si fourni)
 * au-dessus du titre, sur fond couleur du template. Utilisé par tous les
 * emails clients « carte de fidélité ».
 */
/** Tuile logo compatible clients mail (Gmail supprime object-fit) :
 *  cellule de tableau centrée + max-width/height — centrage fiable partout. */
function logoTile(url: string, maxH: number, _radius: number): string {
  // Sans cadre : logo nu centré. Contrainte orientée LARGEUR (220px) pour que
  // les logos-texte (wordmarks) s'affichent grands ; hauteur plafonnée.
  return `<img src="${url}" alt="" style="max-width:220px;max-height:${maxH}px;display:block;margin:0 auto 1rem;" />`;
}

function emailHeader(opts: { color: string; title: string; subtitle?: string; logoUrl?: string | null }): string {
  const logo = opts.logoUrl ? logoTile(opts.logoUrl, 96, 16) : '';
  return `
        <div style="background: ${opts.color}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
          ${logo}
          <h1 style="color: white; margin: 0; font-size: 1.5rem;">${opts.title}</h1>
          ${opts.subtitle ? `<p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">${opts.subtitle}</p>` : ''}
        </div>`;
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
  googleWalletUrl?: string | null;
  /** If the customer was referred, the bonus points/stamps they received. */
  referralBonusReceived?: number | null;
  /** Referral code for this customer to share with friends. */
  referralCode?: string | null;
  /** Reward amount the referrer earns per successful referral. */
  referralRewardAmount?: number | null;
  /** Program type for referral reward labeling. */
  programType?: 'points' | 'stamps';
  /** Logo de l'établissement (affiché en tête d'email). */
  restaurantLogoUrl?: string | null;
}

export async function sendWelcomeEmail({
  to,
  firstName,
  restaurantName,
  restaurantColor,
  qrToken,
  appleWalletUrl,
  googleWalletUrl,
  referralBonusReceived,
  referralCode,
  referralRewardAmount,
  programType,
  restaurantLogoUrl,
}: WelcomeEmailProps) {
  const scanUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/${qrToken}`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(scanUrl)}&size=250`;
  const safeColor = safeCssColor(restaurantColor);
  const safeName  = esc(restaurantName);
  const safeFname = esc(firstName);
  const rewardLabel = programType === 'stamps' ? 'tampon(s)' : 'point(s)';
  const referralLink = referralCode
    ? `${process.env.NEXT_PUBLIC_APP_URL}/register/${referralCode}`
    : null;

  await resend.emails.send({
    from: `${restaurantName} <noreply@rebites.be>`,
    to,
    subject: `Bienvenue chez ${restaurantName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

${emailHeader({ color: safeColor, title: 'Bienvenue !', subtitle: safeName, logoUrl: restaurantLogoUrl })}

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${safeFname}</strong> !
        </p>

        <p style="color: #374151;">
          Votre carte fidélité <strong>${safeName}</strong> est prête. Ajoutez-la à votre téléphone en un tap :
        </p>

        ${appleWalletUrl ? `
        <div style="text-align: center; margin-bottom: 0.75rem;">
          <a href="${appleWalletUrl}" target="_blank" style="display: inline-block; background: #000000; color: #ffffff; text-decoration: none; padding: 0.85rem 1.75rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
             Ajouter à Apple Wallet
          </a>
        </div>
        ` : ''}

        ${googleWalletUrl ? `
        <div style="text-align: center; margin-bottom: 0.75rem;">
          <a href="${googleWalletUrl}" target="_blank" style="display: inline-block; background: #1a73e8; color: #ffffff; text-decoration: none; padding: 0.85rem 1.75rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
             Ajouter à Google Wallet
          </a>
        </div>
        ` : ''}

        <p style="color: #6b7280; font-size: 0.9rem; text-align: center; margin: 1.75rem 0 0.5rem;">
          Ou présentez ce QR code à chaque visite :
        </p>

        <div style="text-align: center; margin: 0.5rem 0 1rem;">
          <img
            src="${qrUrl}"
            alt="QR Code fidélité"
            style="border-radius: 12px; border: 4px solid ${safeColor};"
          />
        </div>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1rem; margin-bottom: 2rem;">
          <p style="margin: 0; color: #6b7280; font-size: 0.85rem; text-align: center;">
            Conseil : faites une capture d'écran de ce QR code pour l'avoir toujours avec vous !
          </p>
        </div>

        ${referralBonusReceived ? `
        <div style="background: #f0fdf4; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; border: 1px solid #bbf7d0;">
          <p style="margin: 0; color: #166534; font-size: 0.9rem; text-align: center;">
            <strong>Cadeau de bienvenue !</strong><br/>
            Un ami vous a parrainé — vous recevez <strong>${referralBonusReceived} ${rewardLabel}</strong> en bonus.
          </p>
        </div>
        ` : ''}

        ${referralCode && referralRewardAmount ? `
        <div style="background: #eff6ff; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; border: 1px solid #bfdbfe;">
          <p style="margin: 0 0 0.5rem 0; color: #1e40af; font-size: 0.95rem; font-weight: 600; text-align: center;">
            Parrainez vos amis !
          </p>
          <p style="margin: 0 0 1rem 0; color: #374151; font-size: 0.85rem; text-align: center;">
            Invitez vos proches et gagnez <strong>${referralRewardAmount} ${rewardLabel}</strong> pour chaque ami qui rejoint le programme.
          </p>
          <div style="text-align: center;">
            <a href="${referralLink}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.625rem 1.25rem; border-radius: 12px; font-size: 0.85rem; font-weight: 600;">
              Partager mon lien de parrainage
            </a>
          </div>
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

/* ── Referral success email (sent to the referrer) ─────────────────────── */

interface ReferralSuccessEmailProps {
  to: string;
  referrerName: string;
  refereeName: string;
  rewardPoints: number;
  programType: 'points' | 'stamps';
  restaurantName: string;
  restaurantColor: string;
  /** qr_token of the referrer for unsubscribe link. */
  qrToken?: string;
  /** Referral code for the referrer to keep sharing. */
  referralCode?: string;
}

export async function sendReferralSuccessEmail({
  to,
  referrerName,
  refereeName,
  rewardPoints,
  programType,
  restaurantName,
  restaurantColor,
  qrToken,
  referralCode,
}: ReferralSuccessEmailProps) {
  const safeColor       = safeCssColor(restaurantColor);
  const safeName        = esc(restaurantName);
  const safeReferrer    = esc(referrerName);
  const safeReferee     = esc(refereeName);
  const rewardLabel     = programType === 'stamps' ? 'tampon(s)' : 'point(s)';
  const referralLink    = referralCode
    ? `${process.env.NEXT_PUBLIC_APP_URL}/register/${referralCode}`
    : null;
  const unsubUrl        = qrToken
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?token=${qrToken}`
    : null;

  await resend.emails.send({
    from: `${restaurantName} <noreply@rebites.be>`,
    to,
    subject: `${restaurantName} — Votre ami a rejoint le programme !`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

        ${emailHeader({ color: safeColor, title: `Parrainage réussi !`, subtitle: `${safeName}`, logoUrl: await logoFor({ name: restaurantName }) })}

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${safeReferrer}</strong>,
        </p>

        <p style="color: #374151;">
          Bonne nouvelle ! Votre ami(e) <strong>${safeReferee}</strong> vient de rejoindre le
          programme de fidélité <strong>${safeName}</strong> grâce à votre parrainage.
        </p>

        <div style="background: #f0fdf4; border-radius: 12px; padding: 1.25rem; margin: 1.5rem 0; border: 1px solid #bbf7d0; text-align: center;">
          <p style="margin: 0 0 0.25rem 0; color: #166534; font-size: 0.85rem;">Vous avez gagné</p>
          <p style="margin: 0; color: #166534; font-size: 1.5rem; font-weight: 700;">${rewardPoints} ${rewardLabel}</p>
        </div>

        <p style="color: #374151; font-size: 0.9rem;">
          Continuez à partager votre lien de parrainage pour gagner encore plus de ${rewardLabel} !
        </p>

        ${referralLink ? `
        <div style="text-align: center; margin: 1.5rem 0;">
          <a href="${referralLink}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
            Partager mon lien de parrainage
          </a>
        </div>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeName} — Programme de fidélité<br/>
          ${unsubUrl ? `<a href="${unsubUrl}" style="color: #9ca3af; text-decoration: underline;">Se désinscrire</a>` : ''}
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
  cancelUrl?: string | null;
  rescheduleUrl?: string | null;
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
  cancelUrl,
  rescheduleUrl,
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

  // Lien .ics — sur iPhone (Mail), le lien Google ouvre l'éditeur desktop
  // illisible ; le .ics ouvre la feuille native « Ajouter à Calendrier ».
  const icsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/book/ics?` + new URLSearchParams({
    service: serviceName, business: businessName, staff: staffName,
    date, start: startTime, end: endTime, duration: String(durationMinutes),
  }).toString();

  const bookingPageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/book/${businessSlug}`;

  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject: `Rendez-vous confirmé — ${businessName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

        ${emailHeader({ color: safeColor, title: `Rendez-vous confirmé`, subtitle: `${safeBizName}`, logoUrl: await logoFor({ slug: businessSlug }) })}

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
          <p style="margin: 0.6rem 0 0; font-size: 0.78rem;">
            <a href="${icsUrl}" style="color: #6b7280; text-decoration: underline;">Sur iPhone ? Ajouter via Calendrier Apple (.ics)</a></p>
          <p style="margin: 0.4rem 0 0; font-size: 0.78rem;">
            ${cancelUrl ? `<a href="${cancelUrl.replace('/cancel/', '/status/')}" style="color: #6b7280; text-decoration: underline;">⏱ Suivre mon rendez-vous en temps réel</a>` : ''}
          </p>
        </div>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1rem; margin: 1.5rem 0;">
          <p style="margin: 0 0 0.5rem 0; color: #6b7280; font-size: 0.8rem;">
            <strong>Besoin de modifier ou annuler ?</strong>
          </p>
          ${rescheduleUrl ? `<p style="margin: 0 0 0.25rem 0; font-size: 0.8rem;"><a href="${rescheduleUrl}" style="color: ${safeColor}; text-decoration: underline;">Modifier mon rendez-vous</a></p>` : ''}
          ${cancelUrl ? `<p style="margin: 0 0 0.25rem 0; font-size: 0.8rem;"><a href="${cancelUrl}" style="color: ${safeColor}; text-decoration: underline;">Annuler mon rendez-vous</a></p>` : ''}
          ${!cancelUrl && !rescheduleUrl ? `<p style="margin: 0; color: #6b7280; font-size: 0.8rem;">Contactez directement ${safeBizName} par téléphone ou en répondant à cet email.</p>` : ''}
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeBizName} — Réservation en ligne par <a href="https://rebites.be" style="color: #9ca3af; text-decoration: underline;">Rebites</a>
        </p>
      </div>
    `,
  });
}

/* ── Email verification ────────────────────────────────────────────────── */

interface VerificationEmailProps {
  to: string;
  firstName: string;
  restaurantName: string;
  restaurantColor: string;
  verificationToken: string;
  restaurantLogoUrl?: string | null;
}

export async function sendVerificationEmail({
  to,
  firstName,
  restaurantName,
  restaurantColor,
  verificationToken,
  restaurantLogoUrl,
}: VerificationEmailProps) {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const safeColor = safeCssColor(restaurantColor);
  const safeName  = esc(restaurantName);
  const safeFname = esc(firstName);

  await resend.emails.send({
    from: `${restaurantName} <noreply@rebites.be>`,
    to,
    subject: `Confirmez votre adresse email — ${restaurantName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

${emailHeader({ color: safeColor, title: 'Confirmez votre email', subtitle: `${safeName}`, logoUrl: restaurantLogoUrl })}

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${safeFname}</strong>,
        </p>

        <p style="color: #374151;">
          Merci de votre inscription au programme de fidélité <strong>${safeName}</strong>.
          Pour confirmer votre adresse email, cliquez sur le bouton ci-dessous :
        </p>

        <div style="text-align: center; margin: 2rem 0;">
          <a href="${verifyUrl}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.875rem 2rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
            Confirmer mon adresse email
          </a>
        </div>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1rem; margin-bottom: 2rem;">
          <p style="margin: 0; color: #6b7280; font-size: 0.85rem; text-align: center;">
            Si vous n'avez pas créé de compte, vous pouvez ignorer cet email.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
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
    from: `${restaurantName} <noreply@rebites.be>`,
    to,
    subject: `Joyeux anniversaire ${firstName} ! 🎂`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem;">

        ${emailHeader({ color: safeColor, title: 'Joyeux anniversaire !', logoUrl: await logoFor({ name: restaurantName }) })}

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
  cancelUrl?: string | null;
  rescheduleUrl?: string | null;
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
  cancelUrl,
  rescheduleUrl,
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

  const icsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/book/ics?` + new URLSearchParams({
    service: serviceName, business: businessName, staff: staffName,
    date, start: startTime, end: endTime, duration: String(durationMinutes),
  }).toString();

  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

        ${emailHeader({ color: safeColor, title: `Rappel`, subtitle: `Votre rendez-vous est ${timeLabel}`, logoUrl: await logoFor({ slug: businessSlug }) })}

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
          <p style="margin: 0.6rem 0 0; font-size: 0.78rem;">
            <a href="${icsUrl}" style="color: #6b7280; text-decoration: underline;">Sur iPhone ? Ajouter via Calendrier Apple (.ics)</a></p>
          <p style="margin: 0.4rem 0 0; font-size: 0.78rem;">
            ${cancelUrl ? `<a href="${cancelUrl.replace('/cancel/', '/status/')}" style="color: #6b7280; text-decoration: underline;">⏱ Suivre mon rendez-vous en temps réel</a>` : ''}
          </p>
        </div>

        <div style="background: #fffbeb; border-radius: 12px; padding: 1rem; margin: 1.5rem 0;">
          <p style="margin: 0 0 0.5rem 0; color: #92400e; font-size: 0.8rem;">
            <strong>Empêchement ?</strong>
          </p>
          ${rescheduleUrl ? `<p style="margin: 0 0 0.25rem 0; font-size: 0.8rem;"><a href="${rescheduleUrl}" style="color: ${safeColor}; text-decoration: underline;">Modifier mon rendez-vous</a></p>` : ''}
          ${cancelUrl ? `<p style="margin: 0 0 0.25rem 0; font-size: 0.8rem;"><a href="${cancelUrl}" style="color: ${safeColor}; text-decoration: underline;">Annuler mon rendez-vous</a></p>` : ''}
          ${!cancelUrl && !rescheduleUrl ? `<p style="margin: 0; color: #92400e; font-size: 0.8rem;">Merci de prévenir ${safeBizName} le plus tôt possible par téléphone ou en répondant à cet email.</p>` : ''}
        </div>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeBizName} — Réservation en ligne par <a href="https://rebites.be" style="color: #9ca3af; text-decoration: underline;">Rebites</a>
        </p>
      </div>
    `,
  });
}

/* ── Staff notification email ──────────────────────────────────────────── */

interface StaffNotificationProps {
  to: string;
  staffName: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  serviceName: string;
  date: string;        // "2026-03-15"
  startTime: string;   // "14:00"
  endTime: string;     // "14:45"
  notes: string | null;
  businessName: string;
  businessColor: string;
  isReschedule?: boolean;
}

export async function sendStaffNotificationEmail({
  to,
  staffName,
  clientName,
  clientPhone,
  clientEmail,
  serviceName,
  date,
  startTime,
  endTime,
  notes,
  businessName,
  businessColor,
  isReschedule,
}: StaffNotificationProps): Promise<void> {
  const safeColor     = safeCssColor(businessColor);
  const safeBizName   = esc(businessName);
  const safeStaff     = esc(staffName);
  const safeClient    = esc(clientName);
  const safeService   = esc(serviceName);
  const safePhone     = esc(clientPhone);
  const safeEmailAddr = esc(clientEmail);
  const safeNotes     = notes ? esc(notes) : null;

  // Format date for display
  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const displayDate = `${dayNames[dateObj.getDay()]} ${d} ${monthNames[m - 1]} ${y}`;

  const title = isReschedule ? 'Rendez-vous modifié' : 'Nouveau rendez-vous';
  const subject = isReschedule
    ? `Rendez-vous modifié — ${clientName}`
    : `Nouveau rendez-vous — ${clientName}`;

  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">

        ${emailHeader({ color: safeColor, title: `${title}`, subtitle: `${safeBizName}`, logoUrl: await logoFor({ name: businessName }) })}

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${safeStaff}</strong>,
        </p>

        <p style="color: #374151;">
          ${isReschedule ? 'Un rendez-vous a été modifié' : 'Un nouveau rendez-vous a été pris'}. Voici les détails :
        </p>

        <div style="background: #f9fafb; border-radius: 12px; padding: 1.25rem; margin: 1.5rem 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Service</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safeService}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Client</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safeClient}</td>
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
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Téléphone</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safePhone}</td>
            </tr>
            <tr>
              <td style="color: #6b7280; font-size: 0.85rem; padding: 0.35rem 0;">Email</td>
              <td style="color: #111827; font-size: 0.85rem; padding: 0.35rem 0; text-align: right; font-weight: 600;">${safeEmailAddr}</td>
            </tr>
          </table>
        </div>

        ${safeNotes ? `
        <div style="background: #fffbeb; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
          <p style="margin: 0; color: #92400e; font-size: 0.85rem;">
            <strong>Notes :</strong> ${safeNotes}
          </p>
        </div>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />

        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeBizName} — Réservation en ligne par <a href="https://rebites.be" style="color: #9ca3af; text-decoration: underline;">Rebites</a>
        </p>
      </div>
    `,
  });
}

/* ── Waiting list notification email ───────────────────────────────────── */

interface WaitlistNotifyProps {
  to: string;
  clientName: string;
  serviceName: string;
  date: string;
  businessName: string;
  businessColor: string;
  businessSlug: string;
}

export async function sendWaitlistNotifyEmail({
  to,
  clientName,
  serviceName,
  date,
  businessName,
  businessColor,
  businessSlug,
}: WaitlistNotifyProps) {
  const safeColor   = safeCssColor(businessColor);
  const safeBizName = esc(businessName);
  const safeClient  = esc(clientName);
  const safeService = esc(serviceName);

  const [y, m, d] = date.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const displayDate = `${dayNames[dateObj.getDay()]} ${d} ${monthNames[m - 1]} ${y}`;

  const bookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/book/${businessSlug}`;

  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject: `Un créneau s'est libéré — ${businessName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        ${emailHeader({ color: safeColor, title: `Bonne nouvelle !`, subtitle: `${safeBizName}`, logoUrl: await logoFor({ slug: businessSlug }) })}
        <p style="color: #374151; font-size: 1rem;">Bonjour <strong>${safeClient}</strong>,</p>
        <p style="color: #374151;">
          Un créneau vient de se libérer pour le service <strong>${safeService}</strong>
          le <strong>${displayDate}</strong>.
        </p>
        <p style="color: #374151;">Réservez vite avant qu'il ne soit pris !</p>
        <div style="text-align: center; margin: 2rem 0;">
          <a href="${bookUrl}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.875rem 2rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
            Réserver maintenant
          </a>
        </div>
        <div style="background: #fffbeb; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
          <p style="margin: 0; color: #92400e; font-size: 0.85rem; text-align: center;">
            Ce créneau est disponible pour tous — premier arrivé, premier servi.
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

/* ── Follow-up email (J+1 after completed appointment) ─────────────────── */

interface FollowUpEmailProps {
  to: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  businessName: string;
  businessColor: string;
  businessSlug: string;
  /** Lien d'avis Google du commerçant (optionnel) */
  reviewUrl?: string | null;
}

export async function sendFollowUpEmail({
  to,
  clientName,
  serviceName,
  staffName,
  businessName,
  businessColor,
  businessSlug,
  reviewUrl,
}: FollowUpEmailProps) {
  const safeColor   = safeCssColor(businessColor);
  const safeBizName = esc(businessName);
  const safeClient  = esc(clientName);
  const safeService = esc(serviceName);
  const safeStaff   = esc(staffName);
  const bookUrl     = `${process.env.NEXT_PUBLIC_APP_URL}/book/${businessSlug}`;

  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject: `Merci pour votre visite — ${businessName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        ${emailHeader({ color: safeColor, title: `Merci !`, subtitle: `${safeBizName}`, logoUrl: await logoFor({ slug: businessSlug }) })}
        <p style="color: #374151; font-size: 1rem;">Bonjour <strong>${safeClient}</strong>,</p>
        <p style="color: #374151;">
          Merci d'être venu(e) pour votre rendez-vous
          ${safeService ? `<strong>${safeService}</strong>` : ''}
          ${safeStaff ? `avec <strong>${safeStaff}</strong>` : ''}.
          Nous espérons que tout s'est bien passé !
        </p>
        <p style="color: #374151;">
          N'hésitez pas à reprendre rendez-vous dès maintenant pour votre prochaine visite.
        </p>
        <div style="text-align: center; margin: 2rem 0;">
          <a href="${bookUrl}" target="_blank" style="display: inline-block; background: ${safeColor}; color: white; text-decoration: none; padding: 0.875rem 2rem; border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
            Reprendre rendez-vous
          </a>
        </div>
        ${reviewUrl && /^https:\/\//.test(reviewUrl) ? `
        <div style="text-align: center; margin: 0 0 2rem;">
          <p style="color: #374151; font-size: 0.9rem; margin-bottom: 0.75rem;">Votre avis compte énormément pour nous.</p>
          <a href="${reviewUrl}" target="_blank" style="display: inline-block; border: 1px solid #e5e7eb; color: #374151; text-decoration: none; padding: 0.75rem 1.75rem; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
            Laisser un avis Google
          </a>
        </div>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${safeBizName} — Réservation en ligne par <a href="https://rebites.be" style="color: #9ca3af; text-decoration: underline;">Rebites</a>
        </p>
      </div>
    `,
  });
}

/* ── Reward Reached Notification ───────────────────────────────────── */

export async function sendRewardReachedEmail({
  to, firstName, restaurantName, restaurantColor, rewardMessage,
}: {
  to: string; firstName: string; restaurantName: string; restaurantColor: string; rewardMessage: string;
}) {
  const safeColor = safeCssColor(restaurantColor);
  await resend.emails.send({
    from: `${restaurantName} <noreply@rebites.be>`,
    to,
    subject: `Félicitations ${esc(firstName)} — votre récompense est prête !`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        ${emailHeader({ color: safeColor, title: 'Récompense débloquée !', logoUrl: await logoFor({ name: restaurantName }) })}
        <p style="color: #374151; font-size: 0.95rem; line-height: 1.6;">
          Bonjour <strong>${esc(firstName)}</strong>,<br/><br/>
          Votre fidélité chez <strong>${esc(restaurantName)}</strong> a payé ! Vous avez atteint le seuil de récompense.
        </p>
        <div style="background: #f0fdf4; border-radius: 12px; padding: 1rem; margin: 1.5rem 0; text-align: center;">
          <p style="color: #059669; font-weight: 600; margin: 0;">${esc(rewardMessage)}</p>
        </div>
        <p style="color: #6b7280; font-size: 0.85rem;">
          Présentez-vous en caisse lors de votre prochaine visite pour en profiter.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${esc(restaurantName)} — Programme fidélité par <a href="https://rebites.be" style="color: #9ca3af;">Rebites</a>
        </p>
      </div>
    `,
  });
}

/* ── Near Reward Notification ──────────────────────────────────────── */

export async function sendNearRewardEmail({
  to, firstName, restaurantName, restaurantColor, currentPoints, threshold, programType,
}: {
  to: string; firstName: string; restaurantName: string; restaurantColor: string;
  currentPoints: number; threshold: number; programType: 'points' | 'stamps';
}) {
  const safeColor = safeCssColor(restaurantColor);
  const remaining = threshold - currentPoints;
  const unit = programType === 'stamps' ? 'tampon(s)' : 'point(s)';
  await resend.emails.send({
    from: `${restaurantName} <noreply@rebites.be>`,
    to,
    subject: `${esc(firstName)}, plus que ${remaining} ${unit} !`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        ${emailHeader({ color: safeColor, title: 'Vous y êtes presque !', logoUrl: await logoFor({ name: restaurantName }) })}
        <p style="color: #374151; font-size: 0.95rem; line-height: 1.6;">
          Bonjour <strong>${esc(firstName)}</strong>,<br/><br/>
          Plus que <strong>${remaining} ${unit}</strong> pour votre récompense chez <strong>${esc(restaurantName)}</strong> !
        </p>
        <div style="background: #fef3c7; border-radius: 12px; padding: 1rem; margin: 1.5rem 0; text-align: center;">
          <p style="color: #92400e; font-weight: 600; margin: 0;">${currentPoints} / ${threshold} ${unit}</p>
        </div>
        <p style="color: #6b7280; font-size: 0.85rem;">
          Passez nous voir bientôt pour compléter votre carte !
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${esc(restaurantName)} — Programme fidélité par <a href="https://rebites.be" style="color: #9ca3af;">Rebites</a>
        </p>
      </div>
    `,
  });
}

/* ── Bon cadeau ───────────────────────────────────────────────────────────── */

interface GiftVoucherEmailProps {
  to: string;
  buyerName: string;
  recipientName?: string | null;
  personalMessage?: string | null;
  code: string;
  amount: number;
  expiresAt?: string | null;
  businessName: string;
  businessColor: string;
}

export async function sendGiftVoucherEmail({
  to, buyerName, recipientName, personalMessage, code, amount, expiresAt, businessName, businessColor,
}: GiftVoucherEmailProps) {
  const color = safeCssColor(businessColor);
  const safeBiz = esc(businessName);
  const safeBuyer = esc(buyerName);
  const safeRecipient = recipientName ? esc(recipientName) : null;
  const safeMsg = personalMessage ? esc(personalMessage) : null;
  const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const giftLogo = await logoFor({ name: businessName });
  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject: `Votre bon cadeau ${amount} € — ${businessName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        <div style="background: ${color}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
          ${giftLogo ? logoTile(giftLogo, 80, 14) : ''}
          <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 0.85rem; letter-spacing: 0.1em; text-transform: uppercase;">Bon cadeau</p>
          <p style="color: white; margin: 0.4rem 0 0; font-size: 2.2rem; font-weight: 800;">${amount} €</p>
          <p style="color: rgba(255,255,255,0.9); margin: 0.4rem 0 0;">${safeBiz}</p>
        </div>
        ${safeRecipient ? `<p style="color:#374151;">Pour <strong>${safeRecipient}</strong>, de la part de <strong>${safeBuyer}</strong> :</p>` : `<p style="color:#374151;">Merci pour votre achat, <strong>${safeBuyer}</strong> !</p>`}
        ${safeMsg ? `<p style="color:#374151; font-style: italic; border-left: 3px solid ${color}; padding-left: 0.75rem;">« ${safeMsg} »</p>` : ''}
        <div style="background:#f9fafb; border: 2px dashed #d1d5db; border-radius: 12px; padding: 1.25rem; text-align: center; margin: 1.5rem 0;">
          <p style="color:#6b7280; font-size: 0.75rem; margin: 0 0 0.4rem; text-transform: uppercase; letter-spacing: 0.08em;">Code à présenter</p>
          <p style="font-family: monospace; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.15em; color: #111827; margin: 0;">${esc(code)}</p>
        </div>
        <p style="color:#6b7280; font-size: 0.85rem;">Présentez ce code chez ${safeBiz} pour utiliser votre bon.${expiry ? ` Valable jusqu'au <strong>${expiry}</strong>.` : ''}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">${safeBiz} — Bons cadeaux par <a href="https://rebites.be" style="color: #9ca3af;">Rebites</a></p>
      </div>
    `,
  });
}

interface PackageEmailProps {
  to: string;
  customerName: string;
  packageName: string;
  sessions: number;
  code: string;
  expiresAt: string | null;
  businessName: string;
  businessColor: string;
}

/** Email de confirmation d'achat d'un forfait prépayé (code + nb de séances). */
export async function sendPackageEmail({
  to, customerName, packageName, sessions, code, expiresAt, businessName, businessColor,
}: PackageEmailProps) {
  const color = safeCssColor(businessColor);
  const safeBiz = esc(businessName);
  const safeCustomer = esc(customerName);
  const safeName = esc(packageName);
  const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const pkgLogo = await logoFor({ name: businessName });
  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject: `Votre forfait ${safeName} — ${businessName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        <div style="background: ${color}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
          ${pkgLogo ? logoTile(pkgLogo, 80, 14) : ''}
          <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 0.85rem; letter-spacing: 0.1em; text-transform: uppercase;">Forfait</p>
          <p style="color: white; margin: 0.4rem 0 0; font-size: 1.6rem; font-weight: 800;">${safeName}</p>
          <p style="color: rgba(255,255,255,0.9); margin: 0.4rem 0 0;">${sessions} séance${sessions > 1 ? 's' : ''} — ${safeBiz}</p>
        </div>
        <p style="color:#374151;">Merci pour votre achat, <strong>${safeCustomer}</strong> !</p>
        <div style="background:#f9fafb; border: 2px dashed #d1d5db; border-radius: 12px; padding: 1.25rem; text-align: center; margin: 1.5rem 0;">
          <p style="color:#6b7280; font-size: 0.75rem; margin: 0 0 0.4rem; text-transform: uppercase; letter-spacing: 0.08em;">Code à présenter</p>
          <p style="font-family: monospace; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.15em; color: #111827; margin: 0;">${esc(code)}</p>
        </div>
        <p style="color:#6b7280; font-size: 0.85rem;">Présentez ce code chez ${safeBiz} à chaque séance.${expiry ? ` Valable jusqu'au <strong>${expiry}</strong>.` : ''}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">${safeBiz} — Forfaits par <a href="https://rebites.be" style="color: #9ca3af;">Rebites</a></p>
      </div>
    `,
  });
}

interface EventTicketsEmailProps {
  to: string;
  buyerName: string;
  businessName: string;
  businessColor: string;
  eventTitle: string;
  eventStartsAt: string;         // ISO
  eventLocation?: string | null;
  tickets: { code: string; url: string; walletUrl?: string; label?: string }[];
}

/** Billets d'événement — un bloc code + bouton « Afficher le billet » (QR)
 *  par billet acheté. Envoyé après paiement vérifié (ou immédiatement si
 *  l'événement est gratuit). */
export async function sendEventTicketsEmail({
  to, buyerName, businessName, businessColor, eventTitle, eventStartsAt, eventLocation, tickets,
}: EventTicketsEmailProps) {
  const color = safeCssColor(businessColor);
  const safeBiz = esc(businessName);
  const safeBuyer = esc(buyerName);
  const safeTitle = esc(eventTitle);
  const safeLoc = eventLocation ? esc(eventLocation) : null;
  const when = new Date(eventStartsAt).toLocaleString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const ticketBlocks = tickets.map((tk, i) => `
        <div style="background:#f9fafb; border: 2px dashed #d1d5db; border-radius: 12px; padding: 1.25rem; text-align: center; margin: 1rem 0;">
          <p style="color:#6b7280; font-size: 0.75rem; margin: 0 0 0.4rem; text-transform: uppercase; letter-spacing: 0.08em;">Billet ${tickets.length > 1 ? `${i + 1} / ${tickets.length}` : ''}${tk.label ? ` — <strong style="color:#111827;">${esc(tk.label)}</strong>` : ''}</p>
          <p style="font-family: monospace; font-size: 1.35rem; font-weight: 700; letter-spacing: 0.12em; color: #111827; margin: 0 0 0.9rem;">${esc(tk.code)}</p>
          <a href="${tk.url}" style="display: inline-block; background: ${color}; color: white; text-decoration: none; padding: 0.65rem 1.4rem; border-radius: 10px; font-weight: 600; font-size: 0.9rem;">Afficher le billet (QR)</a>
          ${tk.walletUrl ? `<br /><a href="${tk.walletUrl}" style="display: inline-block; background: #000000; color: white; text-decoration: none; padding: 0.55rem 1.2rem; border-radius: 10px; font-weight: 600; font-size: 0.85rem; margin-top: 0.6rem;">&#63743; Ajouter à Apple Wallet</a>` : ''}
        </div>`).join('');

  const eventLogo = await logoFor({ name: businessName });
  await resend.emails.send({
    from: `${businessName} <noreply@rebites.be>`,
    to,
    subject: `${tickets.length > 1 ? `Vos ${tickets.length} billets` : 'Votre billet'} — ${eventTitle}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        <div style="background: ${color}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
          ${eventLogo ? logoTile(eventLogo, 80, 14) : ''}
          <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 0.85rem; letter-spacing: 0.1em; text-transform: uppercase;">Billet${tickets.length > 1 ? 's' : ''} d'événement</p>
          <p style="color: white; margin: 0.4rem 0 0; font-size: 1.5rem; font-weight: 800;">${safeTitle}</p>
          <p style="color: rgba(255,255,255,0.9); margin: 0.4rem 0 0; font-size: 0.9rem;">${when}${safeLoc ? ` · ${safeLoc}` : ''}</p>
        </div>
        <p style="color:#374151;">Merci <strong>${safeBuyer}</strong> ! ${tickets.length > 1 ? 'Vos billets sont' : 'Votre billet est'} ci-dessous — présentez le QR à l'entrée.</p>
        ${ticketBlocks}
        <p style="color:#6b7280; font-size: 0.85rem;">Conservez cet email : chaque billet est nominatif pour l'achat et ne peut être utilisé qu'une fois.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">${safeBiz} — Billetterie par <a href="https://rebites.be" style="color: #9ca3af;">Rebites</a></p>
      </div>
    `,
  });
}

/* ── Affiliate commission notification ─────────────────────────────────── */

interface AffiliateCommissionEmailProps {
  to: string;
  affiliateName: string;
  restaurantName: string;
  invoiceAmount: number;
  commissionAmount: number;
  commissionRate: number;
  portalUrl: string;
}

export async function sendAffiliateCommissionEmail({
  to, affiliateName, restaurantName, invoiceAmount, commissionAmount, commissionRate, portalUrl,
}: AffiliateCommissionEmailProps) {
  const safeName = esc(affiliateName);
  const safeRestaurant = esc(restaurantName);
  const invoiceEur = (invoiceAmount / 100).toFixed(2);
  const commissionEur = (commissionAmount / 100).toFixed(2);

  await resend.emails.send({
    from: 'Rebites Affiliés <noreply@rebites.be>',
    to,
    subject: `Nouvelle commission : ${commissionEur}€ — ${restaurantName}`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        <div style="background: #1e293b; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
          <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em;">Programme Affiliés</p>
          <p style="color: white; margin: 0.5rem 0 0; font-size: 1.8rem; font-weight: 800;">${commissionEur}€</p>
          <p style="color: rgba(255,255,255,0.7); margin: 0.3rem 0 0; font-size: 0.9rem;">commission enregistrée</p>
        </div>
        <p style="color: #374151; margin: 0 0 1rem;">Bonjour <strong>${safeName}</strong>,</p>
        <p style="color: #374151; margin: 0 0 1.5rem;">Un paiement de <strong>${invoiceEur}€</strong> a été effectué par <strong>${safeRestaurant}</strong>, un établissement que vous avez parrainé. Votre commission de <strong>${commissionRate}%</strong> a été enregistrée.</p>
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; color: #374151;">
            <tr><td style="padding: 0.3rem 0;">Établissement</td><td style="padding: 0.3rem 0; text-align: right; font-weight: 600;">${safeRestaurant}</td></tr>
            <tr><td style="padding: 0.3rem 0;">Montant facturé</td><td style="padding: 0.3rem 0; text-align: right; font-weight: 600;">${invoiceEur}€</td></tr>
            <tr><td style="padding: 0.3rem 0;">Taux</td><td style="padding: 0.3rem 0; text-align: right; font-weight: 600;">${commissionRate}%</td></tr>
            <tr style="border-top: 1px solid #e2e8f0;"><td style="padding: 0.5rem 0 0.3rem; font-weight: 700;">Votre commission</td><td style="padding: 0.5rem 0 0.3rem; text-align: right; font-weight: 700; color: #059669;">${commissionEur}€</td></tr>
          </table>
        </div>
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <a href="${esc(portalUrl)}" style="display: inline-block; background: #1e293b; color: white; text-decoration: none; padding: 0.7rem 1.8rem; border-radius: 10px; font-weight: 600; font-size: 0.9rem;">Voir mon tableau de bord</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">Rebites — Programme Affiliés<br /><a href="https://rebites.be" style="color: #9ca3af;">rebites.be</a></p>
      </div>
    `,
  });
}
