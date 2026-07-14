'use client';
import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

/**
 * Accès équipe (comptes staff/gérant — option B) : liste des membres +
 * invitations en attente, invitation par email + rôle, révocation.
 * Partagé entre les Réglages généraux (tous les établissements, cafés compris)
 * et les réglages booking (salons). Réutilise les clés i18n appointmentSettings.team*.
 */
type TeamMember = { id: string; email: string | null; role: string; booking_access?: boolean };
type TeamInvite = { id: string; email: string; role: string; status: string };

export default function TeamAccessSection({ bookingActive = false }: { bookingActive?: boolean }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'restaurant_admin'>('staff');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/team')
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j?.members) setMembers(j.members);
        if (j?.invites) setInvites(j.invites.filter((i: TeamInvite) => i.status === 'pending'));
      })
      .catch(() => {});
  }, []);

  async function sendInvite() {
    const mail = email.trim().toLowerCase();
    if (!mail) return;
    setInviting(true);
    setError('');
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail, role }),
      });
      const j = await res.json();
      if (res.ok && j.invite) {
        setInvites(v => [{ id: j.invite.id, email: j.invite.email, role: j.invite.role, status: 'pending' }, ...v]);
        setEmail('');
      } else {
        setError(j.error || t('common.error'));
      }
    } finally {
      setInviting(false);
    }
  }

  async function remove(id: string, kind: 'member' | 'invite') {
    if (kind === 'member') setMembers(v => v.filter(m => m.id !== id));
    else setInvites(v => v.filter(i => i.id !== id));
    await fetch(`/api/team/${id}?type=${kind}`, { method: 'DELETE' }).catch(() => {});
  }

  // Donne/retire l'accès agenda (Booking) à un membre staff.
  async function toggleBooking(id: string, next: boolean) {
    setMembers(v => v.map(m => (m.id === id ? { ...m, booking_access: next } : m)));
    await fetch(`/api/team/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_access: next }),
    }).catch(() => {
      setMembers(v => v.map(m => (m.id === id ? { ...m, booking_access: !next } : m)));
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={16} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">{t('appointmentSettings.teamTitle')}</h3>
      </div>
      <p className="text-xs text-gray-400">{t('appointmentSettings.teamDesc')}</p>

      {(members.length > 0 || invites.length > 0) && (
        <div className="space-y-1.5">
          {members.map(m => (
            <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
              <span className="text-sm text-gray-700 truncate">{m.email ?? '—'}</span>
              <div className="flex items-center gap-3">
                {/* Accès agenda (Booking) — uniquement staff, si le service est actif */}
                {bookingActive && m.role === 'staff' && (
                  <button
                    type="button"
                    onClick={() => toggleBooking(m.id, !m.booking_access)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${m.booking_access ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                    title="Accès à l'agenda Rebites Booking"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${m.booking_access ? 'bg-primary-600' : 'bg-gray-300'}`} />
                    Agenda
                  </button>
                )}
                <span className="text-[11px] font-medium text-gray-500 uppercase">{m.role === 'restaurant_admin' ? t('appointmentSettings.teamRoleAdmin') : t('appointmentSettings.teamRoleStaff')}</span>
                <button type="button" onClick={() => remove(m.id, 'member')} className="text-gray-300 hover:text-red-500 transition-colors text-xs">✕</button>
              </div>
            </div>
          ))}
          {invites.map(i => (
            <div key={i.id} className="flex items-center justify-between rounded-lg bg-amber-50/60 border border-amber-100 px-3 py-2">
              <span className="text-sm text-gray-600 truncate">{i.email}</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-amber-600">{t('appointmentSettings.teamPending')}</span>
                <button type="button" onClick={() => remove(i.id, 'invite')} className="text-gray-300 hover:text-red-500 transition-colors text-xs">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email"
          placeholder={t('appointmentSettings.teamEmailPlaceholder')} className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors" />
        <select value={role} onChange={e => setRole(e.target.value as 'staff' | 'restaurant_admin')}
          className="px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors">
          <option value="staff">{t('appointmentSettings.teamRoleStaff')}</option>
          <option value="restaurant_admin">{t('appointmentSettings.teamRoleAdmin')}</option>
        </select>
        <button type="button" onClick={sendInvite} disabled={inviting}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors">
          {inviting ? '…' : t('appointmentSettings.teamInviteBtn')}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-gray-400">{t('appointmentSettings.teamStaffHint')}</p>
    </section>
  );
}
