import { GoogleAuth } from 'google-auth-library';

const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;
const classId = `${issuerId}.loyalty_saas_card`;

function getAuth() {
  return new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_WALLET_CLIENT_EMAIL!,
      private_key: process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });
}

// Créer la classe de carte (une seule fois par restaurant)
export async function createWalletClass(restaurantName: string, restaurantColor: string) {
  const auth = getAuth();
  const client = await auth.getClient();

  const walletClass = {
    id: classId,
    issuerName: restaurantName,
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: restaurantColor,
    logo: {
      sourceUri: {
        uri: 'https://storage.googleapis.com/wallet-lab-tools-codelab-artifacts-public/pass_google_logo.jpg',
      },
    },
  };

  try {
    await (client as any).request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${classId}`,
      method: 'GET',
    });
    console.log('Classe wallet déjà existante');
  } catch (getError: any) {
    console.log('Erreur GET:', getError?.response?.data);
    try {
      const postResponse = await (client as any).request({
        url: 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass',
        method: 'POST',
        data: walletClass,
      });
      console.log('Classe créée:', postResponse.data);
    } catch (postError: any) {
      console.log('Erreur POST classe:', postError?.response?.data);
    }
  }
}

// Créer un objet wallet pour un client
export async function createWalletObject(
  customerId: string,
  customerName: string,
  restaurantName: string,
  restaurantColor: string,
  points: number,
  qrToken: string
) {
  const auth = getAuth();
  const client = await auth.getClient();
  const objectId = `${issuerId}.${customerId.replace(/-/g, '_')}`;
  const scanUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/scan/${qrToken}`;

  const walletObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountId: customerId,
    accountName: customerName,
    loyaltyPoints: {
      label: 'Points',
      balance: {
        int: points,
      },
    },
    barcode: {
      type: 'QR_CODE',
      value: scanUrl,
      alternateText: 'Scannez pour gagner des points',
    },
    hexBackgroundColor: restaurantColor,
    cardTitle: {
      defaultValue: {
        language: 'fr',
        value: restaurantName,
      },
    },
    header: {
      defaultValue: {
        language: 'fr',
        value: customerName,
      },
    },
  };

  try {
    await (client as any).request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`,
      method: 'GET',
    });
    // Mettre à jour si existe déjà
    await (client as any).request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}`,
      method: 'PUT',
      data: walletObject,
    });
  } catch {
    // Créer si n'existe pas
    await (client as any).request({
      url: 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject',
      method: 'POST',
      data: walletObject,
    });
  }

  return objectId;
}

// Générer le lien "Ajouter à Google Wallet"
export async function generateWalletLink(
  customerId: string,
  customerName: string,
  restaurantName: string,
  restaurantColor: string,
  points: number,
  qrToken: string
): Promise<string> {
  // Créer la classe si nécessaire
  await createWalletClass(restaurantName, restaurantColor);

  // Créer l'objet
  const objectId = await createWalletObject(
    customerId,
    customerName,
    restaurantName,
    restaurantColor,
    points,
    qrToken
  );

  // Générer le JWT pour le lien
  const { JWT } = await import('google-auth-library');
  
  const claims = {
    iss: process.env.GOOGLE_WALLET_CLIENT_EMAIL!,
    aud: 'google',
    origins: [process.env.NEXT_PUBLIC_APP_URL!],
    typ: 'savetowallet',
    payload: {
      loyaltyObjects: [{ id: objectId }],
    },
  };

  const token = new JWT({
    email: process.env.GOOGLE_WALLET_CLIENT_EMAIL!,
    key: process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });

  const jwt = await token.authorize();
  
  // Signer le JWT manuellement
  const { sign } = await import('jsonwebtoken');
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const signedJwt = sign(claims, privateKey, { algorithm: 'RS256' });

  return `https://pay.google.com/gp/v/save/${signedJwt}`;
}