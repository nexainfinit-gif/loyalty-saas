'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

/**
 * Page publique de suivi d'un RDV (bêta « retard estimé »).
 * Accessible via le lien personnel du client (cancel_token), rafraîchie
 * automatiquement toutes les 60 s le jour du rendez-vous.
 */
interface StatusData {
  appointment: { date: string; startTime: string; endTime: string; status: string; service: string | null; staff: string | null }
  business: { name: string; slug: string; primaryColor: string | null } | null
  delay: { delayMinutes: number; basis: string } | null
  isToday: boolean
}

const addMinutes = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(':').map(Number)
  const t = h * 60 + m + mins
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export default function BookingStatusPage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<StatusData | null>(null)
  const [error, setError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(() => {
    fetch(`/api/book/status/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { setData(j); setUpdatedAt(new Date()) })
      .catch(() => setError(true))
  }, [token])

  useEffect(() => {
    load()
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [load])

  if (error) return <Center>Ce lien de suivi n&apos;est pas valide.</Center>
  if (!data) return <Center><span className="inline-block w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-ds-spin" /></Center>

  const { appointment: a, business, delay } = data
  const color = business?.primaryColor ?? '#111827'
  const late = delay && delay.delayMinutes >= 5
  const estimated = late ? addMinutes(a.startTime, delay!.delayMinutes) : a.startTime

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-6 max-w-md w-full">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Suivi de rendez-vous</p>
        <h1 className="text-lg font-bold text-gray-900 mb-4">{business?.name}</h1>

        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 mb-4 space-y-1">
          {a.service && <p className="text-sm font-semibold text-gray-900">{a.service}</p>}
          <p className="text-sm text-gray-600">{a.date} · {a.startTime}{a.staff ? ` — avec ${a.staff}` : ''}</p>
        </div>

        {a.status === 'cancelled' ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">Ce rendez-vous a été annulé.</p>
        ) : a.status === 'completed' ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">Rendez-vous terminé — merci de votre visite !</p>
        ) : !data.isToday ? (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">⏱ L&apos;estimation en temps réel sera disponible le jour du rendez-vous.</p>
        ) : late ? (
          <div className="rounded-xl px-4 py-3 bg-amber-50 border border-amber-100">
            <p className="text-sm font-semibold text-amber-800">
              {a.staff ?? 'Votre praticien'} a environ {delay!.delayMinutes} min de retard
            </p>
            <p className="text-sm text-amber-700 mt-0.5">Passage estimé : <strong>~{estimated}</strong></p>
          </div>
        ) : (
          <div className="rounded-xl px-4 py-3 bg-emerald-50 border border-emerald-100">
            <p className="text-sm font-semibold text-emerald-800">✓ À l&apos;heure — rendez-vous prévu à {a.startTime}</p>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <p className="text-[11px] text-gray-400">
            {updatedAt ? `Mis à jour à ${updatedAt.toTimeString().slice(0, 5)} · rafraîchi chaque minute` : ''}
          </p>
          <button onClick={load} className="text-[11px] font-medium underline" style={{ color }}>Actualiser</button>
        </div>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface flex items-center justify-center p-4 text-sm text-gray-500">{children}</div>
}
