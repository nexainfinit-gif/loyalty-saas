import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

interface AutoIssueParams {
  restaurantId: string;
  customerId:   string;
}

/**
 * Auto-issue an Apple Wallet pass for a newly registered customer.
 *
 * Looks up the restaurant's default published template and inserts a
 * wallet_passes row.  Returns the new pass UUID, or null if:
 *  - no default published template is configured for this restaurant
 *  - a pass for this customer+template already exists (unique constraint)
 *  - any unexpected error occurs
 *
 * Never throws — safe to await inside registration routes without
 * risking the customer-creation response.
 */
export async function autoIssueApplePass(params: AutoIssueParams): Promise<string | null> {
  const { restaurantId, customerId } = params;

  try {
    // 1. Find the restaurant's default published template
    const { data: template } = await supabaseAdmin
      .from('wallet_pass_templates')
      .select('id, valid_to')
      .eq('restaurant_id', restaurantId)
      .eq('is_default', true)
      .eq('status', 'published')
      .maybeSingle();

    if (!template) return null;  // no default template configured — skip silently

    // 2. Insert the pass (generate passId + short_code upfront for deterministic identity)
    const passId    = randomUUID();
    const shortCode = passId.replace(/-/g, '').slice(0, 8).toUpperCase();

    const authToken = randomUUID().replace(/-/g, ''); // 32 hex chars

    const { data: pass, error } = await supabaseAdmin
      .from('wallet_passes')
      .insert({
        id:                   passId,
        short_code:           shortCode,
        restaurant_id:        restaurantId,
        customer_id:          customerId,
        template_id:          template.id,
        platform:             'apple',
        status:               'active',
        expires_at:           template.valid_to ?? null,
        authentication_token: authToken,
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique-constraint violation — pass already exists, not an error
      if (error.code !== '23505') {
        console.error('[autoIssueApplePass]', error);
      }
      return null;
    }

    return pass.id;
  } catch (err) {
    console.error('[autoIssueApplePass] unexpected:', err);
    return null;
  }
}
