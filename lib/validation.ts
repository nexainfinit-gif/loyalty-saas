/**
 * Shared Zod schemas for public API input validation.
 */
import { z } from 'zod';

/** Schema for POST /api/register (main registration route) */
export const registerSchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(100),
  firstName:      z.string().trim().min(1, 'Le prénom est requis').max(100),
  lastName:       z.string().trim().min(1, 'Le nom est requis').max(100),
  email:          z.string().trim().email('Adresse email invalide').max(255),
  birthDate:      z.string().date().optional().nullable(),
  postalCode:     z.string().regex(/^\d{4,10}$/, 'Code postal invalide').optional().nullable(),
  marketingConsent: z.boolean(),
  ref:            z.string().trim().max(100).optional().nullable(),
});

/** Schema for POST /api/register/[slug] (slug-based registration route) */
export const registerSlugSchema = z.object({
  first_name:        z.string().trim().min(1, 'Le prénom est requis').max(100),
  email:             z.string().trim().email('Adresse email invalide').max(255),
  birth_date:        z.string().date().optional().nullable(),
  phone:             z.string().trim().max(20).optional().nullable(),
  consent_marketing: z.boolean().optional().default(false),
  ref:               z.string().trim().max(100).optional().nullable(),
});

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Parse and validate request body with a Zod schema.
 * Returns either the validated data or a formatted error string.
 */
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const messages = result.error.issues.map((i) => i.message).join(', ');
  return { success: false, error: messages };
}
