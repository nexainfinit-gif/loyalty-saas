'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { resolveEventTheme } from '@/lib/event-themes'
import { PageStyles, TopBand, NeutralLoader, type PubEvent, type PubBusiness } from '../shared'

/**
 * Page publique d'UN événement — /[locale]/event/[slug]/[eventSlug].
 * L'événement vit ici dans SON thème, plein cadre (la liste de
 * l'organisateur reste dans un seul thème et renvoie vers ces pages —
 * jamais deux thèmes sur une même page). L'achat se fait ici ; le retour
 * Stripe (confirmation) atterrit sur la liste, inchangé.
 */
function EventDetailContent() {
  const { t, locale } = useTranslation()
  const params = useParams()
  const slug = params.slug as string
  const eventSlug = params.eventSlug as string

  const [business, setBusiness] = useState<PubBusiness | null>(null)
  const [ev, setEv] = useState<PubEvent | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)

  const [tierId, setTierId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [joinLoyalty, setJoinLoyalty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)

  useEffect(() => {
    fetch(`/api/event/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => {
        setBusiness({ name: j.name, city: j.city, primaryColor: j.primaryColor, logoUrl: j.logoUrl })
        const found = (j.events as PubEvent[]).find(e => e.slug === eventSlug) ?? null
        setEv(found)
        if (found) {
          const firstAvailable = found.tiers.find(tr => tr.remaining === null || tr.remaining > 0)
          setTierId(firstAvailable?.id ?? null)
        }
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false))
  }, [slug, eventSlug])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ev) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/event/${slug}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: ev.id, ...(tierId ? { tierId } : {}), quantity, buyerName, buyerEmail, joinLoyalty }),
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

  if (loading) return <NeutralLoader />

  const C = resolveEventTheme(ev?.theme)

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="ev-bg min-h-screen">
      <PageStyles shell={C} />
      <div className="ev-vibe" />
      <TopBand T={C} />
      <div className="relative z-10">{children}</div>
    </div>
  )

  if (unavailable || !business || !ev) {
    return (
      <Shell>
        <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 gap-4">
          <p className="ev-mono text-sm" style={{ color: C.muted }}>{t('event.unavailable')}</p>
          <Link href={`/${locale}/event/${slug}`} className="ev-mono text-xs uppercase tracking-[0.2em] underline" style={{ color: C.accent }}>
            ← {t('event.backToList')}
          </Link>
        </div>
      </Shell>
    )
  }

  // Réservation gratuite confirmée : les billets, direct.
  if (codes) {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md ev-up">
            <p className="ev-mono text-[11px] uppercase tracking-[0.3em] mb-3" style={{ color: C.accent }}>✦ {t('event.successTitle')}</p>
            <h1 className={`ev-display-${C.key} text-3xl leading-tight mb-2`} style={{ color: C.ink }}>{t('event.successDesc')}</h1>
            <div className="mt-6 space-y-4">
              {codes.map((c, i) => (
                <a key={c} href={`/${locale}/event/ticket/${c}`} className="ev-stub-code p-4 text-center ev-up" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                  <span className="ev-mono block text-xl font-bold tracking-[0.15em]">{c}</span>
                  <span className="ev-mono block text-[10px] uppercase tracking-[0.25em] mt-1 opacity-60">{t('event.showTicket')}</span>
                </a>
              ))}
            </div>
            <p className="ev-mono text-[11px] mt-6 uppercase tracking-wider" style={{ color: C.muted }}>{t('event.emailSent')}</p>
          </div>
        </div>
      </Shell>
    )
  }

  const soldOut = ev.remaining !== null && ev.remaining <= 0
  const d = new Date(ev.starts_at)
  const longDate = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  const hasTiers = ev.tiers.length > 0
  const selectedTier = hasTiers ? (ev.tiers.find(tr => tr.id === tierId) ?? null) : null
  const unitPrice = selectedTier ? selectedTier.price : ev.price
  const minPrice = hasTiers ? Math.min(...ev.tiers.map(tr => tr.price)) : ev.price
  const anyPaid = hasTiers ? ev.tiers.some(tr => tr.price > 0) : ev.price > 0
  const priceBadge = hasTiers
    ? (minPrice > 0 ? t('event.fromPrice', { price: minPrice }) : t('event.free').toUpperCase())
    : (ev.price > 0 ? `${ev.price} €` : t('event.free').toUpperCase())
  const unitCap = selectedTier
    ? (selectedTier.remaining ?? (ev.remaining != null ? Math.floor(ev.remaining / selectedTier.seatsPerUnit) : null))
    : ev.remaining

  const chip = (label: string, value: string) => (
    <span className="inline-flex flex-col gap-0.5 px-3 py-2" style={{ border: `${C.dark ? '2px' : '1px'} solid ${C.border}`, borderRadius: C.radius, background: C.surface }}>
      <span className="ev-mono text-[9px] uppercase tracking-[0.25em]" style={{ color: C.faint }}>{label}</span>
      <span className="ev-mono text-xs font-bold" style={{ color: C.ink }}>{value}</span>
    </span>
  )

  return (
    <Shell>
      <div className="max-w-lg mx-auto px-4 pb-28 sm:pb-16">
        {/* Fil de retour vers la billetterie de l'organisateur */}
        <nav className="pt-6 ev-up">
          <Link href={`/${locale}/event/${slug}`} className="ev-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
            ← {business.name}
          </Link>
        </nav>

        {/* Hero — l'événement plein cadre, dans SON thème */}
        <header className="pt-6 pb-6 ev-up" style={{ animationDelay: '0.05s' }}>
          <p className="ev-mono text-[11px] uppercase tracking-[0.3em] mb-3" style={{ color: C.accent }}>✦ Rebites Events</p>
          <h1 className={`ev-display-${C.key} text-4xl sm:text-5xl leading-[1.02] break-words`} style={{ color: C.ink }}>
            {ev.title}
          </h1>
          <div className="flex flex-wrap gap-2 mt-5">
            {chip(t('event.dateLabel'), `${longDate} · ${time}`)}
            {ev.location && chip(t('event.locationLabel'), ev.location)}
            {chip(t('event.priceLabel'), priceBadge)}
          </div>
          {ev.description && (
            <p className="text-sm mt-5 whitespace-pre-line leading-relaxed" style={{ color: C.muted }}>{ev.description}</p>
          )}
          {ev.remaining !== null && !soldOut && ev.remaining <= 5 && (
            <p className="ev-mono text-[11px] font-bold uppercase tracking-[0.15em] mt-3" style={{ color: C.accent2 }}>
              ⚡ {t('event.fewLeft', { count: ev.remaining })}
            </p>
          )}
        </header>

        {/* Achat */}
        <div id="buy" className={`ev-card-${C.key} ev-up p-5 sm:p-6`} style={{ animationDelay: '0.12s' }}>
          {soldOut ? (
            <p className="ev-mono text-sm font-bold uppercase tracking-[0.2em] line-through" style={{ color: C.faint }}>
              {t('event.soldOut')}
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {hasTiers && (
                <div className="space-y-2">
                  {ev.tiers.map(tr => {
                    const trSoldOut = tr.remaining !== null && tr.remaining <= 0
                    const active = tierId === tr.id
                    return (
                      <button
                        key={tr.id} type="button" disabled={trSoldOut}
                        onClick={() => { setTierId(tr.id); setQuantity(1) }}
                        className="w-full text-left px-3 py-2.5 transition-colors disabled:opacity-40"
                        style={{
                          border: `2px solid ${active ? C.accent : C.border}`,
                          borderRadius: C.radius,
                          background: active ? `${C.accent}14` : 'transparent',
                        }}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold" style={{ color: C.ink }}>
                              {tr.name}
                              {tr.kind === 'vip_table' && (
                                <span className="ev-mono text-[10px] font-bold uppercase tracking-[0.15em] ml-2 px-1.5 py-0.5"
                                  style={{ color: C.accentInk, background: C.accent, borderRadius: C.radius }}>
                                  {t('event.tableOf', { seats: tr.seatsPerUnit })}
                                </span>
                              )}
                            </span>
                            {tr.description && (
                              <span className="block text-xs mt-0.5" style={{ color: C.muted }}>{tr.description}</span>
                            )}
                            {trSoldOut ? (
                              <span className="ev-mono block text-[10px] uppercase tracking-[0.15em] mt-0.5 line-through" style={{ color: C.faint }}>
                                {t('event.soldOut')}
                              </span>
                            ) : tr.remaining !== null && tr.remaining <= 5 && (
                              <span className="ev-mono block text-[10px] uppercase tracking-[0.15em] mt-0.5" style={{ color: C.accent2 }}>
                                ⚡ {t('event.fewLeft', { count: tr.remaining })}
                              </span>
                            )}
                          </span>
                          <span className="ev-mono flex-shrink-0 text-sm font-bold" style={{ color: active ? C.accent : C.ink }}>
                            {tr.price > 0 ? `${tr.price} €` : t('event.free').toUpperCase()}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {/* Quantité : cibles 40 px sur mobile */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="ev-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: C.muted }}>{t('event.quantity')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6]
                    .filter(n => unitCap === null || n <= unitCap)
                    .map(n => (
                      <button
                        key={n} type="button"
                        onClick={() => setQuantity(n)}
                        className="ev-mono w-10 h-10 sm:w-8 sm:h-8 text-sm sm:text-xs font-bold transition-colors"
                        style={quantity === n
                          ? { background: C.accent, color: C.accentInk, border: `2px solid ${C.accent}`, borderRadius: C.radius }
                          : { color: C.muted, border: `2px solid ${C.border}`, borderRadius: C.radius }}
                      >
                        {n}
                      </button>
                    ))}
                </div>
              </div>
              {/* text-base : sous 16 px, iOS Safari zoome de force au focus */}
              <input required value={buyerName} onChange={e => setBuyerName(e.target.value)} maxLength={100}
                autoComplete="name"
                placeholder={t('event.buyerName')} className={`ev-input-${C.key} w-full px-3 py-3 text-base sm:text-sm`} />
              <input required type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} maxLength={255}
                autoComplete="email" inputMode="email"
                placeholder={t('event.buyerEmail')} className={`ev-input-${C.key} w-full px-3 py-3 text-base sm:text-sm`} />
              {ev.offer_loyalty && (
                <label className="flex items-start gap-2 text-xs" style={{ color: C.muted }}>
                  <input type="checkbox" checked={joinLoyalty} onChange={e => setJoinLoyalty(e.target.checked)}
                    className="mt-0.5" style={{ accentColor: C.accent }} />
                  {t('event.joinLoyalty', { business: business.name })}
                </label>
              )}
              {error && (
                <p className="ev-mono text-xs px-3 py-2" style={{ color: C.accent2, border: `2px solid ${C.accent2}`, borderRadius: C.radius }}>{error}</p>
              )}
              <button
                type="submit" disabled={submitting}
                className={`ev-btn-${C.key} ev-mono w-full py-3.5 text-sm font-bold uppercase tracking-[0.15em] disabled:opacity-50`}
              >
                {submitting ? '…' : unitPrice > 0
                  ? t('event.payBtn', { amount: (unitPrice * quantity).toFixed(2).replace(/\.00$/, '') })
                  : t('event.confirmFreeBtn')}
              </button>
              {unitPrice > 0 && (
                <p className="ev-mono text-[10px] uppercase tracking-[0.2em] text-center" style={{ color: C.faint }}>{t('event.securePayment')}</p>
              )}
            </form>
          )}
        </div>

        <footer className="mt-14 text-center ev-up" style={{ animationDelay: '0.2s' }}>
          <p className="ev-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: C.faint }}>
            {business.name} ✦ {t('event.poweredBy')}{' '}
            <a href="https://rebites.be" className="underline" style={{ color: C.accent }}>Rebites Events</a>
          </p>
        </footer>
      </div>

      {/* Barre sticky mobile (zone du pouce) — amène au bloc d'achat */}
      {!soldOut && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-20 px-4 py-3 flex items-center gap-3"
          style={{ background: C.surface, borderTop: `${C.dark ? '2px' : '1px'} solid ${C.border}`, paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <span className="ev-mono text-sm font-bold flex-shrink-0" style={{ color: C.ink }}>{priceBadge}</span>
          <button
            onClick={() => document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`ev-btn-${C.key} ev-mono flex-1 py-3 text-sm font-bold uppercase tracking-[0.15em]`}
          >
            {anyPaid ? t('event.buyBtn') : t('event.reserveBtn')} →
          </button>
        </div>
      )}
    </Shell>
  )
}

export default function EventDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#ffffff' }} />}>
      <EventDetailContent />
    </Suspense>
  )
}
