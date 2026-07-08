'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

/**
 * Page publique d'achat de forfait — /[locale]/package/[slug].
 * Choix d'une offre → Checkout Stripe (compte du commerçant) → retour ici avec
 * ?cp&session → confirmation serveur → code affiché.
 */
interface Offer { id: string; name: string; sessions_count: number; price: number }

function PackageContent() {
  const { t } = useTranslation()
  const params = useParams()
  const slug = params.slug as string
  const sp = useSearchParams()

  const [business, setBusiness] = useState<{ name: string; primaryColor: string | null } | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<string | null>(null)
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const cpId = sp.get('cp')
  const sessionId = sp.get('session')
  const [confirmState, setConfirmState] = useState<'idle' | 'verifying' | 'failed'>(cpId && sessionId ? 'verifying' : 'idle')
  const [confirmed, setConfirmed] = useState<{ code: string; name: string; sessions: number } | null>(null)

  useEffect(() => {
    fetch(`/api/packages/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { setBusiness(j.business); setOffers(j.packages); if (j.packages?.[0]) setSelected(j.packages[0].id) })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!cpId || !sessionId) return
    fetch('/api/packages/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerPackageId: cpId, sessionId }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.code) { setConfirmed({ code: j.code, name: j.name, sessions: j.sessions }); setConfirmState('idle') }
        else setConfirmState('failed')
      })
      .catch(() => setConfirmState('failed'))
  }, [cpId, sessionId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/packages/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, packageId: selected, buyerName, buyerEmail }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error || t('common.error')); return }
      window.location.href = j.paymentUrl
    } catch {
      setError(t('common.networkErrorRetry'))
    } finally {
      setSubmitting(false)
    }
  }

  const color = business?.primaryColor ?? '#111827'

  if (loading || confirmState === 'verifying') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-ds-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">{confirmState === 'verifying' ? t('pkg.verifying') : t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">🎟️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{t('pkg.successTitle')}</h1>
          <p className="text-sm text-gray-500 mb-6">{t('pkg.successDesc')}</p>
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 mb-4">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1">{t('pkg.codeLabel')}</p>
            <p className="font-mono text-2xl font-bold tracking-[0.15em] text-gray-900">{confirmed.code}</p>
            <p className="text-sm font-semibold mt-2" style={{ color }}>{confirmed.name} · {confirmed.sessions} {t('pkg.sessions')}</p>
          </div>
          <p className="text-xs text-gray-400">{t('pkg.emailSent')}</p>
        </div>
      </div>
    )
  }

  if (confirmState === 'failed') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-lg font-semibold mb-2">{t('pkg.paymentIssue')}</h1>
          <p className="text-sm text-gray-500">{t('pkg.paymentIssueDesc')}</p>
        </div>
      </div>
    )
  }

  if (unavailable || !business || offers.length === 0) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">{t('pkg.unavailable')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎟️</div>
          <h1 className="text-2xl font-bold text-gray-900">{t('pkg.title', { business: business.name })}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('pkg.subtitle')}</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-6 space-y-5">
          {/* Choix de l'offre */}
          <div className="space-y-2">
            {offers.map(o => (
              <button
                key={o.id} type="button"
                onClick={() => setSelected(o.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ${selected === o.id ? 'border-transparent text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                style={selected === o.id ? { background: color } : undefined}
              >
                <span className="text-sm font-semibold">{o.name}</span>
                <span className="text-sm">{o.sessions_count} {t('pkg.sessions')} · {Number(o.price).toLocaleString('fr-FR')} €</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <input required value={buyerName} onChange={e => setBuyerName(e.target.value)} maxLength={100}
              placeholder={t('pkg.buyerName')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
            <input required type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} maxLength={255}
              placeholder={t('pkg.buyerEmail')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <button
            type="submit" disabled={submitting || !selected}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ background: color }}
          >
            {submitting ? '…' : t('pkg.payBtn')}
          </button>
          <p className="text-[11px] text-gray-400 text-center">{t('pkg.securePayment')}</p>
        </form>
      </div>
    </div>
  )
}

export default function PackagePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <PackageContent />
    </Suspense>
  )
}
