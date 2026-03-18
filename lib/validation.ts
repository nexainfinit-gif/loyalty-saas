/**
 * Shared Zod schemas for public API input validation.
 */
import { z } from 'zod';

/** Strip HTML tags to prevent stored XSS */
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '');

/** Schema for POST /api/register (main registration route) */
export const registerSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(100),
  firstName:      z.string().trim().min(1, 'Le prénom est requis').max(100).transform(stripHtml),
  lastName:       z.string().trim().min(1, 'Le nom est requis').max(100).transform(stripHtml),
  email:          z.string().trim().email('Adresse email invalide').max(255),
  birthDate:      z.string().date().optional().nullable(),
  postalCode:     z.string().regex(/^\d{4,10}$/, 'Code postal invalide').optional().nullable(),
  marketingConsent: z.boolean(),
  ref:            z.string().trim().max(100).optional().nullable(),
});

/** Schema for POST /api/register/[slug] (slug-based registration route) */
export const registerSlugSchema = z.object({
  first_name:        z.string().trim().min(1, 'Le prénom est requis').max(100).transform(stripHtml),
  email:             z.string().trim().email('Adresse email invalide').max(255),
  birth_date:        z.string().date().optional().nullable(),
  phone:             z.string().trim().max(20).optional().nullable(),
  consent_marketing: z.literal(true, {
    error: 'Vous devez accepter les conditions pour vous inscrire.',
  }),
  ref:               z.string().trim().max(100).optional().nullable(),
});

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Convert a raw Zod issue message to a user-friendly French string.
 * If the schema already defines a custom French message, keep it as-is.
 */
function humanizeZodMessage(issue: z.ZodIssue): string {
  const msg = issue.message.toLowerCase();
  const code = issue.code;
  if (code === 'too_small')                  return 'Ce champ est obligatoire.';
  if (code === 'too_big')                    return 'Le champ est trop long.';
  if (msg.includes('invalid') && msg.includes('email')) return 'Adresse email invalide.';
  if (code === 'invalid_type')               return 'Format invalide.';
  if (code === 'invalid_format')             return 'Format invalide.';
  if (code === 'invalid_value')              return 'Valeur invalide.';
  // Keep custom French messages already defined in schemas
  if (/[À-ÿà-ÿ]/.test(issue.message) || issue.message.length > 10) return issue.message;
  return 'Format invalide.';
}

/**
 * Parse and validate request body with a Zod schema.
 * Returns either the validated data or a formatted error string.
 */
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const messages = result.error.issues.map(humanizeZodMessage).join(', ');
  return { success: false, error: messages };
}
