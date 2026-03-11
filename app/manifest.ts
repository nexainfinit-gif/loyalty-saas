import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ReBites — Scanner QR',
    short_name: 'ReBites',
    description: 'Scanner de fidélité pour restaurants',
    start_url: '/dashboard/scanner',
    display: 'standalone',
    background_color: '#f6f8fb',
    theme_color: '#4F6BED',
    icons: [
      {
        src: '/wallet/icon.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/wallet/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
