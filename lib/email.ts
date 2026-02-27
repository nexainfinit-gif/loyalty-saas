import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface WelcomeEmailProps {
  to: string;
  firstName: string;
  restaurantName: string;
  qrToken: string;
}

export async function sendWelcomeEmail({
  to,
  firstName,
  restaurantName,
  qrToken,
}: WelcomeEmailProps) {
  const scanUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/${qrToken}`;

  await resend.emails.send({
    from: 'Carte Fidélité <noreply@rebites.be>',
    to: to, 
    subject: `Bienvenue chez ${restaurantName} ! 🎉`,
    html: `
      <div style="font-family: system-ui; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h1 style="color: #111;">Bonjour ${firstName} ! 👋</h1>
        <p>Votre carte fidélité <strong>${restaurantName}</strong> est prête.</p>
        <p>Présentez ce QR code à chaque visite pour gagner des points :</p>
        <div style="text-align: center; margin: 2rem 0;">
          <img 
            src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(scanUrl)}"
            alt="QR Code fidélité"
            style="border-radius: 8px;"
          />
        </div>
        <p style="color: #666; font-size: 0.85rem;">
          Conformément au RGPD, vous pouvez demander la suppression 
          de vos données à tout moment en répondant à cet email.
        </p>
      </div>
    `,
  });
}