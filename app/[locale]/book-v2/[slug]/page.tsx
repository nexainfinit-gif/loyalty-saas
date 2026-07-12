'use client'

import '../../design-v2/theme.css'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { format, addDays, isSameDay, isBefore, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, Check, Clock, Euro, User, ChevronLeft, ChevronRight } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation, useLocaleRouter } from '@/lib/i18n'
import { CompactLocaleSwitcher } from '@/components/LocaleSwitcher'
import { Button, Input } from '@/components/ui-v2'
import { accentVars } from '@/components/ui-v2/accent'
import type { Service, StaffMember } from '@/types/appointments'

/**
 * Réservation — version design v2 « Comptoir » (parallèle, ne remplace pas
 * /book/[slug]). Même wizard 4 étapes, même logique métier (créneaux, acompte
 * Stripe, liste d'attente, blocage no-show, mode embed). Neutres chauds +
 * couleur de l'établissement comme accent discipliné.
 */

interface BusinessData { name: string; slug: string; primaryColor: string | null; logoUrl: string | null }
interface StaffAvailabilityRow { staff_id: string; day_of_week: number; start_time: string; end_time: string; is_working: boolean }
interface BookingSettings {
  slot_duration_minutes: number; buffer_minutes: number; max_advance_days: number
  min_advance_hours: number; working_days: number[]; opening_time: string; closing_time: string
}
type Step = 1 | 2 | 3 | 4

export default function BookingPageV2() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useLocaleRouter()
  const { t, locale } = useTranslation()
  const slug = params.slug as string
  const isEmbed = searchParams.get('embed') === '1'

  const [business, setBusiness] = useState<BusinessData | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [availability, setAvailability] = useState<StaffAvailabilityRow[]>([])
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<Step>(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [calendarStart, setCalendarStart] = useState<Date>(startOfDay(new Date()))
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '' })

  const [timeSlots, setTimeSlots] = useState<{ time: string; available: boolean; multiplier?: number }[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [waitlistForm, setWaitlistForm] = useState({ name: '', email: '', phone: '' })
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistJoined, setWaitlistJoined] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/book/${slug}`)
        if (!res.ok) { setError(t('booking.notFound')); return }
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

  const fetchSlots = useCallback(async () => {
    if (!selectedStaff || !selectedService) return
    setSlotsLoading(true)
    setTimeSlots([])
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const res = await fetch(`/api/book/${slug}/slots?date=${dateStr}&staffId=${selectedStaff.id}&serviceId=${selectedService.id}`)
      if (res.ok) {
        const data = await res.json()
        setTimeSlots(data.slots)
      }
    } catch { /* silently fail */ } finally {
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

  const goBack = () => { if (step > 1) setStep((step - 1) as Step) }

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
        if (data.blocked) setBookingError(t('booking.blockedNoShow'))
        else setBookingError(data.error || t('booking.bookError'))
        return
      }
      const data = await res.json()
      if (data.requiresPayment && data.paymentUrl) { window.location.href = data.paymentUrl; return }
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

  const isDayAvailable = useCallback((date: Date) => {
    const dow = date.getDay()
    if (settings && !settings.working_days.includes(dow)) return false
    if (selectedStaff) {
      const staffAvail = availability.find((a) => a.staff_id === selectedStaff.id && a.day_of_week === dow)
      if (!staffAvail || !staffAvail.is_working) return false
    }
    return true
  }, [settings, selectedStaff, availability])

  const primaryColor = business?.primaryColor ?? '#4148D6'

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div data-ui-v2="" className={`v2-bk${isEmbed ? ' v2-bk--embed' : ''}`} style={accentVars(primaryColor)}>
      {children}
    </div>
  )

  if (loading) {
    return (
      <Frame>
        <div className="v2-bk__state"><div className="v2-bk__spin" /></div>
      </Frame>
    )
  }

  if (error || !business) {
    return (
      <Frame>
        <div className="v2-bk__state">
          <div>
            <h2>{t('booking.pageNotFound')}</h2>
            <p>{error || t('booking.businessNotFound')}</p>
          </div>
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      {/* Header — masqué en mode embed */}
      {!isEmbed && (
        <header className="v2-bk__header">
          <div className="v2-bk__header-in">
            <div className="v2-bk__brand">
              {business.logoUrl
                ? <img src={business.logoUrl} alt={business.name} className="v2-bk__logo" />
                : <div className="v2-bk__logo-fb">{business.name[0]}</div>}
              <div>
                <p className="v2-bk__bname">{business.name}</p>
                <p className="v2-bk__btitle">{t('booking.bookTitle')}</p>
              </div>
            </div>
            <CompactLocaleSwitcher />
          </div>
        </header>
      )}

      {/* Progression */}
      <div className="v2-bk__progress">
        <div className="v2-bk__progress-in">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center" style={{ flex: 1 }}>
              <div className={`v2-bk__pstep ${step > s.num ? 'is-done' : step === s.num ? 'is-current' : ''}`} style={{ flex: 1 }}>
                <div className="v2-bk__pdot">{step > s.num ? <Check size={12} /> : s.num}</div>
                <span className="v2-bk__plabel">{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`v2-bk__pline ${step > s.num ? 'is-done' : ''}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="v2-bk__body">
        {step > 1 && (
          <button onClick={goBack} className="v2-bk__back">
            <ArrowLeft size={15} /> {t('booking.backBtn')}
          </button>
        )}

        {/* ═══ ÉTAPE 1 : Service ═══ */}
        {step === 1 && (
          <div>
            <h1 className="v2-bk__h">{t('booking.chooseService')}</h1>
            <p className="v2-bk__sub">{t('booking.chooseServiceSub')}</p>

            {services.length === 0 ? (
              <p className="v2-bk__empty">{t('booking.noServices')}</p>
            ) : (
              Object.entries(groupedServices).map(([category, catServices]) => (
                <div key={category} style={{ marginBottom: 24 }}>
                  <p className="v2-bk__cat">{category}</p>
                  <div className="flex flex-col gap-2">
                    {catServices.map((service) => (
                      <button
                        key={service.id}
                        onClick={() => { setSelectedService(service); setSelectedStaff(null); setSelectedTime(null); setStep(2) }}
                        className="v2-bk__row"
                      >
                        <div>
                          <p className="v2-bk__row-name">{service.name}</p>
                          <div className="v2-bk__row-meta"><Clock size={12} /> {service.duration_minutes} min</div>
                        </div>
                        <span className="v2-bk__row-price">&euro;{service.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ═══ ÉTAPE 2 : Professionnel ═══ */}
        {step === 2 && (
          <div>
            <h1 className="v2-bk__h">{t('booking.choosePro')}</h1>
            <p className="v2-bk__sub">{t('booking.forService', { service: selectedService?.name ?? '' })}</p>

            <div className="flex flex-col gap-2.5">
              {availableStaff.length > 1 && (
                <button onClick={() => { setSelectedStaff(availableStaff[0]); setStep(3) }} className="v2-bk__row v2-bk__row--staff">
                  <div className="v2-bk__avatar"><User size={18} /></div>
                  <div>
                    <p className="v2-bk__row-name">{t('booking.noPreference')}</p>
                    <p className="v2-bk__row-meta">{t('booking.firstAvailable')}</p>
                  </div>
                </button>
              )}
              {availableStaff.map((member) => (
                <button key={member.id} onClick={() => { setSelectedStaff(member); setStep(3) }} className="v2-bk__row v2-bk__row--staff">
                  <div className="v2-bk__avatar">
                    {member.avatar_url
                      ? <img src={member.avatar_url} alt={member.name} />
                      : <span>{member.name.split(' ').map((n) => n[0]).join('')}</span>}
                  </div>
                  <p className="v2-bk__row-name">{member.name}</p>
                </button>
              ))}
              {availableStaff.length === 0 && <p className="v2-bk__empty">{t('booking.noPros')}</p>}
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 3 : Date & créneau ═══ */}
        {step === 3 && (
          <div>
            <h1 className="v2-bk__h">{t('booking.chooseSlot')}</h1>
            <p className="v2-bk__sub">{selectedService?.name} · {selectedStaff?.name}</p>

            <div className="v2-bk__panel" style={{ marginBottom: 16 }}>
              <div className="v2-bk__cal-head">
                <button onClick={() => setCalendarStart(addDays(calendarStart, -7))} className="v2-bk__cal-nav"><ChevronLeft size={16} /></button>
                <p className="v2-bk__cal-month">{format(calendarStart, 'MMMM yyyy', { locale: fr })}</p>
                <button onClick={() => setCalendarStart(addDays(calendarStart, 7))} className="v2-bk__cal-nav"><ChevronRight size={16} /></button>
              </div>
              <div className="v2-bk__days">
                {calendarDays.map((day) => {
                  const isToday = isSameDay(day, new Date())
                  const isSelected = isSameDay(day, selectedDate)
                  const isPast = isBefore(day, startOfDay(new Date()))
                  const disabled = isPast || !isDayAvailable(day)
                  return (
                    <button
                      key={day.toISOString()} onClick={() => !disabled && setSelectedDate(day)} disabled={disabled}
                      className={`v2-bk__day${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                    >
                      <span className="v2-bk__day-dow">{format(day, 'EEE', { locale: fr })}</span>
                      <span className="v2-bk__day-num">{format(day, 'd')}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="v2-bk__panel">
              <p className="v2-bk__slots-lbl">{t('booking.slotsFor', { date: format(selectedDate, 'EEEE d MMMM', { locale: fr }) })}</p>

              {slotsLoading ? (
                <div className="flex items-center justify-center" style={{ padding: '28px 0' }}><div className="v2-bk__spin" /></div>
              ) : timeSlots.filter((s) => s.available).length === 0 ? (
                <div className="text-center" style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p className="v2-bk__empty" style={{ padding: 0 }}>{t('booking.noSlots')}</p>
                  {waitlistJoined ? (
                    <div className="v2-bk__notice v2-bk__notice--ok">{t('booking.waitlistSuccess') || 'Vous serez prévenu(e) si un créneau se libère !'}</div>
                  ) : (
                    <div style={{ background: 'var(--v2-sunken)', borderRadius: 'var(--v2-r-md)', padding: 16, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--v2-ink)' }}>{t('booking.waitlistTitle') || 'Être prévenu(e) si un créneau se libère'}</p>
                      <Input value={waitlistForm.name} onChange={(e) => setWaitlistForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('booking.namePlaceholder') || 'Votre nom'} />
                      <Input type="email" value={waitlistForm.email} onChange={(e) => setWaitlistForm((f) => ({ ...f, email: e.target.value }))} placeholder={t('booking.emailPlaceholder') || 'Votre email'} />
                      <Button
                        variant="primary"
                        disabled={!waitlistForm.name.trim() || !waitlistForm.email.trim() || waitlistLoading}
                        onClick={async () => {
                          setWaitlistLoading(true)
                          try {
                            const res = await fetch(`/api/book/${slug}/waitlist`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                serviceId: selectedService?.id, staffId: selectedStaff?.id ?? null,
                                date: format(selectedDate, 'yyyy-MM-dd'),
                                clientName: waitlistForm.name, clientEmail: waitlistForm.email, clientPhone: waitlistForm.phone,
                              }),
                            })
                            if (res.ok) setWaitlistJoined(true)
                          } catch { /* ignore */ }
                          setWaitlistLoading(false)
                        }}
                      >
                        {t('booking.joinWaitlist') || 'Me prévenir'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="v2-bk__slots">
                  {timeSlots.filter((s) => s.available).map((slot) => (
                    <button
                      key={slot.time} onClick={() => { setSelectedTime(slot.time); setStep(4) }}
                      className={`v2-bk__slot${selectedTime === slot.time ? ' is-selected' : ''}`}
                    >
                      {slot.time}
                      {(slot.multiplier ?? 1) > 1 && (
                        <span className="v2-bk__slot-mult" title={t('booking.multiplierHint', { n: slot.multiplier })}>×{slot.multiplier}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 4 : Coordonnées ═══ */}
        {step === 4 && (
          <div>
            <h1 className="v2-bk__h">{t('booking.yourInfo')}</h1>
            <p className="v2-bk__sub">{t('booking.yourInfoSub')}</p>

            <div className="v2-bk__summary" style={{ marginBottom: 22 }}>
              <p className="v2-bk__summary-name">{selectedService?.name}</p>
              <div className="v2-bk__summary-meta">
                <span><User size={12} /> {selectedStaff?.name}</span>
                <span><Clock size={12} /> {selectedTime} · {selectedService?.duration_minutes} min</span>
                <span><Euro size={12} /> {selectedService?.price}</span>
              </div>
              <p className="v2-bk__summary-date">{format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
            </div>

            {bookingError && <div className="v2-bk__notice v2-bk__notice--err" style={{ marginBottom: 16 }}>{bookingError}</div>}

            <form onSubmit={(e) => { e.preventDefault(); handleBooking() }} className="flex flex-col gap-4">
              <Input label={t('booking.nameLabel')} value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} required placeholder="Marie Dupont" />
              <Input label={t('booking.emailLabel')} type="email" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} required placeholder="marie@email.com" />
              <Input label={t('booking.phoneLabel')} type="tel" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} required placeholder="0470 12 34 56" />
              <Button type="submit" variant="primary" disabled={bookingLoading} className="v2-reg__submit" style={{ marginTop: 4 }}>
                {t('booking.confirmBtn')}
              </Button>
            </form>
          </div>
        )}
      </div>
    </Frame>
  )
}
