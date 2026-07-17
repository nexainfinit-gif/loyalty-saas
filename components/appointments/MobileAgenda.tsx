'use client'

import { useMemo, useRef, useState } from 'react'
import { format, addDays, startOfWeek, isSameDay, parseISO, parse, differenceInMinutes } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CalendarX2 } from 'lucide-react'
import type { Appointment, StaffMember } from '@/types/appointments'
import { STATUS_STYLES } from './AppointmentCard'

/**
 * Agenda mobile — liste chronologique (pattern Fresha/Planity) :
 * bandeau semaine (7 pastilles) + chips de filtre par membre + timeline du
 * jour + FAB « nouveau RDV ». La grille multi-colonnes reste le mode desktop
 * (CalendarView) ; sous lg, elle était illisible (colonnes 120px, texte 9px,
 * création au hover impossible au toucher).
 */

// Rotation de couleurs des avatars — identique à la grille desktop.
const AVATAR_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  { bg: 'bg-violet-100', text: 'text-violet-600' },
  { bg: 'bg-sky-100',    text: 'text-sky-600' },
  { bg: 'bg-amber-100',  text: 'text-amber-600' },
  { bg: 'bg-rose-100',   text: 'text-rose-600' },
  { bg: 'bg-teal-100',   text: 'text-teal-600' },
]

const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface MobileAgendaProps {
  appointments: Appointment[]
  staff: StaffMember[]
  selectedDate: Date
  onDateChange: (date: Date) => void
  onAppointmentClick: (appointment: Appointment) => void
  onNewAppointment: () => void
}

export default function MobileAgenda({
  appointments,
  staff,
  selectedDate,
  onDateChange,
  onAppointmentClick,
  onNewAppointment,
}: MobileAgendaProps) {
  // Filtre membre (null = tous) — persiste en changeant de jour.
  const [staffFilter, setStaffFilter] = useState<string | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [selectedDate])

  const today = new Date()
  const isToday = isSameDay(selectedDate, today)

  const staffById = useMemo(
    () => Object.fromEntries(staff.map((s, i) => [s.id, { ...s, color: AVATAR_COLORS[i % AVATAR_COLORS.length] }])),
    [staff],
  )

  // RDV du jour sélectionné, triés chronologiquement.
  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(parseISO(a.date), selectedDate))
        .filter((a) => (staffFilter ? a.staff_id === staffFilter : true))
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [appointments, selectedDate, staffFilter],
  )

  // Compteur de RDV (hors annulés) par membre, pour les chips.
  const countsByStaff = useMemo(() => {
    const counts: Record<string, number> = {}
    appointments
      .filter((a) => isSameDay(parseISO(a.date), selectedDate) && a.status !== 'cancelled')
      .forEach((a) => { counts[a.staff_id] = (counts[a.staff_id] ?? 0) + 1 })
    return counts
  }, [appointments, selectedDate])

  const nowMinutes = today.getHours() * 60 + today.getMinutes()
  const toMinutes = (time: string) => {
    const d = parse(time, 'HH:mm', new Date())
    return d.getHours() * 60 + d.getMinutes()
  }
  // Index du premier RDV à venir — le marqueur « maintenant » s'insère devant.
  const nowIndex = isToday ? dayAppointments.findIndex((a) => toMinutes(a.start_time) > nowMinutes) : -1
  const nowTimeStr = format(today, 'HH:mm')

  const durationOf = (a: Appointment) =>
    differenceInMinutes(parse(a.end_time, 'HH:mm', new Date()), parse(a.start_time, 'HH:mm', new Date()))

  // Navigation au geste : swipe horizontal = jour précédent/suivant.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) > 56 && Math.abs(dy) < 48) onDateChange(addDays(selectedDate, dx < 0 ? 1 : -1))
  }

  const NowMarker = () => (
    <div className="flex items-center gap-2 py-1" aria-label="Heure actuelle">
      <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums shrink-0">
        {nowTimeStr}
      </span>
      <div className="flex-1 h-px bg-rose-400/60" />
    </div>
  )

  return (
    <div className="lg:hidden">
      {/* ── Bandeau semaine ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-3 pt-3 pb-2 mb-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[15px] font-semibold text-gray-900 capitalize">
            {format(selectedDate, 'MMMM yyyy', { locale: fr })}
          </p>
          {!isToday && (
            <button
              onClick={() => onDateChange(new Date())}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-gray-100 text-gray-600 active:bg-gray-200 transition-colors"
            >
              Aujourd&apos;hui
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onDateChange(addDays(selectedDate, -7))}
            aria-label="Semaine précédente"
            className="w-8 h-11 shrink-0 flex items-center justify-center rounded-lg text-gray-400 active:bg-gray-50"
          >
            <ChevronLeft size={16} />
          </button>

          {weekDays.map((day, i) => {
            const selected = isSameDay(day, selectedDate)
            const isDayToday = isSameDay(day, today)
            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateChange(day)}
                className={`flex-1 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  selected ? 'bg-indigo-500 text-white shadow-sm' : 'active:bg-gray-50'
                }`}
              >
                <span className={`text-[10px] font-medium leading-none ${selected ? 'text-white/70' : 'text-gray-400'}`}>
                  {DAY_LETTERS[i]}
                </span>
                <span
                  className={`text-[15px] font-semibold leading-none tabular-nums ${
                    selected ? 'text-white' : isDayToday ? 'text-indigo-500' : 'text-gray-700'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {isDayToday && !selected && <span className="w-1 h-1 rounded-full bg-indigo-500" />}
              </button>
            )
          })}

          <button
            onClick={() => onDateChange(addDays(selectedDate, 7))}
            aria-label="Semaine suivante"
            className="w-8 h-11 shrink-0 flex items-center justify-center rounded-lg text-gray-400 active:bg-gray-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Chips filtre membre ── */}
      {staff.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-3 -mx-1 px-1">
          <button
            onClick={() => setStaffFilter(null)}
            className={`shrink-0 h-9 px-3.5 rounded-full text-[12px] font-semibold border transition-colors ${
              staffFilter === null
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
            }`}
          >
            Tous
          </button>
          {staff.map((s) => {
            const color = staffById[s.id].color
            const active = staffFilter === s.id
            return (
              <button
                key={s.id}
                onClick={() => setStaffFilter(active ? null : s.id)}
                className={`shrink-0 h-9 pl-1.5 pr-3 rounded-full text-[12px] font-medium border flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                    : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                }`}
              >
                <span className={`w-6 h-6 rounded-full ${color.bg} flex items-center justify-center`}>
                  <span className={`text-[9px] font-bold ${color.text}`}>
                    {s.name.split(' ').map((n) => n[0]).join('')}
                  </span>
                </span>
                {s.name.split(' ')[0]}
                {(countsByStaff[s.id] ?? 0) > 0 && (
                  <span className={`text-[10px] tabular-nums ${active ? 'text-indigo-400' : 'text-gray-400'}`}>
                    {countsByStaff[s.id]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Timeline du jour (swipe ← → pour changer de jour) ── */}
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="min-h-[40vh] pb-24">
        {dayAppointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <CalendarX2 size={22} className="text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-700">Aucun rendez-vous</p>
            <p className="text-[12px] text-gray-400 mt-1 capitalize">
              {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
            </p>
            <button
              onClick={onNewAppointment}
              className="mt-5 px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-[13px] font-semibold active:bg-indigo-600 transition-colors"
            >
              Nouveau rendez-vous
            </button>
          </div>
        ) : (
          <div key={format(selectedDate, 'yyyy-MM-dd') + (staffFilter ?? '')} className="animate-fade-up space-y-2">
            {isToday && nowIndex === 0 && <NowMarker />}
            {dayAppointments.map((appt, i) => {
              const style = STATUS_STYLES[appt.status]
              const isCancelled = appt.status === 'cancelled'
              const member = staffById[appt.staff_id]
              return (
                <div key={appt.id}>
                  {isToday && nowIndex === i && i > 0 && <NowMarker />}
                  <div className="flex gap-2.5">
                    {/* Rail horaire */}
                    <div className="w-[46px] shrink-0 pt-2.5 text-right">
                      <p className={`text-[13px] font-bold tabular-nums leading-tight ${isCancelled ? 'text-gray-300' : 'text-gray-900'}`}>
                        {appt.start_time}
                      </p>
                      <p className="text-[10px] text-gray-400 tabular-nums leading-tight mt-0.5">{appt.end_time}</p>
                    </div>

                    {/* Carte RDV — cible tactile pleine largeur */}
                    <button
                      onClick={() => onAppointmentClick(appt)}
                      className={`flex-1 min-w-0 text-left rounded-xl border border-gray-100 border-l-[3px] ${style.border} bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-3.5 py-2.5 active:bg-gray-50 transition-colors ${isCancelled ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[14px] font-semibold text-gray-900 truncate ${isCancelled ? 'line-through' : ''}`}>
                          {appt.client_name}
                        </p>
                        {appt.status !== 'confirmed' && (
                          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-500 truncate mt-0.5">
                        {appt.service?.name ?? 'Prestation'}
                        <span className="text-gray-300"> · {durationOf(appt)} min</span>
                      </p>
                      {!staffFilter && member && (
                        <span className="inline-flex items-center gap-1.5 mt-1.5">
                          <span className={`w-4 h-4 rounded-full ${member.color.bg} flex items-center justify-center`}>
                            <span className={`text-[8px] font-bold ${member.color.text}`}>
                              {member.name.split(' ').map((n: string) => n[0]).join('')}
                            </span>
                          </span>
                          <span className="text-[11px] text-gray-400">{member.name.split(' ')[0]}</span>
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
            {isToday && nowIndex === -1 && dayAppointments.length > 0 && <NowMarker />}
          </div>
        )}
      </div>

      {/* ── FAB nouveau RDV — zone du pouce ── */}
      <button
        onClick={onNewAppointment}
        aria-label="Nouveau rendez-vous"
        className="fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(99,102,241,0.4)] active:scale-95 active:bg-indigo-600 transition-all"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  )
}
