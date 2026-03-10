'use client'

import { useState } from 'react'
import { Save, Clock, Calendar, Bell, Star, Shield } from 'lucide-react'
import type { AppointmentSettings } from '@/types/appointments'

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const INITIAL_SETTINGS: AppointmentSettings = {
  id: 'set1',
  restaurant_id: 'b1',
  slot_duration_minutes: 15,
  buffer_minutes: 5,
  max_advance_days: 30,
  min_advance_hours: 2,
  allow_cancellation: true,
  cancellation_deadline_hours: 24,
  confirmation_message: 'Merci pour votre réservation ! Nous avons hâte de vous accueillir.',
  reminder_hours_before: 24,
  auto_loyalty_points: true,
  loyalty_points_per_visit: 10,
  working_days: [1, 2, 3, 4, 5, 6],
  opening_time: '09:00',
  closing_time: '19:00',
  created_at: '',
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppointmentSettings>(INITIAL_SETTINGS)
  const [saved, setSaved] = useState(false)

  const update = <K extends keyof AppointmentSettings>(
    key: K,
    value: AppointmentSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const toggleDay = (day: number) => {
    const current = settings.working_days
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort()
    update('working_days', next)
  }

  const handleSave = () => {
    // TODO: save to Supabase
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paramètres réservation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configurez les règles de prise de rendez-vous
          </p>
        </div>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          <Save size={16} />
          {saved ? 'Enregistré !' : 'Enregistrer'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Horaires */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">Horaires d&apos;ouverture</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Ouverture
              </label>
              <input
                type="time"
                value={settings.opening_time}
                onChange={(e) => update('opening_time', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Fermeture
              </label>
              <input
                type="time"
                value={settings.closing_time}
                onChange={(e) => update('closing_time', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">
              Jours d&apos;ouverture
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`w-11 h-11 rounded-xl text-xs font-medium transition-all duration-200 ${
                    settings.working_days.includes(day)
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {DAYS[day]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Créneaux */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">Créneaux & disponibilité</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Durée créneau (min)
              </label>
              <select
                value={settings.slot_duration_minutes}
                onChange={(e) => update('slot_duration_minutes', parseInt(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors bg-white"
              >
                {[5, 10, 15, 20, 30, 60].map((v) => (
                  <option key={v} value={v}>{v} min</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Temps tampon (min)
              </label>
              <input
                type="number"
                value={settings.buffer_minutes}
                onChange={(e) => update('buffer_minutes', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Réservation max (jours)
              </label>
              <input
                type="number"
                value={settings.max_advance_days}
                onChange={(e) => update('max_advance_days', parseInt(e.target.value) || 1)}
                min={1}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Délai min (heures)
              </label>
              <input
                type="number"
                value={settings.min_advance_hours}
                onChange={(e) => update('min_advance_hours', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          </div>
        </section>

        {/* Annulation */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">Annulation</h2>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">Autoriser l&apos;annulation</p>
              <p className="text-xs text-gray-400">
                Les clients peuvent annuler leur rendez-vous
              </p>
            </div>
            <button
              onClick={() => update('allow_cancellation', !settings.allow_cancellation)}
              className="shrink-0"
            >
              {settings.allow_cancellation ? (
                <div className="w-11 h-6 rounded-full bg-green-500 flex items-center justify-end px-0.5 transition-all">
                  <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </div>
              ) : (
                <div className="w-11 h-6 rounded-full bg-gray-200 flex items-center justify-start px-0.5 transition-all">
                  <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </div>
              )}
            </button>
          </div>

          {settings.allow_cancellation && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Délai d&apos;annulation (heures avant rdv)
              </label>
              <input
                type="number"
                value={settings.cancellation_deadline_hours}
                onChange={(e) => update('cancellation_deadline_hours', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full max-w-[200px] px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          )}
        </section>

        {/* Rappels */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">Rappels & messages</h2>
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Rappel avant rendez-vous (heures)
            </label>
            <select
              value={settings.reminder_hours_before}
              onChange={(e) => update('reminder_hours_before', parseInt(e.target.value))}
              className="w-full max-w-[200px] px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors bg-white"
            >
              {[1, 2, 4, 12, 24, 48].map((v) => (
                <option key={v} value={v}>{v}h avant</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Message de confirmation
            </label>
            <textarea
              value={settings.confirmation_message || ''}
              onChange={(e) => update('confirmation_message', e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors resize-none placeholder:text-gray-400"
            />
          </div>
        </section>

        {/* Fidélité */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Star size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">Connexion fidélité</h2>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">Points automatiques</p>
              <p className="text-xs text-gray-400">
                Attribuer des points fidélité quand un rendez-vous est terminé
              </p>
            </div>
            <button
              onClick={() => update('auto_loyalty_points', !settings.auto_loyalty_points)}
              className="shrink-0"
            >
              {settings.auto_loyalty_points ? (
                <div className="w-11 h-6 rounded-full bg-green-500 flex items-center justify-end px-0.5 transition-all">
                  <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </div>
              ) : (
                <div className="w-11 h-6 rounded-full bg-gray-200 flex items-center justify-start px-0.5 transition-all">
                  <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </div>
              )}
            </button>
          </div>

          {settings.auto_loyalty_points && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                Points par visite
              </label>
              <input
                type="number"
                value={settings.loyalty_points_per_visit}
                onChange={(e) => update('loyalty_points_per_visit', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full max-w-[200px] px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
