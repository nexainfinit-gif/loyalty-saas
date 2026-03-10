'use client'

import { useState, useMemo } from 'react'
import { format, addDays, isSameDay, parse, addMinutes, isBefore, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, Check, Clock, Euro, User, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Service, StaffMember, Appointment } from '@/types/appointments'

// ═══ DEMO DATA (in production, fetched from Supabase by slug) ═══
const BUSINESS = { name: 'Salon Élégance', slug: 'salon-elegance' }

const SERVICES: Service[] = [
  { id: 's1', restaurant_id: 'b1', name: 'Coupe homme', duration_minutes: 30, price: 25, category: 'Coupe', active: true, created_at: '' },
  { id: 's2', restaurant_id: 'b1', name: 'Coupe femme', duration_minutes: 45, price: 35, category: 'Coupe', active: true, created_at: '' },
  { id: 's3', restaurant_id: 'b1', name: 'Brushing', duration_minutes: 30, price: 20, category: 'Coiffure', active: true, created_at: '' },
  { id: 's4', restaurant_id: 'b1', name: 'Couleur complète', duration_minutes: 90, price: 65, category: 'Couleur', active: true, created_at: '' },
  { id: 's5', restaurant_id: 'b1', name: 'Barbe', duration_minutes: 20, price: 15, category: 'Barbe', active: true, created_at: '' },
  { id: 's6', restaurant_id: 'b1', name: 'Soin visage', duration_minutes: 60, price: 50, category: 'Soin', active: true, created_at: '' },
]

const STAFF: StaffMember[] = [
  { id: 'st1', restaurant_id: 'b1', name: 'Sophie Martin', email: '', phone: null, avatar_url: null, service_ids: ['s1', 's2', 's3', 's4'], active: true, created_at: '' },
  { id: 'st2', restaurant_id: 'b1', name: 'Lucas Dubois', email: '', phone: null, avatar_url: null, service_ids: ['s1', 's3', 's5'], active: true, created_at: '' },
  { id: 'st3', restaurant_id: 'b1', name: 'Emma Laurent', email: '', phone: null, avatar_url: null, service_ids: ['s2', 's3', 's4', 's6'], active: true, created_at: '' },
]

const EXISTING_APPOINTMENTS: Pick<Appointment, 'staff_id' | 'date' | 'start_time' | 'end_time'>[] = [
  { staff_id: 'st1', date: format(new Date(), 'yyyy-MM-dd'), start_time: '10:00', end_time: '10:45' },
  { staff_id: 'st1', date: format(new Date(), 'yyyy-MM-dd'), start_time: '14:00', end_time: '15:30' },
  { staff_id: 'st2', date: format(new Date(), 'yyyy-MM-dd'), start_time: '09:30', end_time: '10:00' },
  { staff_id: 'st3', date: format(new Date(), 'yyyy-MM-dd'), start_time: '11:00', end_time: '12:00' },
]

type Step = 1 | 2 | 3 | 4 | 5

export default function BookingPage() {
  const [step, setStep] = useState<Step>(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [calendarStart, setCalendarStart] = useState<Date>(startOfDay(new Date()))
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
  })

  const steps = [
    { num: 1, label: 'Service' },
    { num: 2, label: 'Coiffeur' },
    { num: 3, label: 'Créneau' },
    { num: 4, label: 'Vos infos' },
    { num: 5, label: 'Confirmation' },
  ]

  // Available staff for selected service
  const availableStaff = useMemo(() => {
    if (!selectedService) return []
    return STAFF.filter((s) => s.service_ids.includes(selectedService.id))
  }, [selectedService])

  // Generate time slots for selected staff + date
  const timeSlots = useMemo(() => {
    if (!selectedStaff || !selectedService) return []
    const slots: { time: string; available: boolean }[] = []
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const now = new Date()

    for (let hour = 9; hour < 19; hour++) {
      for (let min = 0; min < 60; min += 15) {
        const time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
        const slotStart = parse(time, 'HH:mm', selectedDate)
        const slotEnd = addMinutes(slotStart, selectedService.duration_minutes)

        // Past slot check
        if (isSameDay(selectedDate, now) && isBefore(slotStart, now)) {
          continue
        }

        // Check if slot end exceeds closing time
        if (slotEnd.getHours() >= 19) continue

        // Check conflicts
        const hasConflict = EXISTING_APPOINTMENTS.some((appt) => {
          if (appt.staff_id !== selectedStaff.id || appt.date !== dateStr) return false
          const apptStart = parse(appt.start_time, 'HH:mm', selectedDate)
          const apptEnd = parse(appt.end_time, 'HH:mm', selectedDate)
          return slotStart < apptEnd && slotEnd > apptStart
        })

        slots.push({ time, available: !hasConflict })
      }
    }
    return slots
  }, [selectedStaff, selectedService, selectedDate])

  const calendarDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(calendarStart, i)),
    [calendarStart]
  )

  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step)
  }

  const handleBooking = () => {
    // TODO: POST to Supabase
    setStep(5)
  }

  const groupedServices = useMemo(() => {
    const groups: Record<string, Service[]> = {}
    SERVICES.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = []
      groups[s.category].push(s)
    })
    return groups
  }, [])

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white text-sm font-bold">
                {BUSINESS.name[0]}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold">{BUSINESS.name}</p>
              <p className="text-[11px] text-gray-400">Réservation en ligne</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Propulsé par <span className="font-semibold text-gray-500">Rebites</span>
          </p>
        </div>
      </header>

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
        {step > 1 && step < 5 && (
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft size={16} />
            Retour
          </button>
        )}

        {/* ═══ STEP 1: Choose service ═══ */}
        {step === 1 && (
          <div>
            <h1 className="text-xl font-semibold mb-1">Choisissez un service</h1>
            <p className="text-sm text-gray-500 mb-6">
              Sélectionnez la prestation souhaitée
            </p>

            {Object.entries(groupedServices).map(([category, services]) => (
              <div key={category} className="mb-6">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {category}
                </p>
                <div className="space-y-2">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => {
                        setSelectedService(service)
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
            ))}
          </div>
        )}

        {/* ═══ STEP 2: Choose staff ═══ */}
        {step === 2 && (
          <div>
            <h1 className="text-xl font-semibold mb-1">Choisissez votre coiffeur</h1>
            <p className="text-sm text-gray-500 mb-6">
              Pour : {selectedService?.name}
            </p>

            <div className="space-y-3">
              {/* Any available option */}
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
                  <p className="text-sm font-medium">Pas de préférence</p>
                  <p className="text-xs text-gray-400">Premier disponible</p>
                </div>
              </button>

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
                    <span className="text-sm font-semibold text-gray-500">
                      {member.name.split(' ').map((n) => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-gray-400">
                      {member.service_ids.length} services
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Choose date & time ═══ */}
        {step === 3 && (
          <div>
            <h1 className="text-xl font-semibold mb-1">Choisissez un créneau</h1>
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
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => !isPast && setSelectedDate(day)}
                      disabled={isPast}
                      className={`flex flex-col items-center py-2.5 rounded-xl text-center transition-all duration-200 ${
                        isSelected
                          ? 'bg-gray-900 text-white'
                          : isPast
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
                Créneaux disponibles — {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
              </p>
              {timeSlots.filter((s) => s.available).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  Aucun créneau disponible pour cette date
                </p>
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
            <h1 className="text-xl font-semibold mb-1">Vos informations</h1>
            <p className="text-sm text-gray-500 mb-6">
              Renseignez vos coordonnées pour confirmer
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

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleBooking()
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  Nom complet *
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
                  Email *
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
                  Téléphone *
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
                className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors mt-2"
              >
                Confirmer le rendez-vous
              </button>
            </form>
          </div>
        )}

        {/* ═══ STEP 5: Confirmation ═══ */}
        {step === 5 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <Check size={28} className="text-green-600" />
            </div>
            <h1 className="text-xl font-semibold mb-2">Rendez-vous confirmé !</h1>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              Vous recevrez un email de confirmation avec tous les détails de votre rendez-vous.
            </p>

            <div className="bg-white rounded-xl border border-gray-200 p-5 text-left max-w-sm mx-auto">
              <p className="text-sm font-semibold mb-3">{selectedService?.name}</p>
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <User size={13} />
                  {selectedStaff?.name}
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={13} />
                  {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })} à {selectedTime}
                </div>
                <div className="flex items-center gap-2">
                  <Euro size={13} />
                  &euro;{selectedService?.price}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setStep(1)
                setSelectedService(null)
                setSelectedStaff(null)
                setSelectedTime(null)
                setClientForm({ name: '', email: '', phone: '' })
              }}
              className="mt-6 px-6 py-2.5 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Prendre un autre rendez-vous
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
