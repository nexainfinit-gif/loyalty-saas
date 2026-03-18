'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Calendar, Clock, Star, User, ArrowRight, Loader2, Mail } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'

interface Customer {
  id: string
  first_name: string
  last_name: string | null
  email: string
  total_points: number
  stamps_count: number
  total_visits: number
  last_visit_at: string | null
  created_at: string
}

interface Restaurant {
  id: string
  name: string
  slug: string
  primary_color: string | null
  logo_url: string | null
}

interface Loyalty {
  program_type: 'points' | 'stamps'
  reward_threshold: number
  stamps_total: number
  reward_message: string
}

interface Appointment {
  id: string
  date: string
  start_time: string
  end_time: string
  status: string
  cancel_token: string
  service: { name: string; price: number; duration_minutes: number } | null
  staff: { name: string } | null
}

export default function ClientPortalPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { t, locale } = useTranslation()
  const slug = params.slug as string
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loginEmail, setLoginEmail] = useState('')
  const [loginSent, setLoginSent] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    async function fetchData() {
      const [authRes, aptsRes] = await Promise.all([
        fetch(`/api/client/auth?token=${token}`),
        fetch(`/api/client/appointments?token=${token}`),
      ])

      if (authRes.ok) {
        const data = await authRes.json()
        setCustomer(data.customer)
        setRestaurant(data.restaurant)
        setLoyalty(data.loyalty)
      }

      if (aptsRes.ok) {
        const data = await aptsRes.json()
        setAppointments(data.appointments ?? [])
      }

      setLoading(false)
    }
    fetchData()
  }, [token])

  const primaryColor = restaurant?.primary_color ?? '#4F6BED'
  const today = new Date().toISOString().split('T')[0]
  const upcoming = appointments.filter((a) => a.date >= today && a.status === 'confirmed')
  const past = appointments.filter((a) => a.date < today || a.status !== 'confirmed')

  // Login form (no token)
  if (!token) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-4">
              <User size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-semibold mb-1">{t('clientPortal.title')}</h1>
            <p className="text-sm text-gray-500">{t('clientPortal.loginPrompt')}</p>
          </div>

          {loginSent ? (
            <div className="bg-green-50 rounded-xl border border-green-100 p-4 text-center">
              <Mail size={20} className="text-green-600 mx-auto mb-2" />
              <p className="text-sm text-green-700 font-medium">{t('clientPortal.loginSuccess')}</p>
              <p className="text-xs text-green-600 mt-1">{t('clientPortal.checkInbox')}</p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setLoginLoading(true)
                await fetch('/api/client/auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: loginEmail, slug }),
                })
                setLoginSent(true)
                setLoginLoading(false)
              }}
              className="space-y-3"
            >
              <input
                type="email"
                name="email"
                required
                placeholder={t('clientPortal.emailPlaceholder') || 'your@email.com'}
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
              />
              <button
                type="submit"
                disabled={loginLoading}
                className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loginLoading && <Loader2 size={14} className="animate-spin" />}
                {t('clientPortal.sendLink')}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (!customer || !restaurant) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">{t('clientPortal.sessionExpired')}</p>
          <p className="text-sm text-gray-500 mb-4">{t('clientPortal.reconnectPrompt')}</p>
          <Link
            href={`/${locale}/client/${slug}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium"
          >
            {t('clientPortal.reconnect')}
          </Link>
        </div>
      </div>
    )
  }

  const programType = loyalty?.program_type ?? 'points'
  const progress = programType === 'stamps'
    ? Math.min(100, ((customer.stamps_count ?? 0) / (loyalty?.stamps_total ?? 10)) * 100)
    : Math.min(100, (customer.total_points / (loyalty?.reward_threshold ?? 100)) * 100)

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header style={{ backgroundColor: primaryColor }} className="px-4 py-6">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-white/80 text-xs mb-1">{restaurant.name}</p>
          <h1 className="text-white text-xl font-semibold">
            {t('clientPortal.greeting', { name: customer.first_name })}
          </h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Loyalty card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star size={16} style={{ color: primaryColor }} />
              <span className="text-sm font-semibold text-gray-900">
                {programType === 'stamps' ? t('clientPortal.loyaltyCard') : t('clientPortal.loyaltyPoints')}
              </span>
            </div>
            <span className="text-xs text-gray-500">{customer.total_visits} {customer.total_visits !== 1 ? t('clientPortal.visits') : t('clientPortal.visit')}</span>
          </div>

          <div className="text-center mb-3">
            <p className="text-3xl font-bold" style={{ color: primaryColor }}>
              {programType === 'stamps' ? customer.stamps_count : customer.total_points}
            </p>
            <p className="text-xs text-gray-500">
              {programType === 'stamps'
                ? `${customer.stamps_count} / ${loyalty?.stamps_total ?? 10} ${t('clientPortal.stamps')}`
                : `${customer.total_points} / ${loyalty?.reward_threshold ?? 100} ${t('clientPortal.points')}`
              }
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: primaryColor }}
            />
          </div>
          {loyalty?.reward_message && (
            <p className="text-xs text-gray-500 mt-2 text-center">{loyalty.reward_message}</p>
          )}
        </div>

        {/* Upcoming appointments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">{t('clientPortal.upcomingAppointments')}</h2>
            <Link
              href={`/${locale}/book/${slug}`}
              className="text-xs font-medium flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: primaryColor }}
            >
              {t('clientPortal.book')} <ArrowRight size={12} />
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <Calendar size={20} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{t('clientPortal.noUpcoming')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((apt) => (
                <AppointmentCard key={apt.id} apt={apt} locale={locale} slug={slug} color={primaryColor} t={t} />
              ))}
            </div>
          )}
        </div>

        {/* Past appointments */}
        {past.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">{t('clientPortal.history')}</h2>
            <div className="space-y-2">
              {past.slice(0, 10).map((apt) => (
                <AppointmentCard key={apt.id} apt={apt} locale={locale} slug={slug} color={primaryColor} isPast t={t} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AppointmentCard({ apt, locale, slug, color, isPast, t }: {
  apt: Appointment; locale: string; slug: string; color: string; isPast?: boolean; t: (key: string, params?: Record<string, string>) => string
}) {
  const svc = apt.service as { name: string; price: number; duration_minutes: number } | null
  const staff = apt.staff as { name: string } | null

  const [y, m, d] = apt.date.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const dayNames = [
    t('appointmentStaff.daySun'), t('appointmentStaff.dayMon'), t('appointmentStaff.dayTue'),
    t('appointmentStaff.dayWed'), t('appointmentStaff.dayThu'), t('appointmentStaff.dayFri'),
    t('appointmentStaff.daySat'),
  ]
  const monthKeys = [
    'monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun',
    'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec',
  ]
  const displayDate = `${dayNames[dateObj.getDay()]} ${d} ${t(`clientPortal.${monthKeys[m - 1]}`)}`

  const statusColors: Record<string, string> = {
    confirmed: 'bg-blue-50 text-blue-700',
    completed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-700',
    no_show: 'bg-orange-50 text-orange-700',
  }
  const statusLabels: Record<string, string> = {
    confirmed: t('clientPortal.statusConfirmed'),
    completed: t('clientPortal.statusCompleted'),
    cancelled: t('clientPortal.statusCancelled'),
    no_show: t('clientPortal.statusNoShow'),
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 ${isPast ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{svc?.name ?? t('clientPortal.defaultAppointment')}</p>
          {staff && <p className="text-xs text-gray-500">{t('clientPortal.withStaff')} {staff.name}</p>}
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColors[apt.status] ?? ''}`}>
          {statusLabels[apt.status] ?? apt.status}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Calendar size={11} />{displayDate}</span>
        <span className="flex items-center gap-1"><Clock size={11} />{apt.start_time} — {apt.end_time}</span>
        {svc && <span>{svc.price}€</span>}
      </div>
      {apt.status === 'confirmed' && !isPast && (
        <div className="mt-3 flex gap-2">
          <Link
            href={`/${locale}/book/cancel/${apt.cancel_token}`}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
          >
            {t('clientPortal.cancelAction')}
          </Link>
          <Link
            href={`/${locale}/book/reschedule/${apt.cancel_token}`}
            className="text-xs font-medium hover:opacity-80"
            style={{ color }}
          >
            {t('clientPortal.rescheduleAction')}
          </Link>
        </div>
      )}
    </div>
  )
}
