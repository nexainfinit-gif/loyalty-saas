import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOwner } from '@/lib/server-auth';

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
    console.error('[GDPR/delete] Failed to delete customer:', delErr.message);
    return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deleted: {
      customer_id: customerId,
      name: `${customer.first_name} ${customer.last_name}`,
      email: customer.email,
    },
  });
}
