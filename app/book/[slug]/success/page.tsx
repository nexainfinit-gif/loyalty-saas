'use client'

import { Suspense } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import { Check, Calendar, Clock, Euro, User, ArrowRight } from 'lucide-react'
import Link from 'next/link'

function SuccessContent() {
  const params = useParams()
  const slug = params.slug as string
  const sp = useSearchParams()

  const serviceName = sp.get('service') ?? ''
  const staffName = sp.get('staff') ?? ''
  const date = sp.get('date') ?? ''
  const startTime = sp.get('start') ?? ''
  const endTime = sp.get('end') ?? ''
  const price = sp.get('price') ?? ''
  const duration = sp.get('duration') ?? ''
  const businessName = sp.get('business') ?? ''
  const message = sp.get('message')

  // Build display date (e.g. "Samedi 15 mars 2026")
  const displayDate = (() => {
    if (!date) return ''
    const [y, m, d] = date.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    return `${dayNames[dateObj.getDay()]} ${d} ${monthNames[m - 1]} ${y}`
  })()

  // Google Calendar link
  const gcalUrl = (() => {
    if (!date || !startTime || !endTime) return null
    const gcalStart = `${date.replace(/-/g, '')}T${startTime.replace(':', '')}00`
    const gcalEnd = `${date.replace(/-/g, '')}T${endTime.replace(':', '')}00`
    return `https://calendar.google.com/calendar/render?action=TEMPLATE`
      + `&text=${encodeURIComponent(`${serviceName} — ${businessName}`)}`
      + `&dates=${gcalStart}/${gcalEnd}`
      + `&details=${encodeURIComponent(`Service : ${serviceName}\nAvec : ${staffName}\nDurée : ${duration} min\nPrix : ${price}€`)}`
      + `&location=${encodeURIComponent(businessName)}`
  })()

  // If no data in search params, show a fallback
  if (!serviceName) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <Check size={28} className="text-green-600" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Rendez-vous confirmé</h1>
          <p className="text-sm text-gray-500 mb-6">
            Vous recevrez un email de confirmation avec les détails.
          </p>
          <Link
            href={`/book/${slug}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Prendre un autre rendez-vous
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <p className="text-sm font-semibold">{businessName}</p>
          <p className="text-xs text-gray-400">
            Propulsé par <span className="font-semibold text-gray-500">Rebites</span>
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Success icon */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={28} className="text-green-600" />
          </div>
          <h1 className="text-xl font-semibold mb-1">Rendez-vous confirmé !</h1>
          <p className="text-sm text-gray-500">
            Un email de confirmation a été envoyé à votre adresse.
          </p>
        </div>

        {/* Booking summary card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-base font-semibold">{serviceName}</p>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                <User size={15} className="text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Professionnel</p>
                <p className="text-sm font-medium">{staffName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                <Calendar size={15} className="text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="text-sm font-medium">{displayDate}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                <Clock size={15} className="text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Heure</p>
                <p className="text-sm font-medium">{startTime} — {endTime} ({duration} min)</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                <Euro size={15} className="text-gray-400" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Prix</p>
                <p className="text-sm font-medium">{price}&euro;</p>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmation message */}
        {message && (
          <div className="bg-green-50 rounded-xl border border-green-100 px-4 py-3 mb-4">
            <p className="text-sm text-green-800">{message}</p>
          </div>
        )}

        {/* Google Calendar button */}
        {gcalUrl && (
          <a
            href={gcalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors mb-3"
          >
            <Calendar size={16} />
            Ajouter à Google Calendar
          </a>
        )}

        {/* Cancellation instructions */}
        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-gray-500">
            <span className="font-semibold">Besoin de modifier ou annuler ?</span><br />
            Contactez directement {businessName} par téléphone ou en répondant à l&apos;email de confirmation.
          </p>
        </div>

        {/* Book another */}
        <div className="text-center">
          <Link
            href={`/book/${slug}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Prendre un autre rendez-vous
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function BookingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  )
}
