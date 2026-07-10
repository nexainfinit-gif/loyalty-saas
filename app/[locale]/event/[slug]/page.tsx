'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

/**
 * Page publique billetterie — /[locale]/event/[slug].
 * Identité « Rebites Events » : poster-brutalisme nocturne (fond noir grain,
 * vibration acide animée, typo Unbounded XXL, bordures dures, ombres lime).
 * Univers volontairement dissocié du design system dashboard.
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

const ACID = '#C8FF2E'
const MAGENTA = '#FF3EA5'
const INK = '#0B0B10'

const BrandStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&display=swap');
    .ev-display { font-family: 'Unbounded', system-ui, sans-serif; }
    .ev-mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
    /* Le body doit suivre : sinon bande blanche sous le pli. */
    body { background: ${INK}; }
    .ev-bg {
      background: ${INK};
      position: relative;
      overflow-x: hidden;
    }
    .ev-bg::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
      opacity: 0.05;
    }
    .ev-vibe {
      position: fixed; width: 60vmax; height: 60vmax; border-radius: 50%;
      filter: blur(90px); opacity: 0.32; z-index: 0; pointer-events: none;
      background: radial-gradient(circle at 30% 30%, ${ACID}, transparent 55%),
                  radial-gradient(circle at 70% 70%, ${MAGENTA}, transparent 55%),
                  radial-gradient(circle at 60% 20%, #4F6BED, transparent 45%);
      animation: ev-drift 22s ease-in-out infinite alternate;
      top: -20vmax; right: -20vmax;
    }
    @keyframes ev-drift {
      0%   { transform: translate(0, 0) rotate(0deg) scale(1); }
      100% { transform: translate(-16vmax, 24vmax) rotate(50deg) scale(1.18); }
    }
    @keyframes ev-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    .ev-marquee-track { animation: ev-marquee 22s linear infinite; }
    @keyframes ev-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
    .ev-up { animation: ev-up 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
    .ev-card {
      background: #131318; border: 2px solid #26262e;
      box-shadow: 6px 6px 0 #000;
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }
    .ev-card:hover { transform: translate(-2px, -2px); box-shadow: 9px 9px 0 ${ACID}; border-color: ${ACID}; }
    .ev-btn {
      background: ${ACID}; color: #0B0B10; border: 2px solid ${ACID};
      box-shadow: 5px 5px 0 #000; transition: all 0.15s ease;
    }
    .ev-btn:hover:not(:disabled) { transform: translate(-2px, -2px); box-shadow: 7px 7px 0 ${MAGENTA}; }
    .ev-btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
    .ev-input {
      background: #0B0B10; border: 2px solid #2e2e38; color: #F4F4F6;
    }
    .ev-input:focus { outline: none; border-color: ${ACID}; box-shadow: 4px 4px 0 rgba(200,255,46,0.25); }
    .ev-input::placeholder { color: #56565f; }
    .ev-stub-code {
      background: #F4F4F6; color: #0B0B10; border: 2px solid #F4F4F6;
      box-shadow: 5px 5px 0 ${MAGENTA}; transition: all 0.15s ease; display: block;
    }
    .ev-stub-code:hover { transform: translate(-2px, -2px); box-shadow: 7px 7px 0 ${ACID}; }
  `}</style>
)

/** Bandeau marquee « fait main » façon affiche de salle. */
function Marquee() {
  const chunk = Array.from({ length: 10 }, (_, i) => (
    <span key={i} className="ev-mono text-[11px] font-bold tracking-[0.25em] uppercase mx-4" style={{ color: INK }}>
      Rebites Events <span className="mx-2">✦</span>
    </span>
  ))
  return (
    <div className="relative z-10 overflow-hidden py-1.5 border-b-2 border-black" style={{ background: ACID }}>
      <div className="ev-marquee-track flex whitespace-nowrap w-max">{chunk}{chunk}</div>
    </div>
  )
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

  const [openId, setOpenId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [joinLoyalty, setJoinLoyalty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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

  /* ── Écrans d'état ── */
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="ev-bg min-h-screen">
      <BrandStyles />
      <div className="ev-vibe" />
      <Marquee />
      <div className="relative z-10">{children}</div>
    </div>
  )

  if (loading || confirmState === 'verifying') {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <p className="ev-mono text-xs uppercase tracking-[0.3em] animate-pulse" style={{ color: ACID }}>
            {confirmState === 'verifying' ? t('event.verifying') : t('common.loading')}
          </p>
        </div>
      </Shell>
    )
  }

  if (codes) {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md ev-up">
            <p className="ev-mono text-[11px] uppercase tracking-[0.3em] mb-3" style={{ color: ACID }}>✦ {t('event.successTitle')}</p>
            <h1 className="ev-display text-3xl font-black text-white leading-tight mb-2">{t('event.successDesc')}</h1>
            <div className="mt-6 space-y-4">
              {codes.map((c, i) => (
                <a key={c} href={`/${locale}/event/ticket/${c}`} className="ev-stub-code p-4 text-center ev-up" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                  <span className="ev-mono block text-xl font-bold tracking-[0.15em]">{c}</span>
                  <span className="ev-mono block text-[10px] uppercase tracking-[0.25em] mt-1 opacity-60">{t('event.showTicket')}</span>
                </a>
              ))}
            </div>
            <p className="ev-mono text-[11px] text-gray-500 mt-6 uppercase tracking-wider">{t('event.emailSent')}</p>
          </div>
        </div>
      </Shell>
    )
  }

  if (confirmState === 'failed') {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <div className="max-w-sm ev-up">
            <h1 className="ev-display text-2xl font-black text-white mb-3">{t('event.paymentIssue')}</h1>
            <p className="ev-mono text-sm text-gray-400">{t('event.paymentIssueDesc')}</p>
          </div>
        </div>
      </Shell>
    )
  }

  if (unavailable || !business) {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <p className="ev-mono text-sm text-gray-400">{t('event.unavailable')}</p>
        </div>
      </Shell>
    )
  }

  const accent = business.primaryColor && business.primaryColor !== '#ffffff' ? business.primaryColor : MAGENTA

  return (
    <Shell>
      <div className="max-w-lg mx-auto px-4 pb-16">
        {/* Header organisateur — affiche */}
        <header className="pt-10 pb-8 ev-up">
          {business.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={business.logoUrl} alt="" className="max-h-16 max-w-[150px] object-contain mb-4" />
          )}
          <h1 className="ev-display text-4xl sm:text-5xl font-black text-white leading-[0.95] uppercase break-words">
            {business.name}
          </h1>
          <p className="ev-mono text-[11px] uppercase tracking-[0.3em] mt-3" style={{ color: ACID }}>
            {t('event.pageSubtitle')}{business.city ? ` — ${business.city}` : ''}
          </p>
        </header>

        {events.length === 0 && (
          <div className="ev-card p-8 text-center ev-up">
            <p className="ev-mono text-sm text-gray-400">{t('event.noEvents')}</p>
          </div>
        )}

        {/* Affiches événements */}
        <div className="space-y-6">
          {events.map((ev, idx) => {
            const soldOut = ev.remaining !== null && ev.remaining <= 0
            const isOpen = openId === ev.id
            const d = new Date(ev.starts_at)
            const day = d.toLocaleDateString(locale, { day: '2-digit' })
            const month = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '')
            const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            return (
              <article key={ev.id} className="ev-card ev-up" style={{ animationDelay: `${0.08 + idx * 0.07}s` }}>
                <div className="flex">
                  {/* Bloc date — talon gauche */}
                  <div className="flex flex-col items-center justify-center px-4 py-5 border-r-2 border-dashed border-[#2e2e38] min-w-[86px]">
                    <span className="ev-display text-3xl font-black leading-none" style={{ color: ACID }}>{day}</span>
                    <span className="ev-mono text-[11px] uppercase tracking-[0.2em] text-gray-400 mt-1">{month}</span>
                    <span className="ev-mono text-[11px] text-gray-500 mt-2">{time}</span>
                  </div>

                  <div className="flex-1 p-5 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="ev-display text-xl font-bold text-white leading-tight break-words">{ev.title}</h2>
                      <span
                        className="ev-mono flex-shrink-0 text-xs font-bold px-2.5 py-1 border-2"
                        style={ev.price > 0
                          ? { color: INK, background: ACID, borderColor: ACID }
                          : { color: ACID, borderColor: ACID }}
                      >
                        {ev.price > 0 ? `${ev.price} €` : t('event.free').toUpperCase()}
                      </span>
                    </div>
                    {ev.location && (
                      <p className="ev-mono text-[11px] uppercase tracking-[0.15em] text-gray-500 mt-1.5">📍 {ev.location}</p>
                    )}
                    {ev.description && (
                      <p className="text-sm text-gray-400 mt-2 whitespace-pre-line leading-relaxed">{ev.description}</p>
                    )}
                    {ev.remaining !== null && !soldOut && ev.remaining <= 5 && (
                      <p className="ev-mono text-[11px] font-bold uppercase tracking-[0.15em] mt-2" style={{ color: MAGENTA }}>
                        ⚡ {t('event.fewLeft', { count: ev.remaining })}
                      </p>
                    )}

                    {soldOut ? (
                      <p className="ev-mono mt-4 text-sm font-bold uppercase tracking-[0.2em] text-gray-600 line-through">
                        {t('event.soldOut')}
                      </p>
                    ) : !isOpen ? (
                      <button
                        onClick={() => { setOpenId(ev.id); setError(''); setQuantity(1); setJoinLoyalty(false) }}
                        className="ev-btn ev-mono mt-4 w-full py-3 text-sm font-bold uppercase tracking-[0.15em]"
                      >
                        {ev.price > 0 ? t('event.buyBtn') : t('event.reserveBtn')} →
                      </button>
                    ) : (
                      <form onSubmit={e => submit(e, ev)} className="mt-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="ev-mono text-[11px] uppercase tracking-[0.15em] text-gray-400">{t('event.quantity')}</label>
                          <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5, 6]
                              .filter(n => ev.remaining === null || n <= ev.remaining)
                              .map(n => (
                                <button
                                  key={n} type="button"
                                  onClick={() => setQuantity(n)}
                                  className="ev-mono w-8 h-8 text-xs font-bold border-2 transition-colors"
                                  style={quantity === n
                                    ? { background: ACID, color: INK, borderColor: ACID }
                                    : { color: '#9a9aa4', borderColor: '#2e2e38' }}
                                >
                                  {n}
                                </button>
                              ))}
                          </div>
                        </div>
                        <input required value={buyerName} onChange={e => setBuyerName(e.target.value)} maxLength={100}
                          placeholder={t('event.buyerName')} className="ev-input w-full px-3 py-3 text-sm" />
                        <input required type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} maxLength={255}
                          placeholder={t('event.buyerEmail')} className="ev-input w-full px-3 py-3 text-sm" />
                        {ev.offer_loyalty && (
                          <label className="flex items-start gap-2 text-xs text-gray-400">
                            <input type="checkbox" checked={joinLoyalty} onChange={e => setJoinLoyalty(e.target.checked)}
                              className="mt-0.5 accent-[#C8FF2E]" />
                            {t('event.joinLoyalty', { business: business.name })}
                          </label>
                        )}
                        {error && (
                          <p className="ev-mono text-xs px-3 py-2 border-2" style={{ color: MAGENTA, borderColor: MAGENTA }}>{error}</p>
                        )}
                        <button
                          type="submit" disabled={submitting}
                          className="ev-btn ev-mono w-full py-3.5 text-sm font-bold uppercase tracking-[0.15em] disabled:opacity-50"
                        >
                          {submitting ? '…' : ev.price > 0
                            ? t('event.payBtn', { amount: (ev.price * quantity).toFixed(2).replace(/\.00$/, '') })
                            : t('event.confirmFreeBtn')}
                        </button>
                        {ev.price > 0 && (
                          <p className="ev-mono text-[10px] uppercase tracking-[0.2em] text-gray-600 text-center">{t('event.securePayment')}</p>
                        )}
                      </form>
                    )}
                  </div>
                </div>
                {/* liseré organisateur */}
                <div className="h-1" style={{ background: accent }} />
              </article>
            )
          })}
        </div>

        <footer className="mt-14 text-center ev-up" style={{ animationDelay: '0.4s' }}>
          <p className="ev-mono text-[10px] uppercase tracking-[0.3em] text-gray-600">
            {business.name} ✦ {t('event.poweredBy')}{' '}
            <a href="https://rebites.be" className="underline" style={{ color: ACID }}>Rebites Events</a>
          </p>
        </footer>
      </div>
    </Shell>
  )
}

export default function EventPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#0B0B10' }} />}>
      <EventContent />
    </Suspense>
  )
}
