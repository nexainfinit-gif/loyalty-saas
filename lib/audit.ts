import { supabaseAdmin } from '@/lib/supabase-admin';

export async function auditLog(params: {
  restaurantId: string;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  // Fire-and-forget insert — never block the main operation
  void supabaseAdmin.from('audit_log').insert({
    restaurant_id: params.restaurantId,
    actor_id: params.actorId ?? null,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    metadata: params.metadata ?? null,
  }).then(({ error }) => {
    if (error) console.error('[audit] insert failed:', error.message);
  });
}
