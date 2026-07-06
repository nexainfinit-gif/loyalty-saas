import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Garantit qu'un restaurant possède un template Wallet par défaut, prêt à
 * l'emploi. Idempotent : ne crée rien s'il existe déjà un template publié.
 *
 * Appelé automatiquement après la configuration du programme de fidélité, pour
 * qu'un commerçant n'ait jamais à concevoir un template manuellement — sa carte
 * Wallet est fonctionnelle et auto-émise dès l'inscription des clients.
 *
 * Côté serveur (service role) : fonctionne pour tous les rôles, y compris les
 * restaurant_admin qui ne peuvent pas appeler l'endpoint owner-gated de création.
 */
export async function ensureDefaultWalletTemplate(
  restaurantId: string,
): Promise<{ created: boolean; templateId: string | null }> {
  // 1. Déjà un template publié ? → ne rien faire
  const { data: existing } = await supabaseAdmin
    .from('wallet_pass_templates')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'published')
    .limit(1);

  if (existing && existing.length > 0) {
    return { created: false, templateId: existing[0].id };
  }

  // 2. Dériver la config depuis les réglages fidélité + branding du restaurant
  const [{ data: settings }, { data: restaurant }] = await Promise.all([
    supabaseAdmin
      .from('loyalty_settings')
      .select('program_type, stamps_total, reward_message, reward_threshold, points_per_scan, card_color')
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
    supabaseAdmin
      .from('restaurants')
      .select('name, primary_color')
      .eq('id', restaurantId)
      .maybeSingle(),
  ]);

  const type: 'points' | 'stamps' =
    settings?.program_type === 'points' ? 'points' : 'stamps';
  const rewardMessage = settings?.reward_message ?? 'Récompense offerte';
  const config_json =
    type === 'points'
      ? {
          reward_threshold: settings?.reward_threshold ?? 500,
          points_per_scan:  settings?.points_per_scan  ?? 10,
          reward_message:   rewardMessage,
        }
      : { stamps_total: settings?.stamps_total ?? 10, reward_message: rewardMessage };

  const color =
    settings?.card_color || restaurant?.primary_color || '#4F6BED';
  const baseName = restaurant?.name ? `${restaurant.name} — Carte de fidélité` : 'Carte de fidélité';

  // 3. Ce template devient le défaut → nettoyer un éventuel autre défaut
  await supabaseAdmin
    .from('wallet_pass_templates')
    .update({ is_default: false })
    .eq('restaurant_id', restaurantId);

  const { data: template, error } = await supabaseAdmin
    .from('wallet_pass_templates')
    .insert({
      restaurant_id: restaurantId,
      name:          baseName,
      pass_kind:     type,
      status:        'published',
      config_json,
      primary_color: color,
      is_default:    true,
      is_repeatable: false,
    })
    .select('id')
    .single();

  if (error) {
    return { created: false, templateId: null };
  }
  return { created: true, templateId: template.id };
}
