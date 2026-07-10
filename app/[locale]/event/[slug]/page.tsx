'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { resolveEventTheme, type EventTheme } from '@/lib/event-themes'

/**
 * Page publique billetterie — /[locale]/event/[slug].
 * Le thème appartient à L'ÉVÉNEMENT (nuit / corporate / musée) : la coquille
 * de page suit le prochain événement, et chaque carte porte son propre
 * habillage (tokens dans lib/event-themes.ts).
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
  theme?: string
}

/** Classes CSS d'un thème, suffixées par sa clé (plusieurs thèmes peuvent
 *  cohabiter sur la même page — un par carte d'événement). */
function themeCss(T: EventTheme): string {
  const k = T.key
  return `
    .ev-display-${k} {
      font-family: ${T.display};
      font-weight: ${T.displayWeight};
      ${T.displayItalic ? 'font-style: italic;' : ''}
      ${T.displayUppercase ? 'text-transform: uppercase;' : ''}
      ${T.displayTracking ? `letter-spacing: ${T.displayTracking};` : ''}
    }
    .ev-card-${k} {
      background: ${T.surface}; border: ${T.dark ? '2px' : '1px'} solid ${T.border};
      border-radius: ${T.radius};
      box-shadow: ${T.shadow};
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }
    .ev-card-${k}:hover {
      ${T.dark ? `transform: translate(-2px, -2px); border-color: ${T.accent};` : 'transform: translateY(-2px);'}
      box-shadow: ${T.shadowHover};
    }
    .ev-btn-${k} {
      background: ${T.accent}; color: ${T.accentInk};
      border: ${T.dark ? `2px solid ${T.accent}` : '1px solid transparent'};
      border-radius: ${T.radius};
      ${T.dark ? 'box-shadow: 5px 5px 0 #000;' : ''}
      transition: all 0.15s ease;
    }
    .ev-btn-${k}:hover:not(:disabled) {
      ${T.dark
        ? `transform: translate(-2px, -2px); box-shadow: 7px 7px 0 ${T.accent2};`
        : `filter: brightness(1.12); box-shadow: ${T.shadowHover};`}
    }
    .ev-btn-${k}:active:not(:disabled) { ${T.dark ? 'transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000;' : 'transform: translateY(1px);'} }
    .ev-input-${k} {
      background: ${T.dark ? T.bg : T.surface};
      border: ${T.dark ? '2px' : '1px'} solid ${T.dark ? '#2e2e38' : T.border};
      color: ${T.ink}; border-radius: ${T.radius};
    }
    .ev-input-${k}:focus { outline: none; border-color: ${T.accent}; ${T.dark ? 'box-shadow: 4px 4px 0 rgba(200,255,46,0.25);' : `box-shadow: 0 0 0 3px ${T.accent}22;`} }
    .ev-input-${k}::placeholder { color: ${T.faint}; }
  `
}

/** Styles de la page : coquille (thème principal) + classes de chaque thème utilisé. */
function PageStyles({ shell, used }: { shell: EventTheme; used: EventTheme[] }) {
  const imports = [...new Set(used.map(u => u.fontImport))].map(u => `@import url('${u}');`).join('\n')
  return (
    <style>{`
      ${imports}
      body { background: ${shell.bg}; }
      .ev-mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
      .ev-bg { background: ${shell.bg}; position: relative; overflow-x: hidden; }
      ${shell.grain ? `
      .ev-bg::before {
        content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
        opacity: 0.05;
      }` : ''}
      ${shell.vibe ? `
      .ev-vibe {
        position: fixed; width: 60vmax; height: 60vmax; border-radius: 50%;
        filter: blur(90px); opacity: 0.32; z-index: 0; pointer-events: none;
        background: ${shell.vibe};
        animation: ev-drift 22s ease-in-out infinite alternate;
        top: -20vmax; right: -20vmax;
      }
      @keyframes ev-drift {
        0%   { transform: translate(0, 0) rotate(0deg) scale(1); }
        100% { transform: translate(-16vmax, 24vmax) rotate(50deg) scale(1.18); }
      }` : '.ev-vibe { display: none; }'}
      @keyframes ev-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .ev-marquee-track { animation: ev-marquee 22s linear infinite; }
      @keyframes ev-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
      .ev-up { animation: ev-up 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
      .ev-stub-code {
        background: ${shell.dark ? '#F4F4F6' : shell.headerBg};
        color: ${shell.dark ? '#0B0B10' : '#FFFFFF'};
        border-radius: ${shell.radius};
        ${shell.dark ? `border: 2px solid #F4F4F6; box-shadow: 5px 5px 0 ${shell.accent2};` : `box-shadow: ${shell.shadow};`}
        transition: all 0.15s ease; display: block;
      }
      .ev-stub-code:hover { ${shell.dark ? `transform: translate(-2px, -2px); box-shadow: 7px 7px 0 ${shell.accent};` : `box-shadow: ${shell.shadowHover}; transform: translateY(-2px);`} }
      ${used.map(themeCss).join('\n')}
    `}</style>
  )
}

/** Bandeau marquee (nuit) ou filet éditorial (thèmes clairs). */
function TopBand({ T }: { T: EventTheme }) {
  if (!T.marquee) {
    return <div className="relative z-10 h-1.5" style={{ background: `linear-gradient(90deg, ${T.accent}, ${T.accent2})` }} />
  }
  const chunk = Array.from({ length: 10 }, (_, i) => (
    <span key={i} className="ev-mono text-[11px] font-bold tracking-[0.25em] uppercase mx-4" style={{ color: T.accentInk }}>
      Rebites Events <span className="mx-2">✦</span>
    </span>
  ))
  return (
    <div className="relative z-10 overflow-hidden py-1.5 border-b-2 border-black" style={{ background: T.accent }}>
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
  const [themeKey, setThemeKey] = useState<string>('nuit')
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
      .then(j => {
        setBusiness({ name: j.name, city: j.city, primaryColor: j.primaryColor, logoUrl: j.logoUrl })
        setEvents(j.events)
        setThemeKey(j.theme)
      })
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

  const T = resolveEventTheme(themeKey)
  const usedThemes = [...new Map([T, ...events.map(e => resolveEventTheme(e.theme))].map(x => [x.key, x])).values()]

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="ev-bg min-h-screen">
      <PageStyles shell={T} used={usedThemes} />
      <div className="ev-vibe" />
      <TopBand T={T} />
      <div className="relative z-10">{children}</div>
    </div>
  )

  if (loading || confirmState === 'verifying') {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <p className="ev-mono text-xs uppercase tracking-[0.3em] animate-pulse" style={{ color: T.accent }}>
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
            <p className="ev-mono text-[11px] uppercase tracking-[0.3em] mb-3" style={{ color: T.accent }}>✦ {t('event.successTitle')}</p>
            <h1 className={`ev-display-${T.key} text-3xl leading-tight mb-2`} style={{ color: T.ink }}>{t('event.successDesc')}</h1>
            <div className="mt-6 space-y-4">
              {codes.map((c, i) => (
                <a key={c} href={`/${locale}/event/ticket/${c}`} className="ev-stub-code p-4 text-center ev-up" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                  <span className="ev-mono block text-xl font-bold tracking-[0.15em]">{c}</span>
                  <span className="ev-mono block text-[10px] uppercase tracking-[0.25em] mt-1 opacity-60">{t('event.showTicket')}</span>
                </a>
              ))}
            </div>
            <p className="ev-mono text-[11px] mt-6 uppercase tracking-wider" style={{ color: T.muted }}>{t('event.emailSent')}</p>
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
            <h1 className={`ev-display-${T.key} text-2xl mb-3`} style={{ color: T.ink }}>{t('event.paymentIssue')}</h1>
            <p className="ev-mono text-sm" style={{ color: T.muted }}>{t('event.paymentIssueDesc')}</p>
          </div>
        </div>
      </Shell>
    )
  }

  if (unavailable || !business) {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <p className="ev-mono text-sm" style={{ color: T.muted }}>{t('event.unavailable')}</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="max-w-lg mx-auto px-4 pb-16">
        {/* Header organisateur */}
        <header className="pt-10 pb-8 ev-up">
          {business.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={business.logoUrl} alt="" className="max-h-16 max-w-[150px] object-contain mb-4" />
          )}
          <h1 className={`ev-display-${T.key} text-4xl sm:text-5xl leading-[1.02] break-words`} style={{ color: T.ink }}>
            {business.name}
          </h1>
          <p className="ev-mono text-[11px] uppercase tracking-[0.3em] mt-3" style={{ color: T.accent }}>
            {t('event.pageSubtitle')}{business.city ? ` — ${business.city}` : ''}
          </p>
        </header>

        {events.length === 0 && (
          <div className={`ev-card-${T.key} p-8 text-center ev-up`}>
            <p className="ev-mono text-sm" style={{ color: T.muted }}>{t('event.noEvents')}</p>
          </div>
        )}

        <div className="space-y-6">
          {events.map((ev, idx) => {
            // Chaque événement porte SON thème (concert ≠ séminaire ≠ expo).
            const C = resolveEventTheme(ev.theme)
            const soldOut = ev.remaining !== null && ev.remaining <= 0
            const isOpen = openId === ev.id
            const d = new Date(ev.starts_at)
            const day = d.toLocaleDateString(locale, { day: '2-digit' })
            const month = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '')
            const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            const accent = business.primaryColor && business.primaryColor !== '#ffffff' ? business.primaryColor : C.accent2
            return (
              <article key={ev.id} className={`ev-card-${C.key} ev-up overflow-hidden`} style={{ animationDelay: `${0.08 + idx * 0.07}s` }}>
                <div className="flex">
                  {/* Bloc date — talon gauche */}
                  <div className="flex flex-col items-center justify-center px-4 py-5 border-r border-dashed min-w-[86px]" style={{ borderColor: C.border }}>
                    <span className={`ev-display-${C.key} text-3xl leading-none`} style={{ color: C.accent }}>{day}</span>
                    <span className="ev-mono text-[11px] uppercase tracking-[0.2em] mt-1" style={{ color: C.muted }}>{month}</span>
                    <span className="ev-mono text-[11px] mt-2" style={{ color: C.faint }}>{time}</span>
                  </div>

                  <div className="flex-1 p-5 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className={`ev-display-${C.key} text-xl leading-tight break-words`} style={{ color: C.ink }}>{ev.title}</h2>
                      <span
                        className="ev-mono flex-shrink-0 text-xs font-bold px-2.5 py-1"
                        style={ev.price > 0
                          ? { color: C.accentInk, background: C.accent, borderRadius: C.radius }
                          : { color: C.accent, border: `1.5px solid ${C.accent}`, borderRadius: C.radius }}
                      >
                        {ev.price > 0 ? `${ev.price} €` : t('event.free').toUpperCase()}
                      </span>
                    </div>
                    {ev.location && (
                      <p className="ev-mono text-[11px] uppercase tracking-[0.15em] mt-1.5" style={{ color: C.faint }}>📍 {ev.location}</p>
                    )}
                    {ev.description && (
                      <p className="text-sm mt-2 whitespace-pre-line leading-relaxed" style={{ color: C.muted }}>{ev.description}</p>
                    )}
                    {ev.remaining !== null && !soldOut && ev.remaining <= 5 && (
                      <p className="ev-mono text-[11px] font-bold uppercase tracking-[0.15em] mt-2" style={{ color: C.accent2 }}>
                        ⚡ {t('event.fewLeft', { count: ev.remaining })}
                      </p>
                    )}

                    {soldOut ? (
                      <p className="ev-mono mt-4 text-sm font-bold uppercase tracking-[0.2em] line-through" style={{ color: C.faint }}>
                        {t('event.soldOut')}
                      </p>
                    ) : !isOpen ? (
                      <button
                        onClick={() => { setOpenId(ev.id); setError(''); setQuantity(1); setJoinLoyalty(false) }}
                        className={`ev-btn-${C.key} ev-mono mt-4 w-full py-3 text-sm font-bold uppercase tracking-[0.15em]`}
                      >
                        {ev.price > 0 ? t('event.buyBtn') : t('event.reserveBtn')} →
                      </button>
                    ) : (
                      <form onSubmit={e => submit(e, ev)} className="mt-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="ev-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: C.muted }}>{t('event.quantity')}</label>
                          <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5, 6]
                              .filter(n => ev.remaining === null || n <= ev.remaining)
                              .map(n => (
                                <button
                                  key={n} type="button"
                                  onClick={() => setQuantity(n)}
                                  className="ev-mono w-8 h-8 text-xs font-bold transition-colors"
                                  style={quantity === n
                                    ? { background: C.accent, color: C.accentInk, border: `2px solid ${C.accent}`, borderRadius: C.radius }
                                    : { color: C.muted, border: `2px solid ${C.border}`, borderRadius: C.radius }}
                                >
                                  {n}
                                </button>
                              ))}
                          </div>
                        </div>
                        <input required value={buyerName} onChange={e => setBuyerName(e.target.value)} maxLength={100}
                          placeholder={t('event.buyerName')} className={`ev-input-${C.key} w-full px-3 py-3 text-sm`} />
                        <input required type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} maxLength={255}
                          placeholder={t('event.buyerEmail')} className={`ev-input-${C.key} w-full px-3 py-3 text-sm`} />
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
                          {submitting ? '…' : ev.price > 0
                            ? t('event.payBtn', { amount: (ev.price * quantity).toFixed(2).replace(/\.00$/, '') })
                            : t('event.confirmFreeBtn')}
                        </button>
                        {ev.price > 0 && (
                          <p className="ev-mono text-[10px] uppercase tracking-[0.2em] text-center" style={{ color: C.faint }}>{t('event.securePayment')}</p>
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
          <p className="ev-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: T.faint }}>
            {business.name} ✦ {t('event.poweredBy')}{' '}
            <a href="https://rebites.be" className="underline" style={{ color: T.accent }}>Rebites Events</a>
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
