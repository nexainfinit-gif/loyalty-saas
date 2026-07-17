/**
 * Lightweight fetch wrapper for dashboard API calls.
 * Attache le Bearer token de la session (localStorage) — chemin d'auth prévu
 * par server-auth pour les appels client — avec le cookie same-origin en
 * secours. Sans le Bearer, les appareils dont le cookie de session est absent
 * ou expiré recevaient « Non authentifié » alors que l'app semblait connectée.
 */
import { supabase } from '@/lib/supabase';

export async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...options?.headers,
      },
    });
    const json = await res.json();
    if (!res.ok) {
      return { data: null, error: json.error || `Erreur ${res.status}` };
    }
    return { data: json as T, error: null };
  } catch {
    return { data: null, error: 'Erreur réseau.' };
  }
}
