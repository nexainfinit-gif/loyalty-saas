'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import type { Service, StaffMember } from '@/types/appointments'

interface CreateAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    service_id: string
    staff_id: string
    date: string
    start_time: string
    client_name: string
    client_email: string
    client_phone: string
    notes: string
    recurrence_pattern: string
    recurrence_end_date: string | null
  }) => void
  services: Service[]
  staff: StaffMember[]
  initialStaffId?: string
  initialDate?: Date
  initialTime?: string
}

export default function CreateAppointmentModal({
  isOpen,
  onClose,
  onSubmit,
  services,
  staff,
  initialStaffId,
  initialDate,
  initialTime,
}: CreateAppointmentModalProps) {
  const [form, setForm] = useState({
    service_id: '',
    staff_id: initialStaffId || '',
    date: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    start_time: initialTime || '09:00',
    client_name: '',
    client_email: '',
    client_phone: '',
    notes: '',
    recurrence_pattern: 'none',
    recurrence_end_date: '' as string,
  })

  if (!isOpen) return null

  const selectedService = services.find((s) => s.id === form.service_id)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ...form,
      recurrence_end_date: form.recurrence_end_date || null,
    })
    onClose()
  }

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold">Nouveau rendez-vous</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-5 space-y-4">
          {/* Service */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Service
            </label>
            <select
              value={form.service_id}
              onChange={(e) => update('service_id', e.target.value)}
              required
              className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors bg-white"
            >
              <option value="">Sélectionner un service</option>
              {services.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.duration_minutes}min — €{s.price}
                </option>
              ))}
            </select>
            {selectedService && (
              <p className="text-[11px] text-gray-400 mt-1">
                Durée : {selectedService.duration_minutes} min · Prix : €{selectedService.price}
              </p>
            )}
          </div>

          {/* Staff */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Employé
            </label>
            <select
              value={form.staff_id}
              onChange={(e) => update('staff_id', e.target.value)}
              required
              className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors bg-white"
            >
              <option value="">Sélectionner un employé</option>
              {staff.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => update('date', e.target.value)}
                required
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Heure
              </label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => update('start_time', e.target.value)}
                required
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">
              Informations client
            </p>

            {/* Client name */}
            <div className="mb-3">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Nom complet
              </label>
              <input
                type="text"
                autoComplete="name"
                value={form.client_name}
                onChange={(e) => update('client_name', e.target.value)}
                required
                placeholder="Marie Dupont"
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
              />
            </div>

            {/* Email + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.client_email}
                  onChange={(e) => update('client_email', e.target.value)}
                  placeholder="marie@email.com"
                  className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  Téléphone
                </label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={form.client_phone}
                  onChange={(e) => update('client_phone', e.target.value)}
                  placeholder="0470 12 34 56"
                  className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Récurrence
            </label>
            <select
              value={form.recurrence_pattern}
              onChange={(e) => update('recurrence_pattern', e.target.value)}
              className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
            >
              <option value="none">Aucune (unique)</option>
              <option value="weekly">Chaque semaine</option>
              <option value="biweekly">Toutes les 2 semaines</option>
              <option value="monthly">Chaque mois</option>
            </select>
          </div>

          {form.recurrence_pattern !== 'none' && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Fin de la récurrence
              </label>
              <input
                type="date"
                value={form.recurrence_end_date}
                onChange={(e) => update('recurrence_end_date', e.target.value)}
                min={form.date}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Laissez vide pour 1 an maximum (52 occurrences max).
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Notes (optionnel)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={2}
              placeholder="Remarques ou demandes spéciales..."
              className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors resize-none placeholder:text-gray-400"
            />
          </div>

          {/* Actions — sticky footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 flex gap-3 pt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-1 -mb-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Créer le rendez-vous
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
