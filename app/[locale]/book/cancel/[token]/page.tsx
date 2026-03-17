'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Calendar, Clock, User, Loader2, XCircle, CheckCircle, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { CompactLocaleSwitcher } from '@/components/LocaleSwitcher'
import Link from 'next/link'

interface AppointmentData {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  clientName: string
  notes: string | null
  service: { id: string; name: string; duration_minutes: number; price: number } | null
  staff: { id: string; name: string } | null
}

interface BusinessData {
  name: string
  slug: string
  primaryColor: string | null
}

interface PolicyData {
  allowCancellation: boolean
  cancellationDeadlineHours: number
}

type PageState = 'loading' | 'ready' | 'confirming' | 'cancelled' | 'error'

export default function CancelAppointmentPage() {
  const params = useParams()
  const { t, locale } = useTranslation()
  const token = params.token as string

  const [state, setState] = useState<PageState>('loading')
  const [appointment, setAppointment] = useState<AppointmentData | null>(null)
  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [policy, setPolicy] = useState<PolicyData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Format date for display
  const formatDate = (date: string) => {
    if (!date) return ''
    const [y, m, d] = date.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    return `${dayNames[dateObj.getDay()]} ${d} ${monthNames[m - 1]} ${y}`
  }

  useEffect(() => {
    async function fetchAppointment() {
      try {
        const res = await fetch(`/api/book/cancel/${token}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || t('bookingCancel.notFound'))
          setState('error')
          return
        }
        const data = await res.json()
        setAppointment(data.appointment)
        setBusiness(data.business)
        setPolicy(data.policy)

        // If already cancelled, show that state
        if (data.appointment.status === 'cancelled') {
          setState('cancelled')
        } else {
          setState('ready')
        }
      } catch {
        setError(t('common.networkErrorRetry'))
        setState('error')
      }
    }
    fetchAppointment()
  }, [token, t])

  const handleCancel = async () => {
    setState('confirming')
    try {
      const res = await fetch(`/api/book/cancel/${token}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('bookingCancel.cancelError'))
        setState('error')
        return
      }
      setState('cancelled')
    } catch {
      setError(t('common.networkErrorRetry'))
      setState('error')
    }
  }

  // Loading skeleton
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-surface">
        {business && (
          <header className="bg-white border-b border-gray-200 px-4 py-4">
            <div className="max-w-lg mx-auto flex items-center justify-between">
              <p className="text-sm font-semibold">{business.name}</p>
              <CompactLocaleSwitcher />
            </div>
          </header>
        )}
        <div className="max-w-lg mx-auto px-4 py-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-600" />
            </div>
            <h1 className="text-xl font-semibold mb-2">{t('bookingCancel.errorTitle')}</h1>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
          {business && (
            <div className="text-center">
              <Link
                href={`/${locale}/book/${business.slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                {t('bookingCancel.backToBooking')}
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Cancelled state
  if (state === 'cancelled') {
    return (
      <div className="min-h-screen bg-surface">
        {business && (
          <header className="bg-white border-b border-gray-200 px-4 py-4">
            <div className="max-w-lg mx-auto flex items-center justify-between">
              <p className="text-sm font-semibold">{business.name}</p>
              <CompactLocaleSwitcher />
            </div>
          </header>
        )}
        <div className="max-w-lg mx-auto px-4 py-10">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-green-600" />
            </div>
            <h1 className="text-xl font-semibold mb-2">{t('bookingCancel.cancelledTitle')}</h1>
            <p className="text-sm text-gray-500">{t('bookingCancel.cancelledSubtitle')}</p>
          </div>

          {appointment && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-100">
                <p className="text-base font-semibold">{appointment.service?.name}</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Calendar size={15} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t('bookingSuccess.date')}</p>
                    <p className="text-sm font-medium line-through text-gray-400">{formatDate(appointment.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Clock size={15} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t('bookingSuccess.time')}</p>
                    <p className="text-sm font-medium line-through text-gray-400">{appointment.startTime} — {appointment.endTime}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {business && (
            <div className="text-center">
              <Link
                href={`/${locale}/book/${business.slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                {t('bookingCancel.rebookBtn')}
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Ready state — show appointment details and cancel button
  return (
    <div className="min-h-screen bg-surface">
      {business && (
        <header className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <p className="text-sm font-semibold">{business.name}</p>
            <div className="flex items-center gap-3">
              <CompactLocaleSwitcher />
              <p className="text-xs text-gray-400">{t('common.poweredBy')}</p>
            </div>
          </div>
        </header>
      )}

      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <XCircle size={28} className="text-orange-600" />
          </div>
          <h1 className="text-xl font-semibold mb-1">{t('bookingCancel.title')}</h1>
          <p className="text-sm text-gray-500">{t('bookingCancel.subtitle')}</p>
        </div>

        {/* Appointment summary */}
        {appointment && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-4">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-base font-semibold">{appointment.service?.name}</p>
            </div>

            <div className="px-5 py-4 space-y-3">
              {appointment.staff && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                    <User size={15} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">{t('bookingSuccess.professional')}</p>
                    <p className="text-sm font-medium">{appointment.staff.name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Calendar size={15} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('bookingSuccess.date')}</p>
                  <p className="text-sm font-medium">{formatDate(appointment.date)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Clock size={15} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('bookingSuccess.time')}</p>
                  <p className="text-sm font-medium">{appointment.startTime} — {appointment.endTime} ({appointment.service?.duration_minutes} min)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Policy notice */}
        {policy && (
          <div className="bg-orange-50 rounded-xl border border-orange-100 px-4 py-3 mb-6">
            <p className="text-xs text-orange-800">
              {policy.allowCancellation
                ? t('bookingCancel.policyNotice', { hours: String(policy.cancellationDeadlineHours) })
                : t('bookingCancel.cancellationDisabled')
              }
            </p>
          </div>
        )}

        {/* Reschedule link */}
        <Link
          href={`/${locale}/book/reschedule/${token}`}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors mb-3"
        >
          {t('bookingCancel.rescheduleBtn')}
        </Link>

        {/* Cancel button */}
        {policy?.allowCancellation && (
          <button
            onClick={handleCancel}
            disabled={state === 'confirming'}
            className="w-full px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {state === 'confirming' && <Loader2 size={16} className="animate-spin" />}
            {t('bookingCancel.confirmCancelBtn')}
          </button>
        )}
      </div>
    </div>
  )
}
