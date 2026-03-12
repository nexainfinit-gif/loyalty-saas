'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { PLAN_FEATURE_KEYS } from '@/lib/plan-features'
import PlanSelection from '@/components/PlanSelection'
import { useTranslation, useLocaleRouter } from '@/lib/i18n'

/* ── Types ────────────────────────────────────────────── */

interface Plan {
  id: string
  key: string
  name: string
  price_monthly: number | null
  features: Record<string, boolean>
}

interface Restaurant {
  id: string
  name: string
  plan: string
  plan_id: string | null
  plans: { name: string; key: string } | null
  subscription_status: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
}

/* ── Icons ────────────────────────────────────────────── */

const IBack = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

const ICheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success-600">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const ICross = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const IExternal = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

/* ── Page ─────────────────────────────────────────────── */

export default function BillingPage() {
  const router = useLocaleRouter()
  const { t, locale } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const [plans, setPlans] = useState<Plan[]>([])
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [showPlanSelection, setShowPlanSelection] = useState(false)

  /* Status helpers */
  function statusLabel(s: string | null): string {
    switch (s) {
      case 'active':   return t('billing.statusActive')
      case 'past_due': return t('billing.statusPastDue')
      case 'canceled': return t('billing.statusCanceled')
      case 'trialing': return t('billing.statusTrialing')
      default:         return t('billing.statusInactive')
    }
  }

  function statusColor(s: string | null): string {
    switch (s) {
      case 'active':   return 'bg-success-50 text-success-700'
      case 'past_due': return 'bg-warning-50 text-warning-700'
      case 'canceled': return 'bg-danger-50 text-danger-700'
      case 'trialing': return 'bg-primary-50 text-primary-700'
      default:         return 'bg-gray-100 text-gray-500'
    }
  }

  /* Load data */
  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/dashboard/login'); return }
      setAccessToken(session.access_token)

      const { data: resto } = await supabase
        .from('restaurants')
        .select('id, name, plan, plan_id, subscription_status, current_period_end, stripe_customer_id, plans(name, key)')
        .eq('owner_id', session.user.id)
        .maybeSingle()

      if (!resto) { router.replace('/onboarding'); return }
      setRestaurant(resto as unknown as Restaurant)

      // Fetch all plans with features
      const res = await fetch('/api/plans')
      if (res.ok) {
        const { plans: allPlans } = await res.json()
        setPlans(allPlans ?? [])
        // Find current plan
        const cp = (allPlans ?? []).find((p: Plan) => p.id === resto.plan_id || p.key === resto.plan)
        setCurrentPlan(cp ?? null)
      }

      setLoading(false)
    }
    load()
  }, [router])

  const planKey = restaurant?.plans?.key ?? restaurant?.plan ?? 'starter'
  const planName = restaurant?.plans?.name ?? restaurant?.plan ?? 'Starter'
  const isStarter = planKey === 'starter'
  const hasStripe = !!restaurant?.stripe_customer_id

  /* Stripe portal */
  async function openPortal() {
    if (!accessToken) return
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      toast.error(data.error || t('billing.portalError'))
    } catch {
      toast.error(t('common.networkError'))
    } finally {
      setPortalLoading(false)
    }
  }

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="min-h-screen bg-surface">
        <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-100 rounded-xl animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-5 w-28 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-3 w-20 bg-gray-50 rounded animate-pulse" />
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {/* Plan card skeleton */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                <div className="h-6 w-24 bg-gray-100 rounded-lg animate-pulse" />
              </div>
              <div className="h-6 w-14 bg-gray-100 rounded-xl animate-pulse" />
            </div>
            <div className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-4 h-4 bg-gray-50 rounded animate-pulse" />
                <div className="h-4 flex-1 max-w-[200px] bg-gray-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
          {/* Billing info skeleton */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="h-5 w-40 bg-gray-100 rounded animate-pulse mb-2" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-4 w-28 bg-gray-50 rounded animate-pulse" />
                <div className="h-4 w-20 bg-gray-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </main>
      </div>
    )
  }

  if (!restaurant) return null

  const otherPlans = plans.filter(p => p.key !== planKey && (p.price_monthly ?? 0) > 0)

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <a
            href={`/${locale}/dashboard`}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            <IBack />
          </a>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('billing.title')}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{restaurant.name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Current plan card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{t('billing.currentPlan')}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{planName}</p>
            </div>
            <span className={`inline-flex items-center rounded-xl px-3 py-1 text-xs font-bold ${statusColor(restaurant.subscription_status)}`}>
              {statusLabel(restaurant.subscription_status)}
            </span>
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* Price */}
            {currentPlan && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-gray-900">
                  {(currentPlan.price_monthly ?? 0) === 0
                    ? t('billing.free')
                    : `${((currentPlan.price_monthly ?? 0) / 100).toFixed(0)}\u20AC`}
                </span>
                {(currentPlan.price_monthly ?? 0) > 0 && (
                  <span className="text-sm text-gray-400">{t('common.perMonth')}</span>
                )}
              </div>
            )}

            {/* Renewal */}
            {restaurant.subscription_status === 'active' && restaurant.current_period_end && (
              <p className="text-sm text-gray-500">
                {t('billing.nextRenewal')}{' '}
                <span className="font-medium text-gray-700">
                  {new Date(restaurant.current_period_end).toLocaleDateString(locale, {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </p>
            )}

            {/* Past due warning */}
            {restaurant.subscription_status === 'past_due' && (
              <div className="flex items-center gap-2 bg-warning-50 text-warning-700 text-sm px-3.5 py-2.5 rounded-xl">
                <span className="flex-shrink-0">&#9888;&#65039;</span>
                <p>{t('billing.pastDueWarning')}</p>
              </div>
            )}

            {/* Canceled warning */}
            {restaurant.subscription_status === 'canceled' && (
              <div className="flex items-center gap-2 bg-danger-50 text-danger-700 text-sm px-3.5 py-2.5 rounded-xl">
                <span className="flex-shrink-0">&#10060;</span>
                <p>{t('billing.canceledWarning')}</p>
              </div>
            )}

            {/* Features */}
            {currentPlan && (
              <div className="pt-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('billing.featuresIncluded')}</p>
                <ul className="space-y-2">
                  {[...PLAN_FEATURE_KEYS].sort((a, b) => {
                    const ae = currentPlan.features[a.key] ?? false
                    const be = currentPlan.features[b.key] ?? false
                    return ae === be ? 0 : ae ? -1 : 1
                  }).map(f => {
                    const enabled = currentPlan.features[f.key] ?? false
                    return (
                      <li key={f.key} className="flex items-center gap-2.5">
                        {enabled ? <ICheck /> : <ICross />}
                        <span className={`text-sm ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                          {f.label}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-gray-50 flex flex-col sm:flex-row gap-3">
            {hasStripe && (
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {portalLoading ? (
                  <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-ds-spin" />
                ) : (
                  <IExternal />
                )}
                {t('billing.manageBtn')}
              </button>
            )}
            {isStarter && (
              <button
                onClick={() => setShowPlanSelection(true)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-primary-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                {t('billing.upgradeBtn')}
              </button>
            )}
          </div>
        </div>

        {/* ── Plan comparison ── */}
        {isStarter && otherPlans.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-900">{t('billing.availablePlans')}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('billing.comparePlans')}</p>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {otherPlans.map(plan => (
                <div
                  key={plan.id}
                  className="rounded-2xl border-2 border-gray-200 p-5 hover:border-primary-300 transition-colors"
                >
                  <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1 mb-4">
                    <span className="text-2xl font-bold text-gray-900">
                      {((plan.price_monthly ?? 0) / 100).toFixed(0)}&euro;
                    </span>
                    <span className="text-sm text-gray-400">{t('common.perMonth')}</span>
                  </div>

                  <ul className="space-y-2 mb-5">
                    {[...PLAN_FEATURE_KEYS].sort((a, b) => {
                      const ae = plan.features[a.key] ?? false
                      const be = plan.features[b.key] ?? false
                      return ae === be ? 0 : ae ? -1 : 1
                    }).map(f => {
                      const enabled = plan.features[f.key] ?? false
                      return (
                        <li key={f.key} className="flex items-center gap-2">
                          {enabled ? <ICheck /> : <ICross />}
                          <span className={`text-sm ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                            {f.label}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  <button
                    onClick={() => setShowPlanSelection(true)}
                    className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
                  >
                    {t('billing.choosePlan', { name: plan.name })}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Billing info ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-sm font-semibold text-gray-900">{t('billing.billingInfo')}</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{t('billing.paymentMethod')}</span>
              <span className="text-sm text-gray-700 font-medium">
                {hasStripe ? t('billing.viaStripe') : t('billing.none')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">{t('common.status')}</span>
              <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold ${statusColor(restaurant.subscription_status)}`}>
                {statusLabel(restaurant.subscription_status)}
              </span>
            </div>
            {restaurant.current_period_end && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{t('billing.nextInvoice')}</span>
                <span className="text-sm text-gray-700 font-medium">
                  {new Date(restaurant.current_period_end).toLocaleDateString(locale, {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </span>
              </div>
            )}

            {hasStripe && (
              <div className="pt-2">
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors flex items-center gap-1.5"
                >
                  <IExternal />
                  {t('billing.viewInvoices')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── FAQ / Help ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-sm font-semibold text-gray-900">{t('billing.faqTitle')}</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              {
                q: t('billing.faq1q'),
                a: t('billing.faq1a'),
              },
              {
                q: t('billing.faq2q'),
                a: t('billing.faq2a'),
              },
              {
                q: t('billing.faq3q'),
                a: t('billing.faq3a'),
              },
            ].map((item, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-gray-900">{item.q}</p>
                <p className="text-sm text-gray-500 mt-0.5">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Plan Selection Modal */}
      {showPlanSelection && restaurant && (
        <PlanSelection
          restaurantId={restaurant.id}
          accessToken={accessToken}
          onComplete={() => {
            setShowPlanSelection(false)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
