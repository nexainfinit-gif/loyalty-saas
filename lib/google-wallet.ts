// lib/google-wallet.ts
import jwt from 'jsonwebtoken'

const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID!
const CLIENT_EMAIL = process.env.GOOGLE_WALLET_CLIENT_EMAIL!
const PRIVATE_KEY = process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(/\\n/g, '\n')

interface CreateCardParams {
  customerId: string
  firstName: string
  totalPoints: number
  restaurantName: string
  restaurantSlug: string
  primaryColor: string
  logoUrl: string | null
}

export async function generateWalletUrl(params: CreateCardParams): Promise<string> {
  const {
    customerId, firstName, totalPoints,
    restaurantName, restaurantSlug, primaryColor,
  } = params

  const classId = `${ISSUER_ID}.${restaurantSlug}_loyalty`
  const objectId = `${ISSUER_ID}.${customerId.replace(/-/g, '_')}`

  const loyaltyObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountId: customerId,
    accountName: firstName,
    loyaltyPoints: {
      balance: { string: `${totalPoints} pts` },
      label: 'Points fidélité',
    },
    barcode: {
      type: 'QR_CODE',
      value: customerId,
      alternateText: customerId.slice(0, 8).toUpperCase(),
    },
    textModulesData: [
      {
        header: 'Programme',
        body: `Fidélité ${restaurantName}`,
        id: 'program',
      },
    ],
    hexBackgroundColor: primaryColor.startsWith('#') ? primaryColor : '#FF6B35',
  }

  const claims = {
    iss: CLIENT_EMAIL,
    aud: 'google',
    origins: ['*'],
    typ: 'savetowallet',
    payload: {
      loyaltyObjects: [loyaltyObject],
    },
  }
  console.log('PRIVATE_KEY début:', PRIVATE_KEY.substring(0, 50))
  console.log('PRIVATE_KEY fin:', PRIVATE_KEY.substring(PRIVATE_KEY.length - 50))
  const token = jwt.sign(claims, PRIVATE_KEY, { algorithm: 'RS256' })
  return `https://pay.google.com/gp/v/save/${token}`
}
