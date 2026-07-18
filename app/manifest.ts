import type { MetadataRoute } from 'next'

/**
 * PWA manifest — « Ajouter à l'écran d'accueil » (iOS/Android) avec icône et
 * plein écran, comme une app. start_url '/' = le redirecteur d'auth :
 * gérant → dashboard, coiffeur → agenda, non connecté → login.
 * iOS exige des icônes PNG (les SVG sont ignorés → icône grise).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rebites',
    short_name: 'Rebites',
    description: 'Fidélité, réservations et carte Wallet pour votre établissement',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f8fb',
    theme_color: '#4F6BED',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
