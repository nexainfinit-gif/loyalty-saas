'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  parseISO,
  differenceInMinutes,
  parse,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Appointment, StaffMember, CalendarView } from '@/types/appointments'
import AppointmentCard from './AppointmentCard'

interface CalendarViewProps {
  appointments: Appointment[]
  staff: StaffMember[]
  selectedDate: Date
  onDateChange: (date: Date) => void
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  onCreateAppointment: (staffId: string, date: Date, time: string) => void
  onAppointmentClick: (appointment: Appointment) => void
  onNewAppointment: () => void
}

const HOUR_HEIGHT = 48
const START_HOUR = 8
const END_HOUR = 20
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)

export default function CalendarViewComponent({
  appointments,
  staff,
  selectedDate,
  onDateChange,
  view,
  onViewChange,
  onCreateAppointment,
  onAppointmentClick,
  onNewAppointment,
}: CalendarViewProps) {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })

  // Update "now" indicator every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date()
      setNowMinutes(n.getHours() * 60 + n.getMinutes())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [selectedDate])

  const visibleDays = view === 'day' ? [selectedDate] : weekDays

  const isToday = isSameDay(selectedDate, new Date())
  const showNowLine = isToday && nowMinutes >= START_HOUR * 60 && nowMinutes < END_HOUR * 60
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT

  const getAppointmentsForStaffAndDay = (staffId: string, day: Date) =>
    appointments.filter(
      (a) => a.staff_id === staffId && isSameDay(parseISO(a.date), day)
    )

  const getAppointmentPosition = (appointment: Appointment) => {
    const start = parse(appointment.start_time, 'HH:mm', new Date())
    const end = parse(appointment.end_time, 'HH:mm', new Date())
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const duration = differenceInMinutes(end, start)
    const top = ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
    const height = (duration / 60) * HOUR_HEIGHT
    return { top, height: Math.max(height, 20) }
  }

  const navigateDate = (direction: number) => {
    const days = view === 'day' ? 1 : 7
    onDateChange(addDays(selectedDate, direction * days))
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 't' || e.key === 'T') onDateChange(new Date())
      if (e.key === 'ArrowLeft') navigateDate(-1)
      if (e.key === 'ArrowRight') navigateDate(1)
      if (e.key === 'n' || e.key === 'N') onNewAppointment()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedDate])

  // Count appointments per staff for today
  const staffApptCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    staff.forEach((s) => {
      counts[s.id] = getAppointmentsForStaffAndDay(s.id, selectedDate)
        .filter((a) => a.status !== 'cancelled').length
    })
    return counts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, appointments, selectedDate])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 160px)', minHeight: '500px' }}>
      {/* ── Toolbar — 44px single line ── */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateDate(-1)}
            className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => onDateChange(new Date())}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => navigateDate(1)}
            className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <h2 className="text-[13px] font-semibold ml-1 capitalize">
            {view === 'day'
              ? format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })
              : `${format(weekDays[0], 'd MMM', { locale: fr })} — ${format(weekDays[6], 'd MMM yyyy', { locale: fr })}`}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-md p-0.5">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-all duration-150 ${
                  view === v
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v === 'day' ? 'Jour' : 'Semaine'}
              </button>
            ))}
          </div>
          {/* Primary CTA */}
          <button
            onClick={onNewAppointment}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 text-white text-[11px] font-semibold hover:bg-primary-700 transition-colors"
          >
            <Plus size={13} />
            Nouveau RDV
          </button>
        </div>
      </div>

      {/* ── Calendar body ── */}
      <div className="flex-1 overflow-auto">
        {view === 'day' ? (
          /* ═══ DAY VIEW — columns = staff ═══ */
          <div className="min-w-[640px]">
            {/* Sticky staff header — 48px */}
            <div className="flex sticky top-0 z-20 bg-white border-b border-gray-200">
              <div className="w-12 shrink-0" />
              {staff.map((s, i) => (
                <div
                  key={s.id}
                  className={`flex-1 min-w-[200px] px-3 py-2 border-l border-gray-200 flex items-center gap-2.5 ${
                    i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-primary-700">
                      {s.name.split(' ').map((n) => n[0]).join('')}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-gray-900 truncate">{s.name}</p>
                    <p className="text-[10px] text-gray-400">{staffApptCounts[s.id] || 0} rdv</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div className="flex relative">
              {/* Time labels — sticky left */}
              <div className="w-12 shrink-0 sticky left-0 z-10 bg-white">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-gray-100 relative"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="absolute -top-[7px] right-2 text-[10px] font-medium text-gray-400">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Staff columns */}
              {staff.map((s, colIndex) => {
                const staffAppts = getAppointmentsForStaffAndDay(s.id, selectedDate)
                const isAlt = colIndex % 2 === 1
                return (
                  <div
                    key={s.id}
                    className={`flex-1 min-w-[200px] border-l border-gray-200 relative ${isAlt ? 'bg-gray-50/40' : ''}`}
                  >
                    {/* Hour rows */}
                    {HOURS.map((hour) => {
                      const slotKey = `${s.id}-${hour}`
                      const isHovered = hoveredSlot === slotKey
                      return (
                        <div
                          key={hour}
                          className={`border-b border-gray-100 cursor-pointer transition-colors duration-100 ${
                            isHovered ? 'bg-primary-50/40' : ''
                          }`}
                          style={{ height: `${HOUR_HEIGHT}px` }}
                          onMouseEnter={() => setHoveredSlot(slotKey)}
                          onMouseLeave={() => setHoveredSlot(null)}
                          onClick={() =>
                            onCreateAppointment(s.id, selectedDate, `${String(hour).padStart(2, '0')}:00`)
                          }
                        >
                          {isHovered && (
                            <div className="flex items-center gap-1 px-2 pt-0.5 opacity-50">
                              <Plus size={10} className="text-primary-600" />
                              <span className="text-[10px] text-primary-600 font-medium">
                                {String(hour).padStart(2, '0')}:00
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Appointment blocks */}
                    {staffAppts.map((appt) => {
                      const pos = getAppointmentPosition(appt)
                      return (
                        <div
                          key={appt.id}
                          className="absolute left-0.5 right-1 z-10"
                          style={{ top: `${pos.top}px`, height: `${pos.height}px` }}
                        >
                          <AppointmentCard
                            appointment={appt}
                            onClick={() => onAppointmentClick(appt)}
                            heightPx={pos.height}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Current time indicator */}
              {showNowLine && (
                <div
                  className="absolute left-0 right-0 z-30 pointer-events-none"
                  style={{ top: `${nowTop}px` }}
                >
                  <div className="relative flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                    <div className="flex-1 border-t-2 border-red-500" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ═══ WEEK VIEW — columns = days ═══ */
          <div className="min-w-[800px]">
            {/* Sticky day headers */}
            <div className="flex sticky top-0 z-20 bg-white border-b border-gray-200">
              <div className="w-12 shrink-0" />
              {visibleDays.map((day, i) => {
                const isDayToday = isSameDay(day, new Date())
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 min-w-[100px] px-2 py-2 border-l border-gray-200 text-center cursor-pointer hover:bg-gray-50 transition-colors ${
                      isDayToday ? 'bg-primary-50/40' : i % 2 === 1 ? 'bg-gray-50/30' : ''
                    }`}
                    onClick={() => { onDateChange(day); onViewChange('day') }}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                      {format(day, 'EEE', { locale: fr })}
                    </p>
                    <p className={`text-base font-semibold mt-0.5 ${isDayToday ? 'text-primary-600' : 'text-gray-900'}`}>
                      {format(day, 'd')}
                    </p>
                  </div>
                )
              })}
            </div>

            {/* Time grid */}
            <div className="flex relative">
              <div className="w-12 shrink-0 sticky left-0 z-10 bg-white">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-gray-100 relative"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="absolute -top-[7px] right-2 text-[10px] font-medium text-gray-400">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {visibleDays.map((day, i) => {
                const dayAppts = appointments.filter(
                  (a) => isSameDay(parseISO(a.date), day)
                )
                const isDayToday = isSameDay(day, new Date())
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 min-w-[100px] border-l border-gray-200 relative ${
                      isDayToday ? 'bg-primary-50/20' : i % 2 === 1 ? 'bg-gray-50/30' : ''
                    }`}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-gray-100"
                        style={{ height: `${HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {dayAppts.map((appt) => {
                      const pos = getAppointmentPosition(appt)
                      return (
                        <div
                          key={appt.id}
                          className="absolute left-0.5 right-0.5 z-10"
                          style={{ top: `${pos.top}px`, height: `${pos.height}px` }}
                        >
                          <AppointmentCard
                            appointment={appt}
                            onClick={() => onAppointmentClick(appt)}
                            heightPx={pos.height}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
