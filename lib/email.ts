import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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

  await resend.emails.send({
    from: 'Carte Fidélité <noreply@rebites.be>',
    to,
    subject: `Bienvenue chez ${restaurantName} ! 🎉`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem; background: #ffffff;">
        
        <div style="background: ${restaurantColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
          <h1 style="color: white; margin: 0; font-size: 1.5rem;">🎉 Bienvenue !</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0.5rem 0 0 0;">${restaurantName}</p>
        </div>

        <p style="color: #374151; font-size: 1rem;">
          Bonjour <strong>${firstName}</strong> !
        </p>
        
        <p style="color: #374151;">
          Votre carte fidélité <strong>${restaurantName}</strong> est prête. 
          Présentez ce QR code à chaque visite pour gagner des points.
        </p>

        <div style="text-align: center; margin: 2rem 0;">
          <img 
            src="${qrUrl}"
            alt="QR Code fidélité"
            style="border-radius: 12px; border: 4px solid ${restaurantColor};"
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
          à tout moment en répondant à cet email.<br/>
          ${restaurantName} — Programme de fidélité
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
}

export async function sendBirthdayEmail({
  to,
  firstName,
  restaurantName,
  restaurantColor,
}: BirthdayEmailProps) {
  await resend.emails.send({
    from: 'Carte Fidélité <noreply@rebites.be>',
    to,
    subject: `Joyeux anniversaire ${firstName} ! 🎂`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem;">
        
        <div style="background: ${restaurantColor}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 2rem;">
          <h1 style="color: white; margin: 0; font-size: 2rem;">🎂</h1>
          <h2 style="color: white; margin: 0.5rem 0 0 0;">Joyeux anniversaire !</h2>
        </div>

        <p style="color: #374151;">
          Bonjour <strong>${firstName}</strong> !
        </p>
        
        <p style="color: #374151;">
          Toute l'équipe de <strong>${restaurantName}</strong> vous souhaite 
          un très joyeux anniversaire ! 🎉
        </p>

        <p style="color: #374151;">
          Pour fêter ça, venez nous rendre visite aujourd'hui et profitez 
          d'une surprise spéciale anniversaire !
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        
        <p style="color: #9ca3af; font-size: 0.75rem; text-align: center;">
          ${restaurantName} — Programme de fidélité
        </p>
      </div>
    `,
  });
}