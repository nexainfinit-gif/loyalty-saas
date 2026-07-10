'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

/**
 * Page publique billetterie — /[locale]/event/[slug].
 * Liste les événements publiés de l'établissement ; achat inline
 * (gratuit = billets immédiats, payant = Checkout Stripe du commerçant) ;
 * retour de paiement ?purchase&session → confirmation serveur → codes.
 */
interface PubEvent {
  id: string
  title: string
  slug: string
  description: string | null
  location: string | null
  starts_at: string
  price: number
  remaining: number | null
  offer_loyalty: boolean
}

function EventContent() {
  const { t, locale } = useTranslation()
  const params = useParams()
  const slug = params.slug as string
  const sp = useSearchParams()

  const [business, setBusiness] = useState<{ name: string; city: string | null; primaryColor: string | null; logoUrl: string | null } | null>(null)
  const [events, setEvents] = useState<PubEvent[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)

  // Achat en cours (formulaire déplié sur un événement)
  const [openId, setOpenId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [joinLoyalty, setJoinLoyalty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Retour de paiement / billets gratuits émis
  const purchaseId = sp.get('purchase')
  const sessionId = sp.get('session')
  const [confirmState, setConfirmState] = useState<'idle' | 'verifying' | 'failed'>(purchaseId && sessionId ? 'verifying' : 'idle')
  const [codes, setCodes] = useState<string[] | null>(null)

  useEffect(() => {
    fetch(`/api/event/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { setBusiness({ name: j.name, city: j.city, primaryColor: j.primaryColor, logoUrl: j.logoUrl }); setEvents(j.events) })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!purchaseId || !sessionId) return
    fetch('/api/event/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseId, sessionId }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.codes) { setCodes(j.codes); setConfirmState('idle') }
        else setConfirmState('failed')
      })
      .catch(() => setConfirmState('failed'))
  }, [purchaseId, sessionId])

  async function submit(e: React.FormEvent, ev: PubEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/event/${slug}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: ev.id, quantity, buyerName, buyerEmail, joinLoyalty }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error || t('common.error')); return }
      if (j.free) { setCodes(j.codes); return }
      window.location.href = j.paymentUrl
    } catch {
      setError(t('common.networkErrorRetry'))
    } finally {
      setSubmitting(false)
    }
  }

  const color = business?.primaryColor ?? '#111827'

  if (loading || confirmState === 'verifying') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-ds-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">{confirmState === 'verifying' ? t('event.verifying') : t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (codes) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">🎟️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{t('event.successTitle')}</h1>
          <p className="text-sm text-gray-500 mb-6">{t('event.successDesc')}</p>
          {codes.map(c => (
            <a
              key={c}
              href={`/${locale}/event/ticket/${c}`}
              className="block rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4 mb-3 hover:bg-gray-100 transition-colors"
            >
              <p className="font-mono text-lg font-bold tracking-[0.12em] text-gray-900">{c}</p>
              <p className="text-xs font-medium mt-1" style={{ color }}>{t('event.showTicket')}</p>
            </a>
          ))}
          <p className="text-xs text-gray-400">{t('event.emailSent')}</p>
        </div>
      </div>
    )
  }

  if (confirmState === 'failed') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-lg font-semibold mb-2">{t('event.paymentIssue')}</h1>
          <p className="text-sm text-gray-500">{t('event.paymentIssueDesc')}</p>
        </div>
      </div>
    )
  }

  if (unavailable || !business) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">{t('event.unavailable')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          {business.logoUrl
            ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={business.logoUrl} alt="" className="mx-auto mb-3 max-h-20 max-w-[180px] object-contain" />
            : <div className="text-4xl mb-2">🎟️</div>}
          <h1 className="text-2xl font-bold text-gray-900">{business.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('event.pageSubtitle')}{business.city ? ` · ${business.city}` : ''}</p>
        </div>

        {events.length === 0 && (
          <p className="text-center text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-8">{t('event.noEvents')}</p>
        )}

        <div className="space-y-4">
          {events.map(ev => {
            const soldOut = ev.remaining !== null && ev.remaining <= 0
            const isOpen = openId === ev.id
            const when = new Date(ev.starts_at).toLocaleString(locale, {
              weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
            })
            return (
              <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-gray-900">{ev.title}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{when}{ev.location ? ` · ${ev.location}` : ''}</p>
                  </div>
                  <span className="flex-shrink-0 text-sm font-bold" style={{ color }}>
                    {ev.price > 0 ? `${ev.price} €` : t('event.free')}
                  </span>
                </div>
                {ev.description && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{ev.description}</p>}
                {ev.remaining !== null && !soldOut && ev.remaining <= 20 && (
                  <p className="text-xs font-medium text-amber-600 mt-2">{t('event.fewLeft', { count: ev.remaining })}</p>
                )}

                {soldOut ? (
                  <p className="mt-3 text-sm font-semibold text-gray-400">{t('event.soldOut')}</p>
                ) : !isOpen ? (
                  <button
                    onClick={() => { setOpenId(ev.id); setError(''); setQuantity(1); setJoinLoyalty(false) }}
                    className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity"
                    style={{ background: color }}
                  >
                    {ev.price > 0 ? t('event.buyBtn') : t('event.reserveBtn')}
                  </button>
                ) : (
                  <form onSubmit={e => submit(e, ev)} className="mt-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-semibold text-gray-500">{t('event.quantity')}</label>
                      <select
                        value={quantity}
                        onChange={e => setQuantity(Number(e.target.value))}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none"
                      >
                        {[1, 2, 3, 4, 5, 6]
                          .filter(n => ev.remaining === null || n <= ev.remaining)
                          .map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <input required value={buyerName} onChange={e => setBuyerName(e.target.value)} maxLength={100}
                      placeholder={t('event.buyerName')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                    <input required type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} maxLength={255}
                      placeholder={t('event.buyerEmail')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
                    {ev.offer_loyalty && (
                      <label className="flex items-start gap-2 text-xs text-gray-600">
                        <input type="checkbox" checked={joinLoyalty} onChange={e => setJoinLoyalty(e.target.checked)} className="mt-0.5" />
                        {t('event.joinLoyalty', { business: business.name })}
                      </label>
                    )}
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                    <button
                      type="submit" disabled={submitting}
                      className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                      style={{ background: color }}
                    >
                      {submitting ? '…' : ev.price > 0
                        ? t('event.payBtn', { amount: (ev.price * quantity).toFixed(2).replace(/\.00$/, '') })
                        : t('event.confirmFreeBtn')}
                    </button>
                    {ev.price > 0 && <p className="text-[11px] text-gray-400 text-center">{t('event.securePayment')}</p>}
                  </form>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-8">
          {business.name} — {t('event.poweredBy')} <a href="https://rebites.be" className="underline">Rebites</a>
        </p>
      </div>
    </div>
  )
}

export default function EventPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <EventContent />
    </Suspense>
  )
}
