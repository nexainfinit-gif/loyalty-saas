/**
 * Bêta « retard estimé » — heuristique pure sur les RDV du jour d'un praticien.
 * Signaux :
 *  1. Dernier RDV terminé : completed_at réel − fin planifiée (migration 044).
 *  2. Bouchon : RDV confirmé qui aurait déjà dû finir mais pas encore validé.
 * Retard = max des deux, plancher 0. Sans données → 'none' (on affiche « à
 * l'heure » sans promettre).
 */
export interface DelayInput {
  start_time: string;            // 'HH:MM[:SS]'
  end_time: string;
  status: string;                // confirmed | completed | ...
  completed_at?: string | null;  // ISO
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function estimateDelay(
  appointments: DelayInput[],
  now: Date,
): { delayMinutes: number; basis: 'completed' | 'backlog' | 'none' } {
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 1. Dérive du dernier RDV terminé (le plus récent par completed_at)
  let fromCompleted = 0;
  let hasCompleted = false;
  let latest: DelayInput | null = null;
  for (const a of appointments) {
    if (a.status !== 'completed' || !a.completed_at) continue;
    if (!latest || a.completed_at > (latest.completed_at ?? '')) latest = a;
  }
  if (latest?.completed_at) {
    hasCompleted = true;
    const done = new Date(latest.completed_at);
    const doneMin = done.getHours() * 60 + done.getMinutes();
    fromCompleted = Math.max(0, doneMin - toMin(latest.end_time));
  }

  // 2. Bouchon : plus ancien RDV confirmé dont la fin planifiée est dépassée
  let fromBacklog = 0;
  for (const a of appointments) {
    if (a.status !== 'confirmed') continue;
    const overdue = nowMin - toMin(a.end_time);
    if (overdue > 0) fromBacklog = Math.max(fromBacklog, overdue);
  }

  const delayMinutes = Math.max(fromCompleted, fromBacklog);
  const basis = fromBacklog >= fromCompleted && fromBacklog > 0
    ? 'backlog'
    : hasCompleted ? 'completed' : 'none';
  return { delayMinutes, basis: delayMinutes === 0 && !hasCompleted ? 'none' : basis };
}
