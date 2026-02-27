import { supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import RegisterForm from '@/components/RegisterForm';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RestaurantPage({ params }: Props) {
  const { slug } = await params;

  const { data: restaurant, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !restaurant) {
    notFound();
  }

  return <RegisterForm restaurant={restaurant} />;
}