'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

/**
 * Page publique d'achat de bon cadeau — /[locale]/gift/[slug].
 * Montants prédéfinis ou libre → Checkout Stripe (compte du commerçant) →
 * retour ici avec ?voucher&session → confirmation serveur → code affiché.
 */
const PRESETS = [25, 50, 75, 100]

function GiftContent() {
  const { t } = useTranslation()
  const params = useParams()
  const slug = params.slug as string
  const sp = useSearchParams()

  const [business, setBusiness] = useState<{ name: string; primaryColor: string | null } | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)

  const [amount, setAmount] = useState<number>(50)
  const [customAmount, setCustomAmount] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [buyerEmail, setBuyerEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Retour de paiement
  const voucherId = sp.get('voucher')
  const sessionId = sp.get('session')
  const [confirmState, setConfirmState] = useState<'idle' | 'verifying' | 'failed'>(voucherId && sessionId ? 'verifying' : 'idle')
  const [confirmed, setConfirmed] = useState<{ code: string; amount: number; expiresAt: string | null } | null>(null)

  useEffect(() => {
    fetch(`/api/gift/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setBusiness({ name: j.name, primaryColor: j.primaryColor }))
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!voucherId || !sessionId) return
    fetch('/api/gift/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voucherId, sessionId }),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.code) { setConfirmed({ code: j.code, amount: j.amount, expiresAt: j.expiresAt ?? null }); setConfirmState('idle') }
        else setConfirmState('failed')
      })
      .catch(() => setConfirmState('failed'))
  }, [voucherId, sessionId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const finalAmount = customAmount ? Number(customAmount) : amount
    try {
      const res = await fetch(`/api/gift/${slug}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalAmount,
          buyerName, buyerEmail,
          recipientName: recipientName || null,
          message: message || null,
        }),
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
          <p className="text-sm text-gray-500">{confirmState === 'verifying' ? t('gift.verifying') : t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">🎁</div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{t('gift.successTitle')}</h1>
          <p className="text-sm text-gray-500 mb-6">{t('gift.successDesc')}</p>
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 mb-4">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-1">{t('gift.codeLabel')}</p>
            <p className="font-mono text-2xl font-bold tracking-[0.15em] text-gray-900">{confirmed.code}</p>
            <p className="text-sm font-semibold mt-2" style={{ color }}>{confirmed.amount} €</p>
          </div>
          <p className="text-xs text-gray-400">{t('gift.emailSent')}</p>
        </div>
      </div>
    )
  }

  if (confirmState === 'failed') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-3xl mb-3">⚠️</div>
          <h1 className="text-lg font-semibold mb-2">{t('gift.paymentIssue')}</h1>
          <p className="text-sm text-gray-500">{t('gift.paymentIssueDesc')}</p>
        </div>
      </div>
    )
  }

  if (unavailable || !business) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">{t('gift.unavailable')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎁</div>
          <h1 className="text-2xl font-bold text-gray-900">{t('gift.title', { business: business.name })}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('gift.subtitle')}</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] p-6 space-y-5">
          {/* Montant */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">{t('gift.amountLabel')}</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {PRESETS.map(p => (
                <button
                  key={p} type="button"
                  onClick={() => { setAmount(p); setCustomAmount('') }}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${!customAmount && amount === p ? 'text-white border-transparent' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  style={!customAmount && amount === p ? { background: color } : undefined}
                >
                  {p} €
                </button>
              ))}
            </div>
            <input
              type="number" min={5} max={500} step="0.01"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              placeholder={t('gift.customAmount')}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <input required value={buyerName} onChange={e => setBuyerName(e.target.value)} maxLength={100}
              placeholder={t('gift.buyerName')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
            <input required type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} maxLength={255}
              placeholder={t('gift.buyerEmail')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)} maxLength={100}
              placeholder={t('gift.recipientName')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10" />
            <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={300} rows={2}
              placeholder={t('gift.message')} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <button
            type="submit" disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ background: color }}
          >
            {submitting ? '…' : t('gift.payBtn', { amount: customAmount || amount })}
          </button>
          <p className="text-[11px] text-gray-400 text-center">{t('gift.securePayment')}</p>
        </form>
      </div>
    </div>
  )
}

export default function GiftPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <GiftContent />
    </Suspense>
  )
}
