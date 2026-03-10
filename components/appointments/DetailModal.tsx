'use client'

import { useState, useEffect } from 'react'
import { X, Check, XCircle, AlertTriangle, Phone, Mail, Clock, User } from 'lucide-react'
import type { Appointment, AppointmentStatus } from '@/types/appointments'
import { api } from '@/lib/use-api'

const statusConfig: Record<AppointmentStatus, { bg: string; text: string; label: string }> = {
  confirmed: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Confirmé' },
  completed: { bg: 'bg-green-50', text: 'text-green-700', label: 'Terminé' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-700', label: 'Annulé' },
  no_show: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Absent' },
}

interface AppointmentDetailModalProps {
  appointment: Appointment | null
  onClose: () => void
  onStatusChange: (id: string, status: AppointmentStatus) => void
}

export default function AppointmentDetailModal({
  appointment,
  onClose,
  onStatusChange,
}: AppointmentDetailModalProps) {
  const [noShowCount, setNoShowCount] = useState(0)

  // Fetch no-show count when modal opens with a client email
  useEffect(() => {
    if (!appointment?.client_email) {
      setNoShowCount(0)
      return
    }
    api<{ noShowCount: number }>(
      `/api/appointments/no-show-stats?email=${encodeURIComponent(appointment.client_email)}`
    ).then((res) => {
      setNoShowCount(res.data?.noShowCount ?? 0)
    })
  }, [appointment?.id, appointment?.client_email])

  if (!appointment) return null

  const config = statusConfig[appointment.status]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Détails du rendez-vous</h2>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
              {config.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* No-show warning banner */}
          {noShowCount >= 2 && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${
              noShowCount >= 3
                ? 'bg-red-50 border border-red-200'
                : 'bg-orange-50 border border-orange-200'
            }`}>
              <AlertTriangle size={14} className={noShowCount >= 3 ? 'text-red-600' : 'text-orange-600'} />
              <p className={`text-xs font-medium ${noShowCount >= 3 ? 'text-red-700' : 'text-orange-700'}`}>
                Ce client a {noShowCount} absence{noShowCount > 1 ? 's' : ''} enregistrée{noShowCount > 1 ? 's' : ''}
                {noShowCount >= 3 && ' — client à risque'}
              </p>
            </div>
          )}

          {/* Service + Time */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm font-semibold">
              {appointment.service?.name || 'Service'}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock size={13} />
                {appointment.start_time} – {appointment.end_time}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <User size={13} />
                {appointment.staff?.name || 'Employé'}
              </div>
            </div>
          </div>

          {/* Client info */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-500">Client</p>
              {noShowCount >= 1 && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  noShowCount >= 3
                    ? 'bg-red-100 text-red-700'
                    : noShowCount >= 2
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {noShowCount} absence{noShowCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-sm font-medium">{appointment.client_name}</p>
            {appointment.client_email && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                <Mail size={12} />
                {appointment.client_email}
              </div>
            )}
            {appointment.client_phone && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                <Phone size={12} />
                {appointment.client_phone}
              </div>
            )}
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-500">{appointment.notes}</p>
            </div>
          )}

          {/* Actions */}
          {appointment.status === 'confirmed' && (
            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => onStatusChange(appointment.id, 'completed')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <Check size={14} />
                Terminé
              </button>
              <button
                onClick={() => onStatusChange(appointment.id, 'no_show')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-sm font-medium hover:bg-orange-100 transition-colors"
              >
                <AlertTriangle size={14} />
                Absent
              </button>
              <button
                onClick={() => onStatusChange(appointment.id, 'cancelled')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <XCircle size={14} />
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
