import { supabase } from '@/lib/supabase';

export default async function Home() {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*');

  if (error) {
    return <div>Erreur : {error.message}</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>✅ Connexion Supabase OK !</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}