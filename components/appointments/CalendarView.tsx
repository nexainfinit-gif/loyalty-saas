'use client'

import { useState, useMemo } from 'react'
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
}

const HOUR_HEIGHT = 60 // px per hour
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
}: CalendarViewProps) {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [selectedDate])

  const visibleDays = view === 'day' ? [selectedDate] : weekDays

  const getAppointmentsForStaffAndDay = (staffId: string, day: Date) =>
    appointments.filter(
      (a) => a.staff_id === staffId && isSameDay(parseISO(a.date), day) && a.status !== 'cancelled'
    )

  const getAppointmentStyle = (appointment: Appointment) => {
    const start = parse(appointment.start_time, 'HH:mm', new Date())
    const end = parse(appointment.end_time, 'HH:mm', new Date())
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const duration = differenceInMinutes(end, start)
    const top = ((startMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
    const height = (duration / 60) * HOUR_HEIGHT
    return { top: `${top}px`, height: `${Math.max(height, 24)}px` }
  }

  const navigateDate = (direction: number) => {
    const days = view === 'day' ? 1 : 7
    onDateChange(addDays(selectedDate, direction * days))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateDate(-1)}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => onDateChange(new Date())}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => navigateDate(1)}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <h2 className="text-sm font-semibold ml-2">
            {view === 'day'
              ? format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })
              : `${format(weekDays[0], 'd MMM', { locale: fr })} — ${format(weekDays[6], 'd MMM yyyy', { locale: fr })}`}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-50 rounded-lg p-0.5">
            {(['day', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onViewChange(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  view === v
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {v === 'day' ? 'Jour' : 'Semaine'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        {view === 'day' ? (
          <div className="min-w-[640px]">
            {/* Staff header */}
            <div className="flex border-b border-gray-200">
              <div className="w-16 shrink-0" />
              {staff.map((s) => (
                <div
                  key={s.id}
                  className="flex-1 min-w-[180px] px-3 py-3 border-l border-gray-200 text-center"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-50 mx-auto mb-1 flex items-center justify-center">
                    <span className="text-[11px] font-semibold text-gray-500">
                      {s.name.split(' ').map((n) => n[0]).join('')}
                    </span>
                  </div>
                  <p className="text-xs font-medium">{s.name}</p>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div className="flex relative">
              <div className="w-16 shrink-0">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-gray-200"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="text-[10px] text-gray-400 px-2 -translate-y-2 block">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {staff.map((s) => {
                const staffAppts = getAppointmentsForStaffAndDay(s.id, selectedDate)
                return (
                  <div
                    key={s.id}
                    className="flex-1 min-w-[180px] border-l border-gray-200 relative"
                  >
                    {HOURS.map((hour) => {
                      const slotKey = `${s.id}-${hour}`
                      return (
                        <div
                          key={hour}
                          className={`border-b border-gray-200 cursor-pointer transition-colors duration-150 ${
                            hoveredSlot === slotKey ? 'bg-blue-50/50' : ''
                          }`}
                          style={{ height: `${HOUR_HEIGHT}px` }}
                          onMouseEnter={() => setHoveredSlot(slotKey)}
                          onMouseLeave={() => setHoveredSlot(null)}
                          onClick={() =>
                            onCreateAppointment(
                              s.id,
                              selectedDate,
                              `${String(hour).padStart(2, '0')}:00`
                            )
                          }
                        >
                          {hoveredSlot === slotKey && (
                            <div className="flex items-center justify-center h-full opacity-40">
                              <Plus size={14} />
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {staffAppts.map((appt) => (
                      <div
                        key={appt.id}
                        className="absolute left-1 right-1 z-10"
                        style={getAppointmentStyle(appt)}
                      >
                        <AppointmentCard
                          appointment={appt}
                          onClick={() => onAppointmentClick(appt)}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="min-w-[800px]">
            {/* Day headers */}
            <div className="flex border-b border-gray-200">
              <div className="w-16 shrink-0" />
              {visibleDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`flex-1 min-w-[100px] px-2 py-3 border-l border-gray-200 text-center cursor-pointer hover:bg-gray-50 transition-colors ${
                    isSameDay(day, new Date()) ? 'bg-blue-50/50' : ''
                  }`}
                  onClick={() => {
                    onDateChange(day)
                    onViewChange('day')
                  }}
                >
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">
                    {format(day, 'EEE', { locale: fr })}
                  </p>
                  <p
                    className={`text-lg font-semibold mt-0.5 ${
                      isSameDay(day, new Date())
                        ? 'text-primary-600'
                        : ''
                    }`}
                  >
                    {format(day, 'd')}
                  </p>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div className="flex relative">
              <div className="w-16 shrink-0">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-gray-200"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="text-[10px] text-gray-400 px-2 -translate-y-2 block">
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {visibleDays.map((day) => {
                const dayAppts = appointments.filter(
                  (a) => isSameDay(parseISO(a.date), day) && a.status !== 'cancelled'
                )
                return (
                  <div
                    key={day.toISOString()}
                    className="flex-1 min-w-[100px] border-l border-gray-200 relative"
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="border-b border-gray-200"
                        style={{ height: `${HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {dayAppts.map((appt) => (
                      <div
                        key={appt.id}
                        className="absolute left-0.5 right-0.5 z-10"
                        style={getAppointmentStyle(appt)}
                      >
                        <AppointmentCard
                          appointment={appt}
                          onClick={() => onAppointmentClick(appt)}
                          compact
                          mini
                        />
                      </div>
                    ))}
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
