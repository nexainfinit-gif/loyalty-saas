'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { useTranslation } from '@/lib/i18n'
import { resolveEventTheme } from '@/lib/event-themes'

/**
 * Billet d'événement — /[locale]/event/ticket/[code].
 * Talon de billet (encoches, perforation, QR, code-barres) habillé selon le
 * thème de l'organisateur (nuit / corporate / musée — lib/event-themes.ts).
 */
interface Ticket {
  code: string
  buyerName: string
  status: 'valid' | 'checked_in'
  theme?: string
  event: { title: string; location: string | null; startsAt: string }
  business: { name: string; primaryColor: string | null; logoUrl: string | null }
}

export default function TicketPage() {
  const { t, locale } = useTranslation()
  const params = useParams()
  const code = params.code as string

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/event/ticket/${code}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setTicket)
      .catch(() => setNotFound(true))
  }, [code])

  const T = resolveEventTheme(ticket?.theme)

  const styles = (
    <style>{`
      @import url('${T.fontImport}');
      body { background: ${T.bg}; }
      .tk-display {
        font-family: ${T.display};
        font-weight: ${T.displayWeight};
        ${T.displayItalic ? 'font-style: italic;' : ''}
        ${T.displayUppercase ? 'text-transform: uppercase;' : ''}
        ${T.displayTracking ? `letter-spacing: ${T.displayTracking};` : ''}
      }
      .tk-mono { font-family: ${T.labelFamily}; }
      .tk-bg { background: ${T.bg}; position: relative; }
      ${T.grain ? `
      .tk-bg::before {
        content: ''; position: fixed; inset: 0; pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
        opacity: 0.05;
      }` : ''}
      ${T.vibe ? `
      .tk-vibe {
        position: fixed; inset: 0; pointer-events: none; opacity: 0.25;
        background: ${T.vibe};
        filter: blur(70px);
        animation: tk-pulse 9s ease-in-out infinite alternate;
      }
      @keyframes tk-pulse { from { opacity: 0.18; } to { opacity: 0.32; } }` : '.tk-vibe { display: none; }'}
      @keyframes tk-in { from { opacity: 0; transform: translateY(22px) rotate(-1deg); } to { opacity: 1; transform: translateY(0) rotate(0); } }
      .tk-stub { animation: tk-in 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
      .tk-notch-row { position: relative; }
      .tk-notch-row::before, .tk-notch-row::after {
        content: ''; position: absolute; top: 50%; width: 26px; height: 26px;
        border-radius: 50%; background: ${T.bg}; transform: translateY(-50%);
        border: ${T.dark ? '2px' : '1px'} solid ${T.dark ? '#26262e' : T.border};
      }
      .tk-notch-row::before { left: -15px; }
      .tk-notch-row::after { right: -15px; }
      .tk-barcode {
        /* Le talon est toujours papier clair → barres toujours sombres. */
        height: 34px;
        background: repeating-linear-gradient(90deg,
          #1C1917 0 2px, transparent 2px 5px,
          #1C1917 5px 9px, transparent 9px 11px,
          #1C1917 11px 12px, transparent 12px 16px);
      }
    `}</style>
  )

  if (notFound) {
    return (
      <div className="tk-bg min-h-screen flex items-center justify-center p-4">
        {styles}
        <p className="tk-mono text-sm relative" style={{ color: T.muted }}>{t('event.ticketNotFound')}</p>
      </div>
    )
  }
  // Chargement : loader NEUTRE (le thème du billet n'est pas encore connu →
  // ne jamais laisser apparaître le thème « nuit » par défaut).
  if (!ticket) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <style>{`@keyframes tk-neutral-spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #ececec', borderTopColor: '#111', animation: 'tk-neutral-spin 0.7s linear infinite' }} />
      </div>
    )
  }

  const d = new Date(ticket.event.startsAt)
  const when = d.toLocaleString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const accent = ticket.business.primaryColor && ticket.business.primaryColor !== '#ffffff'
    ? ticket.business.primaryColor : T.accent2
  // En-tête clair (ex. carton crème « musée ») : encre sombre + filets sombres.
  const headerInk = T.headerInk ?? '#FFFFFF'
  const headerSub = T.headerInk ? `${T.headerInk}A6` : 'rgba(255,255,255,0.65)'
  const perfo = T.headerInk ? 'rgba(28,25,23,0.25)' : 'rgba(255,255,255,0.25)'

  return (
    <div className="tk-bg min-h-screen flex items-center justify-center p-5">
      {styles}
      <div className="tk-vibe" />

      <div
        className="tk-stub relative w-full max-w-sm"
        style={{ filter: T.dark ? 'drop-shadow(8px 8px 0 rgba(200,255,46,0.9))' : 'drop-shadow(0 18px 40px rgba(28,25,23,0.18))' }}
      >
        <div className="overflow-hidden" style={{ background: '#FDFDFB', border: `${T.dark ? '2px' : '1px'} solid ${T.dark ? '#26262e' : T.border}`, borderRadius: T.radius }}>

          {/* En-tête affiche (ou carton d'invitation si en-tête clair) */}
          <div className="p-6 pb-5" style={{ background: T.headerBg }}>
            <p className="tk-mono text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: T.headerInk ? T.accent : (T.dark ? T.accent : T.accent2) }}>
              ✦ Rebites Events
            </p>
            <h1 className="tk-display text-2xl leading-tight break-words" style={{ color: headerInk }}>
              {ticket.event.title}
            </h1>
            <p className="tk-mono text-[11px] uppercase tracking-[0.15em] mt-2" style={{ color: headerSub }}>
              {when}{ticket.event.location ? ` — ${ticket.event.location}` : ''}
            </p>
            <p className="tk-mono text-[11px] uppercase tracking-[0.15em] mt-1" style={{ color: accent }}>
              {ticket.business.name}
            </p>
          </div>

          {/* Perforation + encoches */}
          <div className="tk-notch-row" style={{ background: T.headerBg }}>
            <div className="border-t-2 border-dashed mx-5" style={{ borderColor: perfo }} />
          </div>

          {/* Corps du billet — QR */}
          <div className="p-6 text-center">
            <div className="inline-block p-3 bg-white" style={{ border: `2px solid ${T.ink}` }}>
              <QRCode value={ticket.code} size={180} />
            </div>
            <p className="tk-mono text-lg font-bold tracking-[0.14em] mt-4" style={{ color: '#1C1917' }}>
              {ticket.code}
            </p>
            <p className="tk-mono text-[11px] uppercase tracking-[0.2em] mt-1" style={{ color: '#78716C' }}>
              {ticket.buyerName}
            </p>

            {ticket.status === 'checked_in' ? (
              <p className="tk-mono inline-block mt-4 text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1.5"
                style={{ color: T.accent2, border: `2px solid ${T.accent2}`, borderRadius: T.radius }}>
                ✕ {t('event.alreadyCheckedIn')}
              </p>
            ) : (
              <p className="tk-mono mt-4 text-[11px] uppercase tracking-[0.2em]" style={{ color: '#78716C' }}>
                ↓ {t('event.showAtEntrance')} ↓
              </p>
            )}
          </div>

          {/* Pied code-barres décoratif */}
          <div className="px-6 pb-5">
            <div className="tk-barcode" style={{ opacity: 0.9 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
