import { timingSafeEqual } from 'crypto';

/**
 * Reserve with Google (Maps Booking) — helpers purs (Phase C — C3).
 *
 * Deux briques côté Google :
 *   1. FEEDS (découverte) : on publie merchants + services + availability au
 *      format Maps Booking. Google les ingère pour afficher le bouton
 *      « Réserver » sur Search/Maps.
 *   2. BOOKING SERVER (temps réel) : Google appelle nos endpoints
 *      /api/rwg/v3/* pour vérifier la dispo et créer/annuler les réservations.
 *
 * Tout est INERTE tant que Google n'a pas validé le partenariat (voir
 * docs/RESERVE_WITH_GOOGLE.md). L'auth des requêtes entrantes se fait par un
 * jeton partagé (RWG_AUTH_TOKEN), en Basic auth ou Bearer.
 */

export function isRwgConfigured(): boolean {
  return Boolean(process.env.RWG_AUTH_TOKEN);
}

/**
 * Vérifie le jeton partagé d'une requête Google (timing-safe). Accepte
 * « Bearer <token> » ou « Basic base64(user:token) ». false si non configuré.
 */
export function verifyRwgAuth(authHeader: string | null): boolean {
  const token = process.env.RWG_AUTH_TOKEN;
  if (!token || !authHeader) return false;

  let provided: string | null = null;
  if (authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim();
  } else if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
      // Format user:password → le jeton est le mot de passe (ou la chaîne entière).
      const idx = decoded.indexOf(':');
      provided = idx >= 0 ? decoded.slice(idx + 1) : decoded;
    } catch {
      return false;
    }
  }
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ── Feeds ────────────────────────────────────────────────────────────────── */

export interface MerchantInput {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/**
 * Merchant feed (Maps Booking v3). `merchant_id` = notre id restaurant.
 * L'URL de réservation directe pointe vers notre page publique (fallback).
 */
export function buildMerchantFeed(merchants: MerchantInput[], appUrl: string) {
  return {
    metadata: { generation_timestamp: Math.floor(Date.now() / 1000) },
    merchant: merchants.map((m) => ({
      merchant_id: m.id,
      name: m.name,
      telephone: m.phone ?? undefined,
      url: `${appUrl}/fr/book/${m.slug}`,
      geo: (m.address || m.city)
        ? {
            address: {
              street_address: m.address ?? undefined,
              locality: m.city ?? undefined,
              postal_code: m.postal_code ?? undefined,
              country: m.country ?? 'BE',
            },
          }
        : undefined,
      category: 'health_and_beauty',
    })),
  };
}

export interface ServiceInput {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price: number;
}

/** Services feed : une entrée par service actif, rattachée à son merchant. */
export function buildServicesFeed(services: ServiceInput[]) {
  return {
    metadata: { generation_timestamp: Math.floor(Date.now() / 1000) },
    service: services.map((s) => ({
      merchant_id: s.restaurant_id,
      service_id: s.id,
      name: s.name,
      description: s.description ?? undefined,
      price: { price_micros: Math.round(Number(s.price) * 1_000_000), currency_code: 'EUR' },
      duration_sec: s.duration_minutes * 60,
    })),
  };
}

/**
 * Availability feed : créneaux ouverts. `slots` doit déjà être filtré sur les
 * créneaux disponibles (voir lib/slots.computeSlots). `spotsOpen` = 1 (un
 * praticien par créneau ici).
 */
export function buildAvailabilityEntry(args: {
  merchantId: string;
  serviceId: string;
  staffId: string;
  date: string;      // YYYY-MM-DD
  startTimes: string[]; // ['09:00', ...] créneaux DISPONIBLES
  durationMinutes: number;
  timezone?: string;
}) {
  return args.startTimes.map((t) => {
    const start = new Date(`${args.date}T${t}:00`);
    return {
      merchant_id: args.merchantId,
      service_id: args.serviceId,
      start_sec: Math.floor(start.getTime() / 1000),
      duration_sec: args.durationMinutes * 60,
      spots_total: 1,
      spots_open: 1,
      resources: { staff_id: args.staffId },
    };
  });
}

/* ── Booking status mapping ──────────────────────────────────────────────── */

/** Traduit un statut d'appointment interne vers un statut Maps Booking. */
export function mapBookingStatus(status: string): 'CONFIRMED' | 'CANCELED' | 'NO_SHOW' | 'COMPLETED' | 'PENDING' {
  switch (status) {
    case 'confirmed': return 'CONFIRMED';
    case 'cancelled': return 'CANCELED';
    case 'no_show': return 'NO_SHOW';
    case 'completed': return 'COMPLETED';
    case 'pending_payment': return 'PENDING';
    default: return 'PENDING';
  }
}
