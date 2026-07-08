import { describe, it, expect } from 'vitest';
import { estimateDelay } from '@/lib/delay-estimate';

const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const iso = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

describe('estimateDelay (bêta temps réel)', () => {
  it('aucune donnée → 0 / none', () => {
    expect(estimateDelay([], at(14, 0))).toEqual({ delayMinutes: 0, basis: 'none' });
  });

  it('dernier RDV terminé en retard → dérive completed', () => {
    const r = estimateDelay(
      [{ start_time: '13:00', end_time: '13:30', status: 'completed', completed_at: iso(13, 45) }],
      at(14, 0),
    );
    expect(r.delayMinutes).toBe(15);
    expect(r.basis).toBe('completed');
  });

  it('terminé en avance → 0 (jamais négatif)', () => {
    const r = estimateDelay(
      [{ start_time: '13:00', end_time: '13:30', status: 'completed', completed_at: iso(13, 20) }],
      at(14, 0),
    );
    expect(r.delayMinutes).toBe(0);
  });

  it('bouchon : RDV confirmé qui aurait dû finir → retard backlog', () => {
    const r = estimateDelay(
      [{ start_time: '13:30', end_time: '14:00', status: 'confirmed' }],
      at(14, 20),
    );
    expect(r.delayMinutes).toBe(20);
    expect(r.basis).toBe('backlog');
  });

  it('max des deux signaux', () => {
    const r = estimateDelay(
      [
        { start_time: '12:00', end_time: '12:30', status: 'completed', completed_at: iso(12, 40) }, // +10
        { start_time: '13:00', end_time: '13:30', status: 'confirmed' },                             // bouchon +30 à 14:00
      ],
      at(14, 0),
    );
    expect(r.delayMinutes).toBe(30);
    expect(r.basis).toBe('backlog');
  });

  it('prend le PLUS RÉCENT terminé (rattrapage pris en compte)', () => {
    const r = estimateDelay(
      [
        { start_time: '12:00', end_time: '12:30', status: 'completed', completed_at: iso(12, 50) }, // +20
        { start_time: '13:00', end_time: '13:30', status: 'completed', completed_at: iso(13, 32) }, // +2 (a rattrapé)
      ],
      at(14, 0),
    );
    expect(r.delayMinutes).toBe(2);
  });
});
