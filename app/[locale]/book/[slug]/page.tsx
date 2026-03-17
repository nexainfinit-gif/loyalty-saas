'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { format, addDays, isSameDay, isBefore, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, Check, Clock, Euro, User, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation, useLocaleRouter } from '@/lib/i18n'
import { CompactLocaleSwitcher } from '@/components/LocaleSwitcher'
import type { Service, StaffMember } from '@/types/appointments'

/* ── Types for API responses ─────────────────────────────────────────────── */

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

type Step = 1 | 2 | 3 | 4

export default function BookingPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useLocaleRouter()
  const { t, locale } = useTranslation()
  const slug = params.slug as string
  const isEmbed = searchParams.get('embed') === '1'

  // ── Data state ──────────────────────────────────────────────────────────
  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [availability, setAvailability] = useState<StaffAvailabilityRow[]>([])
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Booking flow state ──────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [calendarStart, setCalendarStart] = useState<Date>(startOfDay(new Date()))
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '' })

  // ── Slots state ─────────────────────────────────────────────────────────
  const [timeSlots, setTimeSlots] = useState<{ time: string; available: boolean }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [waitlistForm, setWaitlistForm] = useState({ name: '', email: '', phone: '' })
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistJoined, setWaitlistJoined] = useState(false)

  // ── Fetch business data on mount ────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/book/${slug}`)
        if (!res.ok) {
          setError(t('booking.notFound'))
          return
        }
        const data = await res.json()
        setBusiness(data.business)
        setServices(data.services)
        setStaff(data.staff)
        setAvailability(data.availability)
        setSettings(data.settings)
      } catch {
        setError(t('booking.loadError'))
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [slug, t])

  // ── Fetch available slots when staff + date change ──────────────────────
  const fetchSlots = useCallback(async () => {
    if (!selectedStaff || !selectedService) return
    setSlotsLoading(true)
    setTimeSlots([])
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const res = await fetch(
        `/api/book/${slug}/slots?date=${dateStr}&staffId=${selectedStaff.id}&serviceId=${selectedService.id}`
      )
      if (res.ok) {
        const data = await res.json()
        setTimeSlots(data.slots)
      }
    } catch {
      // silently fail — user sees "no slots"
    } finally {
      setSlotsLoading(false)
    }
  }, [slug, selectedStaff, selectedService, selectedDate])

  useEffect(() => {
    if (step === 3) fetchSlots()
  }, [step, selectedDate, fetchSlots])

  const steps = [
    { num: 1, label: t('booking.stepService') },
    { num: 2, label: t('booking.stepProfessional') },
    { num: 3, label: t('booking.stepSlot') },
    { num: 4, label: t('booking.stepInfo') },
  ]

  // ── Available staff for selected service ────────────────────────────────
  const availableStaff = useMemo(() => {
    if (!selectedService) return []
    return staff.filter((s) => s.service_ids.includes(selectedService.id))
  }, [selectedService, staff])

  const calendarDays = useMemo(() => {
    const maxDays = settings?.max_advance_days ?? 30
    return Array.from({ length: 7 }, (_, i) => addDays(calendarStart, i))
      .filter((d) => {
        const diff = Math.ceil((d.getTime() - startOfDay(new Date()).getTime()) / 86400000)
        return diff <= maxDays
      })
  }, [calendarStart, settings])

  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step)
  }

  const handleBooking = async () => {
    if (!selectedService || !selectedStaff || !selectedTime) return
    setBookingLoading(true)
    setBookingError(null)

    try {
      const res = await fetch(`/api/book/${slug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: selectedService.id,
          staffId: selectedStaff.id,
          date: format(selectedDate, 'yyyy-MM-dd'),
          time: selectedTime,
          clientName: clientForm.name,
          clientEmail: clientForm.email,
          clientPhone: clientForm.phone,
          notes: null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.blocked) {
          setBookingError(t('booking.blockedNoShow'))
        } else {
          setBookingError(data.error || t('booking.bookError'))
        }
        return
      }

      const data = await res.json()
      const successParams = new URLSearchParams({
        service: data.serviceName ?? selectedService.name,
        staff: data.staffName ?? selectedStaff.name,
        date: data.date ?? format(selectedDate, 'yyyy-MM-dd'),
        start: data.startTime ?? selectedTime,
        end: data.endTime ?? '',
        price: String(data.price ?? selectedService.price),
        duration: String(data.durationMinutes ?? selectedService.duration_minutes),
        business: data.businessName ?? business?.name ?? '',
        ...(data.confirmationMessage ? { message: data.confirmationMessage } : {}),
      })
      const embedParam = isEmbed ? '&embed=1' : ''
      router.push(`/book/${slug}/success?${successParams.toString()}${embedParam}`)
    } catch {
      setBookingError(t('common.networkErrorRetry'))
    } finally {
      setBookingLoading(false)
    }
  }

  const groupedServices = useMemo(() => {
    const groups: Record<string, Service[]> = {}
    services.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = []
      groups[s.category].push(s)
    })
    return groups
  }, [services])

  // Check if a day is a working day (for the staff member if selected, else business-level)
  const isDayAvailable = useCallback(
    (date: Date) => {
      const dow = date.getDay()
      if (settings && !settings.working_days.includes(dow)) return false
      if (selectedStaff) {
        const staffAvail = availability.find(
          (a) => a.staff_id === selectedStaff.id && a.day_of_week === dow,
        )
        if (!staffAvail || !staffAvail.is_working) return false
      }
      return true
    },
    [settings, selectedStaff, availability],
  )

  const primaryColor = business?.primaryColor ?? '#111827'

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`${isEmbed ? 'min-h-[200px]' : 'min-h-screen'} bg-surface flex items-center justify-center`}>
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !business) {
    return (
      <div className={`${isEmbed ? 'min-h-[200px]' : 'min-h-screen'} bg-surface flex items-center justify-center`}>
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 mb-2">{t('booking.pageNotFound')}</p>
          <p className="text-sm text-gray-500">{error || t('booking.businessNotFound')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={isEmbed ? 'bg-transparent' : 'min-h-screen bg-surface'}>
      {/* Header — hidden in embed mode */}
      {!isEmbed && (
        <header className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {business.logoUrl ? (
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  className="w-9 h-9 rounded-lg object-cover"
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: primaryColor }}
                >
                  <span className="text-white text-sm font-bold">
                    {business.name[0]}
                  </span>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold">{business.name}</p>
                <p className="text-[11px] text-gray-400">{t('booking.bookTitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CompactLocaleSwitcher />
              <p className="text-xs text-gray-400">
                {t('common.poweredBy')}
              </p>
            </div>
          </div>
        </header>
      )}

      {/* Progress */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center flex-1">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                    step >= s.num
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-50 text-gray-400'
                  }`}
                >
                  {step > s.num ? <Check size={12} /> : s.num}
                </div>
                <span
                  className={`text-[11px] font-medium hidden sm:block ${
                    step >= s.num ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-px flex-1 mx-2 transition-colors duration-300 ${
                    step > s.num ? 'bg-gray-900' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {step > 1 && (
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft size={16} />
            {t('booking.backBtn')}
          </button>
        )}

        {/* ═══ STEP 1: Choose service ═══ */}
        {step === 1 && (
          <div>
            <h1 className="text-xl font-semibold mb-1">{t('booking.chooseService')}</h1>
            <p className="text-sm text-gray-500 mb-6">
              {t('booking.chooseServiceSub')}
            </p>

            {services.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                {t('booking.noServices')}
              </p>
            ) : (
              Object.entries(groupedServices).map(([category, catServices]) => (
                <div key={category} className="mb-6">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    {category}
                  </p>
                  <div className="space-y-2">
                    {catServices.map((service) => (
                      <button
                        key={service.id}
                        onClick={() => {
                          setSelectedService(service)
                          setSelectedStaff(null)
                          setSelectedTime(null)
                          setStep(2)
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all duration-200 text-left ${
                          selectedService?.id === service.id
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium">{service.name}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Clock size={12} />
                              {service.duration_minutes} min
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold">&euro;{service.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ═══ STEP 2: Choose staff ═══ */}
        {step === 2 && (
          <div>
            <h1 className="text-xl font-semibold mb-1">{t('booking.choosePro')}</h1>
            <p className="text-sm text-gray-500 mb-6">
              {t('booking.forService', { service: selectedService?.name ?? '' })}
            </p>

            <div className="space-y-3">
              {availableStaff.length > 1 && (
                <button
                  onClick={() => {
                    setSelectedStaff(availableStaff[0])
                    setStep(3)
                  }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all duration-200 text-left"
                >
                  <div className="w-11 h-11 rounded-full bg-gray-50 flex items-center justify-center">
                    <User size={18} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t('booking.noPreference')}</p>
                    <p className="text-xs text-gray-400">{t('booking.firstAvailable')}</p>
                  </div>
                </button>
              )}

              {availableStaff.map((member) => (
                <button
                  key={member.id}
                  onClick={() => {
                    setSelectedStaff(member)
                    setStep(3)
                  }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all duration-200 text-left"
                >
                  <div className="w-11 h-11 rounded-full bg-gray-50 flex items-center justify-center">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-sm font-semibold text-gray-500">
                        {member.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                  </div>
                </button>
              ))}

              {availableStaff.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">
                  {t('booking.noPros')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Choose date & time ═══ */}
        {step === 3 && (
          <div>
            <h1 className="text-xl font-semibold mb-1">{t('booking.chooseSlot')}</h1>
            <p className="text-sm text-gray-500 mb-6">
              {selectedService?.name} avec {selectedStaff?.name}
            </p>

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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">
                {t('booking.slotsFor', { date: format(selectedDate, 'EEEE d MMMM', { locale: fr }) })}
              </p>

              {slotsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-gray-400" />
                </div>
              ) : timeSlots.filter((s) => s.available).length === 0 ? (
                <div className="py-4 text-center space-y-4">
                  <p className="text-sm text-gray-400">
                    {t('booking.noSlots')}
                  </p>

                  {/* Waitlist form */}
                  {waitlistJoined ? (
                    <div className="bg-green-50 rounded-xl border border-green-100 px-4 py-3">
                      <p className="text-sm text-green-700 font-medium">
                        {t('booking.waitlistSuccess') || 'Vous serez prévenu(e) si un créneau se libère !'}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3">
                      <p className="text-xs font-semibold text-gray-700">
                        {t('booking.waitlistTitle') || 'Être prévenu(e) si un créneau se libère'}
                      </p>
                      <input
                        type="text"
                        placeholder={t('booking.namePlaceholder') || 'Votre nom'}
                        value={waitlistForm.name}
                        onChange={(e) => setWaitlistForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
                      />
                      <input
                        type="email"
                        placeholder={t('booking.emailPlaceholder') || 'Votre email'}
                        value={waitlistForm.email}
                        onChange={(e) => setWaitlistForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
                      />
                      <button
                        disabled={!waitlistForm.name.trim() || !waitlistForm.email.trim() || waitlistLoading}
                        onClick={async () => {
                          setWaitlistLoading(true)
                          try {
                            const res = await fetch(`/api/book/${slug}/waitlist`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                serviceId: selectedService?.id,
                                staffId: selectedStaff?.id ?? null,
                                date: format(selectedDate, 'yyyy-MM-dd'),
                                clientName: waitlistForm.name,
                                clientEmail: waitlistForm.email,
                                clientPhone: waitlistForm.phone,
                              }),
                            })
                            if (res.ok) {
                              setWaitlistJoined(true)
                            }
                          } catch { /* ignore */ }
                          setWaitlistLoading(false)
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {waitlistLoading && <Loader2 size={14} className="animate-spin" />}
                        {t('booking.joinWaitlist') || 'Me prévenir'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {timeSlots
                    .filter((s) => s.available)
                    .map((slot) => (
                      <button
                        key={slot.time}
                        onClick={() => {
                          setSelectedTime(slot.time)
                          setStep(4)
                        }}
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
          </div>
        )}

        {/* ═══ STEP 4: Client info ═══ */}
        {step === 4 && (
          <div>
            <h1 className="text-xl font-semibold mb-1">{t('booking.yourInfo')}</h1>
            <p className="text-sm text-gray-500 mb-6">
              {t('booking.yourInfoSub')}
            </p>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="text-sm font-semibold">{selectedService?.name}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <User size={12} />
                  {selectedStaff?.name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {selectedTime} · {selectedService?.duration_minutes} min
                </span>
                <span className="flex items-center gap-1">
                  <Euro size={12} />
                  {selectedService?.price}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
              </p>
            </div>

            {bookingError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-sm text-red-700">{bookingError}</p>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleBooking()
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  {t('booking.nameLabel')}
                </label>
                <input
                  type="text"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  required
                  placeholder="Marie Dupont"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  {t('booking.emailLabel')}
                </label>
                <input
                  type="email"
                  value={clientForm.email}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  required
                  placeholder="marie@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  {t('booking.phoneLabel')}
                </label>
                <input
                  type="tel"
                  value={clientForm.phone}
                  onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                  required
                  placeholder="0470 12 34 56"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={bookingLoading}
                className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {bookingLoading && <Loader2 size={16} className="animate-spin" />}
                {t('booking.confirmBtn')}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
