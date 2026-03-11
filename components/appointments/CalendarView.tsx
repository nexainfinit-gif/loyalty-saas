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

// Staff avatar color rotation (soft, professional)
const AVATAR_COLORS = [
  { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  { bg: 'bg-violet-100', text: 'text-violet-600' },
  { bg: 'bg-sky-100',    text: 'text-sky-600' },
  { bg: 'bg-amber-100',  text: 'text-amber-600' },
  { bg: 'bg-rose-100',   text: 'text-rose-600' },
  { bg: 'bg-teal-100',   text: 'text-teal-600' },
]

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
  const nowTimeStr = `${String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:${String(nowMinutes % 60).padStart(2, '0')}`

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
    return { top, height: Math.max(height, 18) }
  }

  const navigateDate = (direction: number) => {
    const days = view === 'day' ? 1 : 7
    onDateChange(addDays(selectedDate, direction * days))
  }

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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: '480px' }}>
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 py-2 sm:py-0 sm:h-11 gap-2 sm:gap-0 border-b border-gray-100 shrink-0 bg-white">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigateDate(-1)}
            className="w-9 h-9 sm:w-7 sm:h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => onDateChange(new Date())}
            className="px-2.5 py-1.5 sm:py-1 text-[11px] font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => navigateDate(1)}
            className="w-9 h-9 sm:w-7 sm:h-7 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500"
          >
            <ChevronRight size={14} />
          </button>
          <h2 className="text-[13px] font-semibold ml-2 text-gray-800 capitalize truncate">
            {view === 'day'
              ? format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })
              : `${format(weekDays[0], 'd MMM', { locale: fr })} — ${format(weekDays[6], 'd MMM yyyy', { locale: fr })}`}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-md p-0.5">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`px-2.5 py-1.5 sm:py-1 text-[11px] font-medium rounded transition-all duration-150 ${
                  view === v
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {v === 'day' ? 'Jour' : 'Semaine'}
              </button>
            ))}
          </div>
          <button
            onClick={onNewAppointment}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-500 text-white text-[11px] font-semibold hover:bg-indigo-600 transition-colors shadow-sm"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span className="hidden sm:inline">Nouveau RDV</span>
            <span className="sm:hidden">RDV</span>
          </button>
        </div>
      </div>

      {/* ── Calendar body ── */}
      <div className="flex-1 overflow-auto">
        {view === 'day' ? (
          <div className="min-w-[400px] sm:min-w-[640px]">
            {/* Sticky staff header */}
            <div className="flex sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200">
              <div className="w-[40px] sm:w-[52px] shrink-0" />
              {staff.map((s, i) => {
                const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
                return (
                  <div
                    key={s.id}
                    className="flex-1 min-w-[120px] sm:min-w-[200px] px-2 sm:px-3 py-2 border-l border-gray-100 flex items-center gap-1.5 sm:gap-2.5"
                  >
                    <div className={`w-7 h-7 rounded-full ${color.bg} flex items-center justify-center shrink-0`}>
                      <span className={`text-[10px] font-bold ${color.text}`}>
                        {s.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] sm:text-[12px] font-semibold text-gray-800 truncate leading-tight">{s.name}</p>
                      <p className="text-[10px] text-gray-400 leading-tight">{staffApptCounts[s.id] || 0} rdv</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time grid */}
            <div className="flex relative">
              {/* Time labels */}
              <div className="w-[40px] sm:w-[52px] shrink-0 sticky left-0 z-10 bg-white">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-gray-50 relative"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="absolute -top-[6px] right-2.5 text-[10px] font-medium text-gray-300 tabular-nums">
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
                    className={`flex-1 min-w-[120px] sm:min-w-[200px] border-l border-gray-100 relative ${isAlt ? 'bg-gray-50/30' : ''}`}
                  >
                    {HOURS.map((hour) => {
                      const slotKey = `${s.id}-${hour}`
                      const isHovered = hoveredSlot === slotKey
                      return (
                        <div
                          key={hour}
                          className={`border-b border-gray-50 cursor-pointer transition-colors duration-75 ${
                            isHovered ? 'bg-indigo-50/30' : ''
                          }`}
                          style={{ height: `${HOUR_HEIGHT}px` }}
                          onMouseEnter={() => setHoveredSlot(slotKey)}
                          onMouseLeave={() => setHoveredSlot(null)}
                          onClick={() =>
                            onCreateAppointment(s.id, selectedDate, `${String(hour).padStart(2, '0')}:00`)
                          }
                        >
                          {isHovered && (
                            <div className="flex items-center gap-1 px-1.5 pt-0.5 opacity-40">
                              <Plus size={9} className="text-indigo-500" strokeWidth={2.5} />
                              <span className="text-[9px] text-indigo-500 font-semibold tabular-nums">
                                {String(hour).padStart(2, '0')}:00
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}

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

              {/* ── Current time indicator ── */}
              {showNowLine && (
                <div
                  className="absolute left-0 right-0 z-30 pointer-events-none"
                  style={{ top: `${nowTop}px` }}
                >
                  {/* Time badge on left */}
                  <div className="absolute -left-0 -top-[9px] z-40">
                    <span className="bg-rose-500 text-white text-[9px] font-bold px-1 py-[1px] rounded-sm tabular-nums shadow-sm">
                      {nowTimeStr}
                    </span>
                  </div>
                  {/* Line with dot */}
                  <div className="relative flex items-center ml-[40px] sm:ml-[52px]">
                    <div className="w-[7px] h-[7px] rounded-full bg-rose-500 -ml-[3px] shrink-0 shadow-[0_0_4px_rgba(244,63,94,0.4)]" />
                    <div className="flex-1 h-px bg-rose-400/60" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ═══ WEEK VIEW ═══ */
          <div className="min-w-[560px] sm:min-w-[800px]">
            <div className="flex sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200">
              <div className="w-[40px] sm:w-[52px] shrink-0" />
              {visibleDays.map((day, i) => {
                const isDayToday = isSameDay(day, new Date())
                return (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 min-w-[100px] px-2 py-2 border-l border-gray-100 text-center cursor-pointer hover:bg-gray-50 transition-colors ${
                      isDayToday ? 'bg-indigo-50/30' : ''
                    }`}
                    onClick={() => { onDateChange(day); onViewChange('day') }}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                      {format(day, 'EEE', { locale: fr })}
                    </p>
                    <p className={`text-base font-semibold mt-0.5 ${isDayToday ? 'text-indigo-500' : 'text-gray-800'}`}>
                      {format(day, 'd')}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="flex relative">
              <div className="w-[40px] sm:w-[52px] shrink-0 sticky left-0 z-10 bg-white">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-gray-50 relative"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="absolute -top-[6px] right-2.5 text-[10px] font-medium text-gray-300 tabular-nums">
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
                    className={`flex-1 min-w-[100px] border-l border-gray-100 relative ${
                      isDayToday ? 'bg-indigo-50/15' : i % 2 === 1 ? 'bg-gray-50/25' : ''
                    }`}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-gray-50"
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
