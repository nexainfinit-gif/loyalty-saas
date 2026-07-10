'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { api } from '@/lib/use-api'
import { EVENT_THEMES, type EventThemeKey } from '@/lib/event-themes'

/**
 * Dashboard Événements (billetterie) — liste, création/édition, publication,
 * participants. Accessible via la sidebar quand le produit `ticketing` est
 * actif sur l'établissement.
 */
interface Ev {
  id: string
  title: string
  slug: string
  description: string | null
  location: string | null
  starts_at: string
  capacity: number | null
  price: number
  status: 'draft' | 'published' | 'cancelled' | 'ended'
  offer_loyalty: boolean
  theme: EventThemeKey
  tickets_valid: number
  tickets_checked_in: number
}

interface Ticket {
  id: string
  code: string
  buyer_name: string
  buyer_email: string
  amount: number
  status: string
  created_at: string
}

const EMPTY_FORM = {
  title: '', description: '', location: '', starts_at: '', capacity: '', price: '0', offer_loyalty: false,
  theme: 'nuit' as EventThemeKey,
}

export default function EventsPage() {
  const { t, locale } = useTranslation()
  const [events, setEvents] = useState<Ev[]>([])
  const [businessSlug, setBusinessSlug] = useState<string | null>(null)
  const [hasLoyalty, setHasLoyalty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form (création ou édition)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  // Participants dépliés
  const [openTickets, setOpenTickets] = useState<string | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [copied, setCopied] = useState(false)

  // Stripe Connect : requis pour vendre des billets PAYANTS (les événements
  // payants sont masqués de la page publique tant que l'encaissement ne
  // fonctionne pas — il faut le dire clairement à l'organisateur).
  const [connect, setConnect] = useState<{ chargesEnabled: boolean } | null>(null)
  const [connectLoading, setConnectLoading] = useState(false)


  useEffect(() => {
    let stop = false
    fetch('/api/stripe/connect')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && !stop) setConnect({ chargesEnabled: !!j.chargesEnabled }) })
      .catch(() => {})
    return () => { stop = true }
  }, [])

  async function startConnectOnboarding() {
    setConnectLoading(true)
    try {
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, returnPath: '/dashboard/events' }),
      })
      const j = await res.json()
      if (res.ok && j.url) { window.location.href = j.url; return }
      setError(j.error || t('common.error'))
    } finally { setConnectLoading(false) }
  }

  // Rechargement par compteur (pattern lint-safe : setState uniquement dans
  // le callback async, jamais synchrone dans l'effet).
  const [refreshKey, setRefreshKey] = useState(0)
  const load = () => setRefreshKey(k => k + 1)

  useEffect(() => {
    let stop = false
    async function fetchEvents() {
      const res = await api<{ events: Ev[]; businessSlug: string | null; hasLoyalty: boolean }>('/api/events')
      if (stop) return
      if (res.data) {
        setEvents(res.data.events)
        setBusinessSlug(res.data.businessSlug)
        setHasLoyalty(res.data.hasLoyalty)
      } else if (res.error) setError(res.error)
      setLoading(false)
    }
    fetchEvents()
    return () => { stop = true }
  }, [refreshKey])

  function openCreate() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
    setError('')
  }

  function openEdit(ev: Ev) {
    setEditingId(ev.id)
    setForm({
      title: ev.title,
      description: ev.description ?? '',
      location: ev.location ?? '',
      // datetime-local attend un format local sans timezone
      starts_at: ev.starts_at ? new Date(ev.starts_at).toISOString().slice(0, 16) : '',
      capacity: ev.capacity?.toString() ?? '',
      price: ev.price.toString(),
      offer_loyalty: ev.offer_loyalty,
      theme: ev.theme ?? 'nuit',
    })
    setShowForm(true)
    setError('')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...(editingId ? { id: editingId } : {}),
      title: form.title.trim(),
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      starts_at: new Date(form.starts_at).toISOString(),
      capacity: form.capacity ? Number(form.capacity) : null,
      price: Number(form.price) || 0,
      offer_loyalty: form.offer_loyalty,
      theme: form.theme,
    }
    const res = await api<{ event: Ev }>('/api/events', {
      method: editingId ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setShowForm(false)
    load()
  }

  async function setStatus(ev: Ev, status: Ev['status']) {
    const res = await api('/api/events', { method: 'PATCH', body: JSON.stringify({ id: ev.id, status }) })
    if (res.error) setError(res.error)
    load()
  }

  async function remove(ev: Ev) {
    if (!window.confirm(t('events.deleteConfirm', { title: ev.title }))) return
    const res = await api(`/api/events?id=${ev.id}`, { method: 'DELETE' })
    if (res.error) setError(res.error)
    load()
  }

  async function toggleTickets(ev: Ev) {
    if (openTickets === ev.id) { setOpenTickets(null); return }
    const res = await api<{ tickets: Ticket[] }>(`/api/events/${ev.id}/tickets`)
    setTickets(res.data?.tickets ?? [])
    setOpenTickets(ev.id)
  }

  const publicUrl = businessSlug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/event/${businessSlug}` : null

  const STATUS_STYLE: Record<Ev['status'], string> = {
    draft:     'bg-gray-100 text-gray-600',
    published: 'bg-success-50 text-success-700',
    cancelled: 'bg-red-50 text-red-600',
    ended:     'bg-gray-100 text-gray-400',
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-gray-200 border-t-primary-600 rounded-full animate-ds-spin" />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('events.title')}</h1>
          <p className="text-sm text-gray-500">{t('events.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors"
        >
          + {t('events.createBtn')}
        </button>
      </div>

      {/* Lien public */}
      {publicUrl && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-5 flex items-center gap-3 flex-wrap">
          <p className="text-xs font-semibold text-gray-500">{t('events.publicLink')}</p>
          <code className="text-xs text-gray-700 bg-gray-50 rounded-lg px-2 py-1 break-all">{publicUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            {copied ? t('events.copied') : t('events.copy')}
          </button>
        </div>
      )}

      {/* Paiements : indispensable pour les événements payants */}
      {connect && !connect.chargesEnabled && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 mb-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{t('events.connectTitle')}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {events.some(e => e.status === 'published' && e.price > 0)
                  ? t('events.connectWarnHidden')
                  : t('events.connectDesc')}
              </p>
            </div>
            <button
              onClick={startConnectOnboarding}
              disabled={connectLoading}
              className="flex-shrink-0 px-4 py-2 text-xs font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {connectLoading ? '…' : t('events.connectBtn')}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-4">{error}</p>}

      {events.length === 0 && !showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <div className="text-3xl mb-2">🎟️</div>
          <p className="text-sm text-gray-500">{t('events.empty')}</p>
        </div>
      )}

      {/* Liste */}
      <div className="space-y-3">
        {events.map(ev => (
          <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-gray-900">{ev.title}</h2>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${STATUS_STYLE[ev.status]}`}>
                    {t(`events.status_${ev.status}`)}
                  </span>
                  <span className="text-[10px] font-medium text-gray-400 border border-gray-200 rounded-md px-1.5 py-0.5 inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: EVENT_THEMES[ev.theme ?? 'nuit'].accent }} />
                    {t(`events.theme_${ev.theme ?? 'nuit'}`)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(ev.starts_at).toLocaleString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {ev.location ? ` · ${ev.location}` : ''}
                  {' · '}{ev.price > 0 ? `${ev.price} €` : t('event.free')}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('events.sold', { count: ev.tickets_valid })}{ev.capacity != null ? ` / ${ev.capacity}` : ''}
                </p>
                {ev.status === 'published' && ev.price > 0 && connect && !connect.chargesEnabled && (
                  <p className="text-xs font-medium text-amber-600 mt-1">{t('events.paidHidden')}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {ev.status === 'draft' && (
                  <button onClick={() => setStatus(ev, 'published')}
                    className="px-3 py-1.5 text-xs font-semibold bg-success-50 text-success-700 rounded-xl hover:bg-success-100 transition-colors">
                    {t('events.publish')}
                  </button>
                )}
                {ev.status === 'published' && (
                  <button onClick={() => setStatus(ev, 'cancelled')}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                    {t('events.cancel')}
                  </button>
                )}
                <button onClick={() => openEdit(ev)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-xl border border-gray-200 transition-colors">
                  {t('common.edit')}
                </button>
                <button onClick={() => toggleTickets(ev)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-xl border border-gray-200 transition-colors">
                  {t('events.participants')} ({ev.tickets_valid})
                </button>
                {ev.tickets_valid === 0 && (
                  <button onClick={() => remove(ev)}
                    className="px-2 py-1.5 text-xs text-gray-400 hover:text-red-600 rounded-xl transition-colors" aria-label={t('common.delete')}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Participants */}
            {openTickets === ev.id && (
              <div className="mt-4 border-t border-gray-100 pt-3 overflow-x-auto">
                {tickets.length === 0 ? (
                  <p className="text-xs text-gray-400">{t('events.noParticipants')}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400">
                        <th className="py-1.5 pr-3 font-medium">{t('events.thName')}</th>
                        <th className="py-1.5 pr-3 font-medium">{t('events.thEmail')}</th>
                        <th className="py-1.5 pr-3 font-medium">{t('events.thCode')}</th>
                        <th className="py-1.5 font-medium">{t('events.thStatus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map(tk => (
                        <tr key={tk.id} className="border-t border-gray-50 text-gray-700">
                          <td className="py-1.5 pr-3">{tk.buyer_name}</td>
                          <td className="py-1.5 pr-3">{tk.buyer_email}</td>
                          <td className="py-1.5 pr-3 font-mono">{tk.code}</td>
                          <td className="py-1.5">{tk.status === 'checked_in' ? t('events.checkedIn') : t('events.validTicket')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowForm(false)}>
          <form onSubmit={save} onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 my-8">
            <h2 className="text-base font-bold text-gray-900">
              {editingId ? t('events.editTitle') : t('events.createTitle')}
            </h2>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('events.fTitle')}</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={120}
                placeholder={t('events.fTitlePh')}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('events.fDesc')}</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={2000} rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('events.fDate')}</label>
                <input required type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('events.fLocation')}</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} maxLength={200}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('events.fPrice')}</label>
                <input type="number" min={0} max={500} step="0.01" value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                <p className="text-[10px] text-gray-400 mt-1">{t('events.fPriceHint')}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('events.fCapacity')}</label>
                <input type="number" min={1} max={100000} value={form.capacity}
                  onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                  placeholder={t('events.fCapacityPh')}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
              </div>
            </div>
            {/* Thème de présentation de CET événement */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('events.themeLabel')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(EVENT_THEMES) as EventThemeKey[]).map(k => {
                  const th = EVENT_THEMES[k]
                  const active = form.theme === k
                  return (
                    <button
                      key={k} type="button"
                      onClick={() => setForm(f => ({ ...f, theme: k }))}
                      className={`text-left rounded-xl border-2 p-2 transition-colors ${active ? 'border-primary-600 bg-primary-50/40' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="h-7 rounded-lg overflow-hidden flex mb-1.5 border border-gray-100">
                        <div className="flex-1" style={{ background: th.bg }} />
                        <div className="w-1/4" style={{ background: th.accent }} />
                        <div className="w-1/6" style={{ background: th.accent2 }} />
                      </div>
                      <p className="text-[11px] font-semibold text-gray-900">{t(`events.theme_${k}`)}</p>
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{t(`events.theme_${form.theme}Desc`)}</p>
            </div>

            {hasLoyalty && (
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={form.offer_loyalty}
                  onChange={e => setForm(f => ({ ...f, offer_loyalty: e.target.checked }))} className="mt-0.5" />
                {t('events.fOfferLoyalty')}
              </label>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors">
                {saving ? '…' : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        <Link href={`/${locale}/dashboard`} className="hover:text-gray-600">← {t('events.backToDashboard')}</Link>
      </p>
    </div>
  )
}
