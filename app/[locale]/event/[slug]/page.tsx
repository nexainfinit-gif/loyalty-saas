'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { resolveEventTheme } from '@/lib/event-themes'
import { PageStyles, TopBand, NeutralLoader, type PubEvent, type PubBusiness } from './shared'

/**
 * Billetterie d'un organisateur — /[locale]/event/[slug].
 * INDEX à thème unique (celui du prochain événement) : les cartes sont
 * uniformes et renvoient chacune vers la page de l'événement
 * ([eventSlug]) qui, elle, porte SON thème plein cadre. Deux thèmes ne
 * cohabitent jamais sur une même page (décision 2026-07-11).
 * Le retour Stripe (confirmation d'achat) atterrit toujours ici.
 */
function EventContent() {
  const { t, locale } = useTranslation()
  const params = useParams()
  const slug = params.slug as string
  const sp = useSearchParams()

  const [business, setBusiness] = useState<PubBusiness | null>(null)
  const [events, setEvents] = useState<PubEvent[]>([])
  const [themeKey, setThemeKey] = useState<string>('nuit')
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)

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

  const T = resolveEventTheme(themeKey)
  const isCatalog = T.variant === 'catalog'

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="ev-bg min-h-screen">
      <PageStyles shell={T} />
      <div className="ev-vibe" />
      <TopBand T={T} />
      <div className="relative z-10">{children}</div>
    </div>
  )

  // Chargement : loader NEUTRE (sans thème) pour ne jamais laisser
  // apparaître le thème « nuit » par défaut avant le thème réel.
  if (loading) return <NeutralLoader />

  // Vérification du paiement : le thème est désormais connu (fetch résolu).
  if (confirmState === 'verifying') {
    return (
      <Shell>
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <p className="ev-mono text-xs uppercase tracking-[0.3em] animate-pulse" style={{ color: T.accent }}>
            {t('event.verifying')}
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
            /* Plaque : le logo (souvent une photo) vit dans une tuile aux
               couleurs du thème — jamais flottant sur le fond de page. */
            <div className="w-14 h-14 mb-4 flex items-center justify-center overflow-hidden"
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={business.logoUrl} alt="" className="w-full h-full object-cover" />
            </div>
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
            const soldOut = ev.remaining !== null && ev.remaining <= 0
            const d = new Date(ev.starts_at)
            const day = d.toLocaleDateString(locale, { day: '2-digit' })
            const month = d.toLocaleDateString(locale, { month: 'short' }).replace('.', '')
            const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
            const longDate = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

            const hasTiers = ev.tiers.length > 0
            const minPrice = hasTiers ? Math.min(...ev.tiers.map(tr => tr.price)) : ev.price
            const anyPaid = hasTiers ? ev.tiers.some(tr => tr.price > 0) : ev.price > 0
            const priceBadge = hasTiers
              ? (minPrice > 0 ? t('event.fromPrice', { price: minPrice }) : t('event.free').toUpperCase())
              : (ev.price > 0 ? `${ev.price} €` : t('event.free').toUpperCase())
            const badgeFilled = hasTiers ? minPrice > 0 : ev.price > 0
            const href = `/${locale}/event/${slug}/${ev.slug}`

            return (
              <article key={ev.id} className={`ev-card-${T.key} ev-up overflow-hidden`} style={{ animationDelay: `${0.08 + idx * 0.07}s` }}>
                <div className={isCatalog ? '' : 'flex flex-col sm:flex-row'}>
                  {/* Bloc date — bandeau horizontal sur mobile, talon gauche dès sm */}
                  {!isCatalog && (
                  <div
                    className="flex flex-row sm:flex-col items-baseline sm:items-center sm:justify-center gap-2 sm:gap-0 px-5 py-3 sm:px-4 sm:py-5 border-b sm:border-b-0 sm:border-r border-dashed sm:min-w-[86px]"
                    style={{ borderColor: T.border }}
                  >
                    <span className={`ev-display-${T.key} text-2xl sm:text-3xl leading-none`} style={{ color: T.accent }}>{day}</span>
                    <span className="ev-mono text-[11px] uppercase tracking-[0.2em] sm:mt-1" style={{ color: T.muted }}>{month}</span>
                    <span className="ev-mono text-[11px] ml-auto sm:ml-0 sm:mt-2" style={{ color: T.faint }}>{time}</span>
                  </div>
                  )}

                  <div className={`flex-1 min-w-0 ${isCatalog ? 'p-6 sm:p-7' : 'p-5'}`}>
                    {/* Variante « cartel » : № numéroté façon catalogue d'exposition */}
                    {isCatalog && (
                      <div className="flex items-baseline justify-between gap-3 mb-2">
                        <span className="ev-mono text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: T.accent }}>
                          № {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span
                          className="ev-mono flex-shrink-0 text-xs font-bold px-2.5 py-1"
                          style={badgeFilled
                            ? { color: T.accentInk, background: T.accent, borderRadius: T.radius }
                            : { color: T.accent, border: `1.5px solid ${T.accent}`, borderRadius: T.radius }}
                        >
                          {priceBadge}
                        </span>
                      </div>
                    )}

                    <div className={isCatalog ? '' : 'flex items-start justify-between gap-3'}>
                      <h2
                        className={`ev-display-${T.key} ${isCatalog ? 'text-3xl sm:text-4xl' : 'text-xl'} leading-tight break-words`}
                        style={{ color: T.ink }}
                      >
                        {ev.title}
                      </h2>
                      {!isCatalog && (
                      <span
                        className="ev-mono flex-shrink-0 text-xs font-bold px-2.5 py-1"
                        style={badgeFilled
                          ? { color: T.accentInk, background: T.accent, borderRadius: T.radius }
                          : { color: T.accent, border: `1.5px solid ${T.accent}`, borderRadius: T.radius }}
                      >
                        {priceBadge}
                      </span>
                      )}
                    </div>

                    {isCatalog ? (
                      <p className="ev-mono text-[11px] uppercase tracking-[0.22em] mt-3 py-2 border-t border-b"
                        style={{ color: T.muted, borderColor: T.border }}>
                        {longDate} · {time}{ev.location ? ` · ${ev.location}` : ''}
                      </p>
                    ) : ev.location && (
                      <p className="ev-mono text-[11px] uppercase tracking-[0.15em] mt-1.5" style={{ color: T.faint }}>📍 {ev.location}</p>
                    )}
                    {ev.description && (
                      <p className="text-sm mt-2 whitespace-pre-line leading-relaxed line-clamp-2" style={{ color: T.muted }}>{ev.description}</p>
                    )}
                    {ev.remaining !== null && !soldOut && ev.remaining <= 5 && (
                      <p className="ev-mono text-[11px] font-bold uppercase tracking-[0.15em] mt-2" style={{ color: isCatalog ? T.accent : T.accent2 }}>
                        ⚡ {t('event.fewLeft', { count: ev.remaining })}
                      </p>
                    )}

                    {soldOut ? (
                      <p className="ev-mono mt-4 text-sm font-bold uppercase tracking-[0.2em] line-through" style={{ color: T.faint }}>
                        {t('event.soldOut')}
                      </p>
                    ) : (
                      <Link
                        href={href}
                        className={`ev-btn-${T.key} ev-mono block text-center mt-4 w-full py-3 text-sm font-bold uppercase tracking-[0.15em]`}
                      >
                        {anyPaid ? t('event.buyBtn') : t('event.reserveBtn')} →
                      </Link>
                    )}
                  </div>
                </div>
                {/* liseré organisateur */}
                <div className="h-1" style={{ background: business.primaryColor && business.primaryColor !== '#ffffff' ? business.primaryColor : T.accent2 }} />
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
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#ffffff' }} />}>
      <EventContent />
    </Suspense>
  )
}
