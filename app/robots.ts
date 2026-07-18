import type { MetadataRoute } from 'next';
import { locales } from '@/lib/i18n-server';

/**
 * /robots.txt — sans ce fichier, la requête était avalée par le segment
 * dynamique [locale] et renvoyait la page HTML du redirecteur (HTTP 200)
 * aux crawlers. Les pages publiques (inscription, réservation, événements)
 * restent indexables ; les espaces privés et l'API sont exclus.
 * Le SEO principal vit sur le site marketing (rebites.be).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          ...locales.flatMap((l) => [`/${l}/dashboard`, `/${l}/admin`, `/${l}/client`]),
        ],
      },
    ],
  };
}
