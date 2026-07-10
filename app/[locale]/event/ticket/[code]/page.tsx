'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { useTranslation } from '@/lib/i18n'

/**
 * Billet d'événement — /[locale]/event/ticket/[code].
 * Identité « Rebites Events » : talon de billet néo-brutaliste sur fond noir
 * grain — encoches latérales, perforation, QR sur bloc blanc, code-barres
 * décoratif. Le QR (contenu = code) se présente à l'entrée.
 */
interface Ticket {
  code: string
  buyerName: string
  status: 'valid' | 'checked_in'
  event: { title: string; location: string | null; startsAt: string }
  business: { name: string; primaryColor: string | null; logoUrl: string | null }
}

const ACID = '#C8FF2E'
const MAGENTA = '#FF3EA5'
const INK = '#0B0B10'

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

  const styles = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&display=swap');
      .tk-display { font-family: 'Unbounded', system-ui, sans-serif; }
      .tk-mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
      body { background: ${INK}; }
      .tk-bg { background: ${INK}; position: relative; }
      .tk-bg::before {
        content: ''; position: fixed; inset: 0; pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
        opacity: 0.05;
      }
      .tk-vibe {
        position: fixed; inset: 0; pointer-events: none; opacity: 0.25;
        background: radial-gradient(50vmax 50vmax at 85% 10%, ${ACID}, transparent 60%),
                    radial-gradient(45vmax 45vmax at 10% 90%, ${MAGENTA}, transparent 60%);
        filter: blur(70px);
        animation: tk-pulse 9s ease-in-out infinite alternate;
      }
      @keyframes tk-pulse { from { opacity: 0.18; } to { opacity: 0.32; } }
      @keyframes tk-in { from { opacity: 0; transform: translateY(22px) rotate(-1deg); } to { opacity: 1; transform: translateY(0) rotate(0); } }
      .tk-stub { animation: tk-in 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
      /* Encoches latérales du talon (au niveau de la perforation) */
      .tk-notch-row { position: relative; }
      .tk-notch-row::before, .tk-notch-row::after {
        content: ''; position: absolute; top: 50%; width: 26px; height: 26px;
        border-radius: 50%; background: ${INK}; transform: translateY(-50%);
        border: 2px solid #26262e;
      }
      .tk-notch-row::before { left: -15px; }
      .tk-notch-row::after { right: -15px; }
      /* Code-barres décoratif */
      .tk-barcode {
        height: 34px;
        background: repeating-linear-gradient(90deg,
          #0B0B10 0 2px, transparent 2px 5px,
          #0B0B10 5px 9px, transparent 9px 11px,
          #0B0B10 11px 12px, transparent 12px 16px);
      }
    `}</style>
  )

  if (notFound) {
    return (
      <div className="tk-bg min-h-screen flex items-center justify-center p-4">
        {styles}
        <p className="tk-mono text-sm text-gray-400 relative">{t('event.ticketNotFound')}</p>
      </div>
    )
  }
  if (!ticket) {
    return (
      <div className="tk-bg min-h-screen flex items-center justify-center">
        {styles}
        <p className="tk-mono text-xs uppercase tracking-[0.3em] animate-pulse relative" style={{ color: ACID }}>···</p>
      </div>
    )
  }

  const d = new Date(ticket.event.startsAt)
  const when = d.toLocaleString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const accent = ticket.business.primaryColor && ticket.business.primaryColor !== '#ffffff'
    ? ticket.business.primaryColor : MAGENTA

  return (
    <div className="tk-bg min-h-screen flex items-center justify-center p-5">
      {styles}
      <div className="tk-vibe" />

      <div className="tk-stub relative w-full max-w-sm" style={{ filter: 'drop-shadow(8px 8px 0 rgba(200,255,46,0.9))' }}>
        <div className="border-2 border-[#26262e] overflow-hidden" style={{ background: '#F4F4F6' }}>

          {/* En-tête affiche */}
          <div className="p-6 pb-5" style={{ background: INK }}>
            <p className="tk-mono text-[10px] uppercase tracking-[0.3em] mb-3" style={{ color: ACID }}>
              ✦ Rebites Events
            </p>
            <h1 className="tk-display text-2xl font-black text-white leading-tight uppercase break-words">
              {ticket.event.title}
            </h1>
            <p className="tk-mono text-[11px] uppercase tracking-[0.15em] text-gray-400 mt-2">
              {when}{ticket.event.location ? ` — ${ticket.event.location}` : ''}
            </p>
            <p className="tk-mono text-[11px] uppercase tracking-[0.15em] mt-1" style={{ color: accent }}>
              {ticket.business.name}
            </p>
          </div>

          {/* Perforation + encoches */}
          <div className="tk-notch-row" style={{ background: INK }}>
            <div className="border-t-2 border-dashed border-[#3a3a44] mx-5" />
          </div>

          {/* Corps du billet — QR */}
          <div className="p-6 text-center">
            <div className="inline-block p-3 bg-white border-2 border-black">
              <QRCode value={ticket.code} size={180} />
            </div>
            <p className="tk-mono text-lg font-bold tracking-[0.14em] mt-4" style={{ color: INK }}>
              {ticket.code}
            </p>
            <p className="tk-mono text-[11px] uppercase tracking-[0.2em] text-gray-500 mt-1">
              {ticket.buyerName}
            </p>

            {ticket.status === 'checked_in' ? (
              <p className="tk-mono inline-block mt-4 text-[11px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 border-2"
                style={{ color: MAGENTA, borderColor: MAGENTA }}>
                ✕ {t('event.alreadyCheckedIn')}
              </p>
            ) : (
              <p className="tk-mono mt-4 text-[11px] uppercase tracking-[0.2em] text-gray-500">
                ↓ {t('event.showAtEntrance')} ↓
              </p>
            )}
          </div>

          {/* Pied code-barres décoratif */}
          <div className="px-6 pb-5">
            <div className="tk-barcode" />
          </div>
        </div>
      </div>
    </div>
  )
}
