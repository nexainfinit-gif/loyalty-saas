'use client'

import type { Appointment, AppointmentStatus } from '@/types/appointments'

// Modern, soft color system — left border accent only
// Confirmed = brand/indigo (default), Completed = emerald, No-show = rose, Cancelled = gray+muted
const STATUS_STYLES: Record<AppointmentStatus, { border: string; bg: string; text: string; label: string }> = {
  confirmed:  { border: 'border-l-indigo-400',   bg: 'bg-indigo-50/70',   text: 'text-indigo-600',   label: 'Confirmé' },
  completed:  { border: 'border-l-emerald-400',  bg: 'bg-emerald-50/70',  text: 'text-emerald-600',  label: 'Terminé' },
  cancelled:  { border: 'border-l-gray-300',     bg: 'bg-gray-50/80',     text: 'text-gray-400',     label: 'Annulé' },
  no_show:    { border: 'border-l-rose-400',     bg: 'bg-rose-50/70',     text: 'text-rose-600',     label: 'Absent' },
}

interface AppointmentCardProps {
  appointment: Appointment
  onClick: () => void
  heightPx: number
}

export default function AppointmentCard({ appointment, onClick, heightPx }: AppointmentCardProps) {
  const style = STATUS_STYLES[appointment.status]
  const isCancelled = appointment.status === 'cancelled'

  const baseClasses = `w-full h-full rounded-[5px] border-l-[3px] ${style.border} ${style.bg} text-left cursor-pointer transition-all duration-100 hover:shadow-[0_1px_4px_rgba(0,0,0,0.08)] hover:brightness-[0.98] ${isCancelled ? 'opacity-45' : ''}`

  // Mini: single line (<28px)
  if (heightPx < 28) {
    return (
      <button onClick={onClick} className={`${baseClasses} px-1.5 flex items-center gap-1`}>
        <span className={`text-[9px] font-bold ${style.text} shrink-0 tabular-nums`}>
          {appointment.start_time}
        </span>
        <span className={`text-[9px] font-medium text-gray-600 truncate ${isCancelled ? 'line-through' : ''}`}>
          {appointment.client_name}
        </span>
      </button>
    )
  }

  // Compact: 2 lines (<48px)
  if (heightPx < 48) {
    return (
      <button onClick={onClick} className={`${baseClasses} px-1.5 py-[3px] overflow-hidden`}>
        <p className={`text-[9px] font-bold ${style.text} leading-[1.1] tabular-nums`}>
          {appointment.start_time} – {appointment.end_time}
        </p>
        <p className={`text-[10px] font-semibold text-gray-700 truncate leading-[1.2] mt-px ${isCancelled ? 'line-through' : ''}`}>
          {appointment.client_name}
        </p>
      </button>
    )
  }

  // Full: 3 lines
  return (
    <button onClick={onClick} className={`${baseClasses} px-1.5 py-[3px] overflow-hidden`}>
      <p className={`text-[9px] font-bold ${style.text} leading-[1.1] tabular-nums`}>
        {appointment.start_time} – {appointment.end_time}
      </p>
      <p className={`text-[10px] font-semibold text-gray-700 truncate leading-[1.2] mt-px ${isCancelled ? 'line-through' : ''}`}>
        {appointment.client_name}
      </p>
      {appointment.service && (
        <p className="text-[9px] text-gray-400 truncate leading-[1.2] mt-px">
          {appointment.service.name}
        </p>
      )}
    </button>
  )
}

export { STATUS_STYLES }
