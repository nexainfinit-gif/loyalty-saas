import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';
import { auditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/customers/:id
 *
 * GDPR data deletion — hard-deletes a customer and cascades:
 *  - wallet_passes (revoked)
 *  - transactions
 *  - customer row
 *
 * Requires authenticated restaurant owner. Customer must belong to their restaurant.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner(request);
  if (guard instanceof NextResponse) return guard;
  if (!guard.restaurantId) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 });
  }

  const { id: customerId } = await params;

  // Verify customer belongs to this restaurant
  const { data: customer, error: custErr } = await supabaseAdmin
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('id', customerId)
    .eq('restaurant_id', guard.restaurantId)
    .maybeSingle();

  if (custErr || !customer) {
    return NextResponse.json({ error: 'Client introuvable.' }, { status: 404 });
  }

  // 1. Revoke all wallet passes for this customer
  await supabaseAdmin
    .from('wallet_passes')
    .update({ status: 'revoked' })
    .eq('customer_id', customerId)
    .eq('restaurant_id', guard.restaurantId);

  // 2. Delete transactions
  await supabaseAdmin
    .from('transactions')
    .delete()
    .eq('customer_id', customerId)
    .eq('restaurant_id', guard.restaurantId);

  // 3. Delete the customer row
  const { error: delErr } = await supabaseAdmin
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('restaurant_id', guard.restaurantId);

  if (delErr) {
    logger.error({ ctx: 'customers/delete', rid: guard.restaurantId, msg: 'Failed to delete customer', err: delErr.message });
    return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  }

  // Fire-and-forget audit log
  auditLog({
    restaurantId: guard.restaurantId,
    actorId: guard.userId,
    action: 'customer_delete',
    targetType: 'customer',
    targetId: customerId,
    metadata: {
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
    },
  });

  return NextResponse.json({
    success: true,
    deleted: {
      customer_id: customerId,
      name: `${customer.first_name} ${customer.last_name}`,
      email: customer.email,
    },
  });
}
