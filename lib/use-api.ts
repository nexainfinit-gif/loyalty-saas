/**
 * Lightweight fetch wrapper for dashboard API calls.
 * Includes the auth cookie automatically (same-origin fetch).
 */

export async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
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
