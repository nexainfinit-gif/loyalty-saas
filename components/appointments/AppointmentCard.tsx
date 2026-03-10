'use client'

import type { Appointment, AppointmentStatus } from '@/types/appointments'

const statusConfig: Record<AppointmentStatus, { bg: string; text: string; label: string }> = {
  confirmed: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Confirmé' },
  completed: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Terminé' },
  cancelled: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Annulé' },
  no_show: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', label: 'Absent' },
}

interface AppointmentCardProps {
  appointment: Appointment
  onClick: () => void
  compact?: boolean
  mini?: boolean
}

export default function AppointmentCard({ appointment, onClick, compact, mini }: AppointmentCardProps) {
  const config = statusConfig[appointment.status]

  if (mini) {
    return (
      <button
        onClick={onClick}
        className={`w-full h-full rounded-md border px-1.5 py-0.5 text-left cursor-pointer transition-all hover:shadow-sm ${config.bg}`}
      >
        <p className={`text-[10px] font-medium truncate ${config.text}`}>
          {appointment.start_time} {appointment.client_name}
        </p>
      </button>
    )
  }

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`w-full h-full rounded-lg border px-2.5 py-1.5 text-left cursor-pointer transition-all hover:shadow-md ${config.bg}`}
      >
        <p className={`text-[11px] font-semibold ${config.text}`}>
          {appointment.start_time} – {appointment.end_time}
        </p>
        <p className="text-[11px] font-medium text-gray-900 truncate mt-0.5">
          {appointment.client_name}
        </p>
        {appointment.service && (
          <p className="text-[10px] text-gray-400 truncate">
            {appointment.service.name}
          </p>
        )}
      </button>
    )
  }

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
          {config.label}
        </span>
        <span className="text-xs text-gray-400">
          {appointment.start_time} – {appointment.end_time}
        </span>
      </div>
      <p className="text-sm font-semibold">{appointment.client_name}</p>
      {appointment.service && (
        <p className="text-xs text-gray-500 mt-1">{appointment.service.name}</p>
      )}
      {appointment.staff && (
        <p className="text-xs text-gray-400 mt-0.5">avec {appointment.staff.name}</p>
      )}
    </div>
  )
}
