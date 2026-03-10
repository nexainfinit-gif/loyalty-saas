'use client'

import type { Appointment, AppointmentStatus } from '@/types/appointments'

const STATUS_STYLES: Record<AppointmentStatus, { border: string; bg: string; text: string; label: string }> = {
  confirmed:  { border: 'border-l-blue-500',    bg: 'bg-blue-50/60',    text: 'text-blue-700',    label: 'Confirmé' },
  completed:  { border: 'border-l-emerald-500',  bg: 'bg-emerald-50/60',  text: 'text-emerald-700',  label: 'Terminé' },
  cancelled:  { border: 'border-l-red-400',      bg: 'bg-red-50/40',      text: 'text-red-400',      label: 'Annulé' },
  no_show:    { border: 'border-l-orange-500',   bg: 'bg-orange-50/60',   text: 'text-orange-700',   label: 'Absent' },
}

interface AppointmentCardProps {
  appointment: Appointment
  onClick: () => void
  heightPx: number
}

export default function AppointmentCard({ appointment, onClick, heightPx }: AppointmentCardProps) {
  const style = STATUS_STYLES[appointment.status]
  const isCancelled = appointment.status === 'cancelled'

  // Auto-select variant based on pixel height
  // mini: single line (<32px), compact: 2 lines (<52px), full: 3 lines
  if (heightPx < 32) {
    return (
      <button
        onClick={onClick}
        className={`w-full h-full rounded-md border-l-[3px] ${style.border} ${style.bg} px-1.5 flex items-center gap-1 text-left cursor-pointer transition-shadow hover:shadow-sm ${isCancelled ? 'opacity-50' : ''}`}
      >
        <span className={`text-[10px] font-semibold ${style.text} shrink-0`}>
          {appointment.start_time}
        </span>
        <span className={`text-[10px] font-medium text-gray-700 truncate ${isCancelled ? 'line-through' : ''}`}>
          {appointment.client_name}
        </span>
      </button>
    )
  }

  if (heightPx < 52) {
    return (
      <button
        onClick={onClick}
        className={`w-full h-full rounded-md border-l-[3px] ${style.border} ${style.bg} px-1.5 py-0.5 text-left cursor-pointer transition-shadow hover:shadow-sm overflow-hidden ${isCancelled ? 'opacity-50' : ''}`}
      >
        <p className={`text-[10px] font-semibold ${style.text} leading-tight`}>
          {appointment.start_time} – {appointment.end_time}
        </p>
        <p className={`text-[10px] font-medium text-gray-800 truncate leading-tight ${isCancelled ? 'line-through' : ''}`}>
          {appointment.client_name}
        </p>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`w-full h-full rounded-md border-l-[3px] ${style.border} ${style.bg} px-1.5 py-0.5 text-left cursor-pointer transition-shadow hover:shadow-sm overflow-hidden ${isCancelled ? 'opacity-50' : ''}`}
    >
      <p className={`text-[10px] font-semibold ${style.text} leading-tight`}>
        {appointment.start_time} – {appointment.end_time}
      </p>
      <p className={`text-[11px] font-semibold text-gray-800 truncate leading-tight ${isCancelled ? 'line-through' : ''}`}>
        {appointment.client_name}
      </p>
      {appointment.service && (
        <p className="text-[10px] text-gray-500 truncate leading-tight">
          {appointment.service.name}{appointment.service.price ? ` · €${appointment.service.price}` : ''}
        </p>
      )}
    </button>
  )
}

export { STATUS_STYLES }
