'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addDays, isSameDay, isBefore, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useParams } from 'next/navigation'
import { Calendar, Clock, User, Euro, ChevronLeft, ChevronRight, Loader2, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react'
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
  service: { id: string; name: string; duration_minutes: number; price: number; category: string } | null
  staff: { id: string; name: string; avatar_url: string | null; service_ids: string[] } | null
}

interface BusinessData {
  name: string
  slug: string
  primaryColor: string | null
  logoUrl: string | null
}

interface StaffAvailabilityRow {
  staff_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_working: boolean
}

interface BookingSettings {
  slot_duration_minutes: number
  buffer_minutes: number
  max_advance_days: number
  min_advance_hours: number
  working_days: number[]
  opening_time: string
  closing_time: string
}

type PageState = 'loading' | 'selectSlot' | 'confirming' | 'success' | 'error'

export default function RescheduleAppointmentPage() {
  const params = useParams()
  const { t, locale } = useTranslation()
  const token = params.token as string

  const [state, setState] = useState<PageState>('loading')
  const [appointment, setAppointment] = useState<AppointmentData | null>(null)
  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [availability, setAvailability] = useState<StaffAvailabilityRow[]>([])
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Date/time selection
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [calendarStart, setCalendarStart] = useState<Date>(startOfDay(new Date()))
  const [timeSlots, setTimeSlots] = useState<{ time: string; available: boolean }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  // Result data
  const [result, setResult] = useState<{
    date: string
    startTime: string
    endTime: string
    serviceName: string
    staffName: string
    durationMinutes: number
    price: number
  } | null>(null)

  // Format date for display
  const formatDate = (date: string) => {
    if (!date) return ''
    const [y, m, d] = date.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    return `${dayNames[dateObj.getDay()]} ${d} ${monthNames[m - 1]} ${y}`
  }

  // Fetch appointment data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/book/reschedule/${token}`)
        if (!res.ok) {
          const data = await res.json()
          setError(data.error || t('bookingReschedule.notFound'))
          setState('error')
          return
        }
        const data = await res.json()
        setAppointment(data.appointment)
        setBusiness(data.business)
        setAvailability(data.availability)
        setSettings(data.settings)

        if (data.appointment.status !== 'confirmed') {
          setError(t('bookingReschedule.cannotModify'))
          setState('error')
          return
        }

        setState('selectSlot')
      } catch {
        setError(t('common.networkErrorRetry'))
        setState('error')
      }
    }
    fetchData()
  }, [token, t])

  // Fetch slots when date changes
  const fetchSlots = useCallback(async () => {
    if (state !== 'selectSlot') return
    setSlotsLoading(true)
    setTimeSlots([])
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const res = await fetch(`/api/book/reschedule/${token}/slots?date=${dateStr}`)
      if (res.ok) {
        const data = await res.json()
        setTimeSlots(data.slots)
      }
    } catch {
      // silently fail — user sees "no slots"
    } finally {
      setSlotsLoading(false)
    }
  }, [token, selectedDate, state])

  useEffect(() => {
    if (state === 'selectSlot') fetchSlots()
  }, [state, selectedDate, fetchSlots])

  const calendarDays = useMemo(() => {
    const maxDays = settings?.max_advance_days ?? 30
    return Array.from({ length: 7 }, (_, i) => addDays(calendarStart, i))
      .filter((d) => {
        const diff = Math.ceil((d.getTime() - startOfDay(new Date()).getTime()) / 86400000)
        return diff <= maxDays
      })
  }, [calendarStart, settings])

  const isDayAvailable = useCallback(
    (date: Date) => {
      const dow = date.getDay()
      if (settings && !settings.working_days.includes(dow)) return false
      if (appointment?.staff) {
        const staffAvail = availability.find(
          (a) => a.staff_id === appointment.staff!.id && a.day_of_week === dow,
        )
        if (!staffAvail || !staffAvail.is_working) return false
      }
      return true
    },
    [settings, appointment, availability],
  )

  const handleReschedule = async () => {
    if (!selectedTime) return
    setState('confirming')
    try {
      const res = await fetch(`/api/book/reschedule/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: format(selectedDate, 'yyyy-MM-dd'),
          time: selectedTime,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('bookingReschedule.rescheduleError'))
        setState('error')
        return
      }

      setResult(data.appointment)
      setState('success')
    } catch {
      setError(t('common.networkErrorRetry'))
      setState('error')
    }
  }

  // Loading
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  // Error
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
            <h1 className="text-xl font-semibold mb-2">{t('bookingReschedule.errorTitle')}</h1>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
          {business && (
            <div className="text-center">
              <Link
                href={`/${locale}/book/${business.slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                {t('bookingReschedule.backToBooking')}
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Success
  if (state === 'success' && result) {
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
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} className="text-green-600" />
            </div>
            <h1 className="text-xl font-semibold mb-1">{t('bookingReschedule.successTitle')}</h1>
            <p className="text-sm text-gray-500">{t('bookingReschedule.successSubtitle')}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-base font-semibold">{result.serviceName}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <User size={15} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('bookingSuccess.professional')}</p>
                  <p className="text-sm font-medium">{result.staffName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Calendar size={15} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('bookingSuccess.date')}</p>
                  <p className="text-sm font-medium">{formatDate(result.date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Clock size={15} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('bookingSuccess.time')}</p>
                  <p className="text-sm font-medium">{result.startTime} — {result.endTime} ({result.durationMinutes} min)</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Euro size={15} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{t('bookingSuccess.price')}</p>
                  <p className="text-sm font-medium">{result.price}&euro;</p>
                </div>
              </div>
            </div>
          </div>

          {business && (
            <div className="text-center">
              <Link
                href={`/${locale}/book/${business.slug}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                {t('bookingSuccess.bookAnother')}
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Select slot state
  return (
    <div className="min-h-screen bg-surface">
      {business && (
        <header className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {business.logoUrl ? (
                <img src={business.logoUrl} alt={business.name} className="w-9 h-9 rounded-lg object-cover" />
              ) : (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: business.primaryColor ?? '#111827' }}
                >
                  <span className="text-white text-sm font-bold">{business.name[0]}</span>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{business.name}</p>
                <p className="text-[11px] text-gray-400">{t('bookingReschedule.pageTitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CompactLocaleSwitcher />
              <p className="text-xs text-gray-400">{t('common.poweredBy')}</p>
            </div>
          </div>
        </header>
      )}

      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold mb-1">{t('bookingReschedule.title')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('bookingReschedule.subtitle')}</p>

        {/* Current appointment summary */}
        {appointment && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              {t('bookingReschedule.currentAppointment')}
            </p>
            <p className="text-sm font-semibold">{appointment.service?.name}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <User size={12} />
                {appointment.staff?.name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {formatDate(appointment.date)}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {appointment.startTime} — {appointment.endTime}
              </span>
            </div>
          </div>
        )}

        {/* Date selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setCalendarStart(addDays(calendarStart, -7))}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-medium">
              {format(calendarStart, 'MMMM yyyy', { locale: fr })}
            </p>
            <button
              onClick={() => setCalendarStart(addDays(calendarStart, 7))}
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isToday = isSameDay(day, new Date())
              const isSelected = isSameDay(day, selectedDate)
              const isPast = isBefore(day, startOfDay(new Date()))
              const isClosed = !isDayAvailable(day)
              const disabled = isPast || isClosed
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => !disabled && setSelectedDate(day)}
                  disabled={disabled}
                  className={`flex flex-col items-center py-2.5 rounded-xl text-center transition-all duration-200 ${
                    isSelected
                      ? 'bg-gray-900 text-white'
                      : disabled
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wider mb-0.5">
                    {format(day, 'EEE', { locale: fr })}
                  </span>
                  <span className={`text-lg font-semibold ${isToday && !isSelected ? 'text-primary-600' : ''}`}>
                    {format(day, 'd')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Time slots */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <p className="text-xs font-semibold text-gray-500 mb-3">
            {t('booking.slotsFor', { date: format(selectedDate, 'EEEE d MMMM', { locale: fr }) })}
          </p>

          {slotsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : timeSlots.filter((s) => s.available).length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              {t('booking.noSlots')}
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {timeSlots
                .filter((s) => s.available)
                .map((slot) => (
                  <button
                    key={slot.time}
                    onClick={() => setSelectedTime(slot.time)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      selectedTime === slot.time
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-50 text-gray-900 hover:bg-gray-200'
                    }`}
                  >
                    {slot.time}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Confirm button */}
        <button
          onClick={handleReschedule}
          disabled={!selectedTime || state === 'confirming'}
          className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {state === 'confirming' && <Loader2 size={16} className="animate-spin" />}
          {t('bookingReschedule.confirmBtn')}
        </button>
      </div>
    </div>
  )
}
