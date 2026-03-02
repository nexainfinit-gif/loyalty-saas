import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

if (process.env.NODE_ENV === 'development') {
  if (typeof window !== 'undefined') {
    (window as any).supabase = supabase;
  }
}
