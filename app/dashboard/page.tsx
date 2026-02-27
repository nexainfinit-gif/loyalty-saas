import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });

  const total = customers?.length ?? 0;
  const totalPoints = customers?.reduce((acc, c) => acc + c.points, 0) ?? 0;
  const avgPoints = total > 0 ? Math.round(totalPoints / total) : 0;

  const today = new Date();
  const in7days = new Date();
  in7days.setDate(today.getDate() + 7);

  const birthdays = customers?.filter((c) => {
    if (!c.birth_date) return false;
    const birth = new Date(c.birth_date);
    const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    return next >= today && next <= in7days;
  }) ?? [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const inactive = customers?.filter((c) => {
    if (!c.last_visit_at) return true;
    return new Date(c.last_visit_at) < thirtyDaysAgo;
  }) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Vue d&apos;ensemble</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <p className="text-gray-500 text-sm">Total membres</p>
          <p className="text-4xl font-bold mt-1">{total}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <p className="text-gray-500 text-sm">Points moyens</p>
          <p className="text-4xl font-bold mt-1">{avgPoints}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <p className="text-gray-500 text-sm">Anniversaires (7j)</p>
          <p className="text-4xl font-bold mt-1">{birthdays.length}</p>
        </div>
      </div>

      {inactive.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="font-semibold text-orange-700">
            {inactive.length} client(s) inactif(s) depuis 30 jours
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center">
          <h3 className="font-bold text-lg">Clients</h3>
          <a
            href="/api/export-csv"
            className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition"
          >
            Export CSV
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Nom</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Email</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Points</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Dernière visite</th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers?.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">
                    {customer.first_name} {customer.last_name}
                  </td>
                  <td className="px-6 py-4 text-gray-500">{customer.email}</td>
                  <td className="px-6 py-4">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                      {customer.points} pts
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {customer.last_visit_at
                      ? new Date(customer.last_visit_at).toLocaleDateString('fr-BE')
                      : 'Jamais'}
                  </td>
                  <td className="px-6 py-4">
                    <AddPointButton customerId={customer.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddPointButton({ customerId }: { customerId: string }) {
  async function addPoint() {
    'use server';
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const { data: customer } = await supabase
      .from('customers')
      .select('points')
      .eq('id', customerId)
      .single();

    if (customer) {
      await supabase
        .from('customers')
        .update({ points: customer.points + 1 })
        .eq('id', customerId);

      await supabase.from('scan_history').insert({
        customer_id: customerId,
        points_added: 1,
      });
    }
    revalidatePath('/dashboard');
  }

  return (
    <form action={addPoint}>
      <button
        type="submit"
        className="bg-black text-white px-3 py-1 rounded-lg text-xs hover:bg-gray-800 transition"
      >
        +1 point
      </button>
    </form>
  );
}
