'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'react-qr-code'
import { useTranslation } from '@/lib/i18n'

/**
 * Billet d'événement — /[locale]/event/ticket/[code].
 * Affiche le QR (contenu = code du billet) à présenter à l'entrée.
 * Lien envoyé par email à l'achat ; le code est le secret.
 */
interface Ticket {
  code: string
  buyerName: string
  status: 'valid' | 'checked_in'
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

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">{t('event.ticketNotFound')}</p>
      </div>
    )
  }
  if (!ticket) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-ds-spin" />
      </div>
    )
  }

  const color = ticket.business.primaryColor ?? '#111827'
  const when = new Date(ticket.event.startsAt).toLocaleString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: color }}>
      <div className="bg-white rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.25)] max-w-sm w-full overflow-hidden">
        {/* En-tête événement */}
        <div className="p-6 text-center border-b-2 border-dashed border-gray-200">
          {ticket.business.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={ticket.business.logoUrl} alt="" className="mx-auto mb-3 max-h-14 max-w-[140px] object-contain" />
          )}
          <p className="text-[11px] uppercase tracking-widest text-gray-400">{ticket.business.name}</p>
          <h1 className="text-lg font-bold text-gray-900 mt-1">{ticket.event.title}</h1>
          <p className="text-xs text-gray-500 mt-1">{when}{ticket.event.location ? ` · ${ticket.event.location}` : ''}</p>
        </div>

        {/* QR */}
        <div className="p-6 text-center">
          <div className="bg-white inline-block p-3 rounded-xl border border-gray-100">
            <QRCode value={ticket.code} size={190} />
          </div>
          <p className="font-mono text-base font-bold tracking-[0.12em] text-gray-900 mt-3">{ticket.code}</p>
          <p className="text-xs text-gray-500 mt-1">{ticket.buyerName}</p>

          {ticket.status === 'checked_in' ? (
            <p className="mt-3 inline-block text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-3 py-1">
              {t('event.alreadyCheckedIn')}
            </p>
          ) : (
            <p className="mt-3 text-xs text-gray-400">{t('event.showAtEntrance')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
