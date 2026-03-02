'use client'
import { supabase } from '@/lib/supabase-browser'

export default function SupabaseDevExpose() {
  // dev-only global for debugging
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    (window as any).supabase = supabase
  }
  return null
}
