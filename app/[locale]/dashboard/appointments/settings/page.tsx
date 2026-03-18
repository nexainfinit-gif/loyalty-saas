'use client'

import { useState, useEffect, useCallback } from 'react'
import { Save, Clock, Calendar, Bell, Star, Shield, Loader2, Code, Copy, Check as CheckIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { AppointmentSettings } from '@/types/appointments'
import { api } from '@/lib/use-api'
import { useTranslation } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const { t, locale } = useTranslation()

  const DAYS = [
    t('appointmentStaff.daySun') || 'Dim',
    t('appointmentStaff.dayMon') || 'Lun',
    t('appointmentStaff.dayTue') || 'Mar',
    t('appointmentStaff.dayWed') || 'Mer',
    t('appointmentStaff.dayThu') || 'Jeu',
    t('appointmentStaff.dayFri') || 'Ven',
    t('appointmentStaff.daySat') || 'Sam',
  ]

  const [settings, setSettings] = useState<AppointmentSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  const [embedCopied, setEmbedCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalConfigured, setGcalConfigured] = useState(false)
  const [gcalAuthUrl, setGcalAuthUrl] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSettings() {
      try {
        const settingsRes = await api<{ settings: AppointmentSettings }>('/api/appointments/settings')
        if (settingsRes.data) setSettings(settingsRes.data.settings)

        // Fetch restaurant slug for embed code
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: resto } = await supabase
            .from('restaurants')
            .select('slug')
            .eq('owner_id', user.id)
            .maybeSingle()
          if (resto?.slug) setSlug(resto.slug)
        }

        // Fetch Google Calendar status
        const gcalRes = await api<{ connected: boolean; configured: boolean; authUrl: string | null }>('/api/gcal')
        if (gcalRes.data) {
          setGcalConnected(gcalRes.data.connected)
          setGcalConfigured(gcalRes.data.configured)
          setGcalAuthUrl(gcalRes.data.authUrl)
        }

        // Handle gcal callback result
        const params = new URLSearchParams(window.location.search)
        if (params.get('gcal') === 'connected') {
          toast.success('Google Calendar connecté !')
          setGcalConnected(true)
        } else if (params.get('gcal') === 'error') {
          toast.error('Erreur lors de la connexion à Google Calendar')
        }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const update = <K extends keyof AppointmentSettings>(
    key: K,
    value: AppointmentSettings[K]
  ) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev)
    setSaved(false)
  }

  const toggleDay = (day: number) => {
    if (!settings) return
    const current = settings.working_days
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort()
    update('working_days', next)
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    const { id, restaurant_id, created_at, ...payload } = settings
    const res = await api('/api/appointments/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      toast.success(t('appointmentSettings.settingsSaved'))
    } else {
      toast.error(t('appointmentSettings.saveError'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-gray-500">Impossible de charger les paramètres. Veuillez réessayer.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('appointmentSettings.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('appointmentSettings.subtitle')}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          } disabled:opacity-50`}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saved ? t('appointmentSettings.saved') : t('common.save')}
        </button>
      </div>

      <div className="space-y-6">
        {/* Horaires */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">{t('appointmentSettings.hoursTitle')}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t('appointmentSettings.openLabel')}
              </label>
              <input
                type="time"
                value={settings.opening_time}
                onChange={(e) => update('opening_time', e.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t('appointmentSettings.closeLabel')}
              </label>
              <input
                type="time"
                value={settings.closing_time}
                onChange={(e) => update('closing_time', e.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">
              {t('appointmentSettings.daysLabel')}
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
            <h2 className="text-sm font-semibold">{t('appointmentSettings.slotsTitle')}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t('appointmentSettings.slotDuration')}
              </label>
              <select
                value={settings.slot_duration_minutes}
                onChange={(e) => update('slot_duration_minutes', parseInt(e.target.value))}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors bg-white"
              >
                {[5, 10, 15, 20, 30, 60].map((v) => (
                  <option key={v} value={v}>{v} min</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t('appointmentSettings.bufferTime')}
              </label>
              <input
                type="number"
                value={settings.buffer_minutes}
                onChange={(e) => update('buffer_minutes', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t('appointmentSettings.maxBookingDays')}
              </label>
              <input
                type="number"
                value={settings.max_advance_days}
                onChange={(e) => update('max_advance_days', parseInt(e.target.value) || 1)}
                min={1}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t('appointmentSettings.minDelay')}
              </label>
              <input
                type="number"
                value={settings.min_advance_hours}
                onChange={(e) => update('min_advance_hours', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          </div>
        </section>

        {/* Annulation */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">{t('appointmentSettings.cancelTitle')}</h2>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">{t('appointmentSettings.allowCancel')}</p>
              <p className="text-xs text-gray-400">
                {t('appointmentSettings.allowCancelDesc')}
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
                {t('appointmentSettings.cancelDelay')}
              </label>
              <input
                type="number"
                value={settings.cancellation_deadline_hours}
                onChange={(e) => update('cancellation_deadline_hours', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full max-w-[200px] px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                {t('appointmentSettings.noShowThreshold')}
              </label>
              <input
                type="number"
                value={settings.no_show_block_threshold}
                onChange={(e) => update('no_show_block_threshold', parseInt(e.target.value) || 0)}
                min={0}
                max={10}
                className="w-full max-w-[200px] px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                {t('appointmentSettings.noShowThresholdDesc')}
              </p>
            </div>
          </div>
        </section>

        {/* Rappels */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">{t('appointmentSettings.remindersTitle')}</h2>
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              {t('appointmentSettings.reminderBefore')}
            </label>
            <select
              value={settings.reminder_hours_before}
              onChange={(e) => update('reminder_hours_before', parseInt(e.target.value))}
              className="w-full max-w-[200px] px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors bg-white"
            >
              {[1, 2, 4, 12, 24, 48].map((v) => (
                <option key={v} value={v}>{v}{t('appointmentSettings.reminderUnit')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              {t('appointmentSettings.confirmMessage')}
            </label>
            <textarea
              value={settings.confirmation_message || ''}
              onChange={(e) => update('confirmation_message', e.target.value)}
              rows={3}
              className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors resize-none placeholder:text-gray-400"
            />
          </div>
        </section>

        {/* Fidélité */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Star size={18} className="text-gray-500" />
            <h2 className="text-sm font-semibold">{t('appointmentSettings.loyaltyTitle')}</h2>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium">{t('appointmentSettings.autoPoints')}</p>
              <p className="text-xs text-gray-400">
                {t('appointmentSettings.autoPointsDesc')}
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
                {t('appointmentSettings.pointsPerVisit')}
              </label>
              <input
                type="number"
                value={settings.loyalty_points_per_visit}
                onChange={(e) => update('loyalty_points_per_visit', parseInt(e.target.value) || 0)}
                min={0}
                className="w-full max-w-[200px] px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>
          )}
        </section>

        {/* ── Google Calendar ──────────────────────────────────── */}
        {gcalConfigured && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={16} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">
                Google Calendar
              </h3>
            </div>
            <p className="text-xs text-gray-500">
              Synchronisez automatiquement vos rendez-vous avec votre Google Calendar.
            </p>

            {gcalConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-emerald-700 font-medium">Connecté</span>
                </div>
                <button
                  onClick={async () => {
                    await api('/api/gcal', { method: 'DELETE' })
                    setGcalConnected(false)
                    toast.success('Google Calendar déconnecté')
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  Déconnecter
                </button>
              </div>
            ) : (
              <a
                href={gcalAuthUrl ?? '#'}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                <Calendar size={14} />
                Connecter Google Calendar
              </a>
            )}
          </section>
        )}

        {/* ── Embed / Widget ───────────────────────────────────── */}
        {slug && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Code size={16} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">
                {t('appointmentSettings.embedTitle') || 'Widget de réservation'}
              </h3>
            </div>
            <p className="text-xs text-gray-500">
              {t('appointmentSettings.embedDesc') || 'Intégrez le formulaire de réservation directement sur votre site web. Copiez le code ci-dessous et collez-le dans votre page HTML.'}
            </p>

            <div className="relative">
              <pre className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
{`<iframe
  src="${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/book/${slug}?embed=1"
  width="100%"
  height="700"
  frameborder="0"
  style="border: none; border-radius: 16px;"
  allow="payment"
></iframe>`}
              </pre>
              <button
                onClick={() => {
                  const code = `<iframe src="${window.location.origin}/${locale}/book/${slug}?embed=1" width="100%" height="700" frameborder="0" style="border: none; border-radius: 16px;" allow="payment"></iframe>`
                  navigator.clipboard.writeText(code)
                  setEmbedCopied(true)
                  toast.success(t('appointmentSettings.embedCopied') || 'Code copié !')
                  setTimeout(() => setEmbedCopied(false), 2000)
                }}
                className="absolute top-3 right-3 p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                {embedCopied ? <CheckIcon size={14} className="text-emerald-500" /> : <Copy size={14} className="text-gray-400" />}
              </button>
            </div>

            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-blue-700">
                {t('appointmentSettings.embedTip') || 'Astuce : Ajustez la hauteur (height) selon vos besoins. 700px fonctionne bien pour la plupart des sites.'}
              </p>
            </div>

            {/* ── Direct booking link (social media) ───────────────── */}
            <div className="border-t border-gray-100 pt-4 mt-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                {t('appointmentSettings.socialTitle') || 'Lien de réservation (réseaux sociaux)'}
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                {t('appointmentSettings.socialDesc') || 'Ajoutez ce lien dans votre bio Instagram, page Facebook, ou Google Business pour permettre la réservation directe.'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== 'undefined' ? `${window.location.origin}/${locale}/book/${slug}` : ''}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 bg-gray-50 focus:outline-none"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/${locale}/book/${slug}`)
                    setLinkCopied(true)
                    toast.success(t('appointmentSettings.linkCopied') || 'Lien copié !')
                    setTimeout(() => setLinkCopied(false), 2000)
                  }}
                  className="px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
                >
                  {linkCopied ? <CheckIcon size={14} className="text-emerald-500" /> : <Copy size={14} className="text-gray-400" />}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
