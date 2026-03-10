import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Lazy-initialized Stripe client.
 * Avoids crashing at build time when STRIPE_SECRET_KEY is not set.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error('[stripe] STRIPE_SECRET_KEY is not set');
      }
      _stripe = new Stripe(key, { typescript: true });
    }
    return (_stripe as unknown as Record<string | symbol, unknown>)[prop];
  },
});
