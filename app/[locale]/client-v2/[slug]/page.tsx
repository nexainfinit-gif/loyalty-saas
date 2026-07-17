'use client'

import '../../design-v2/theme.css'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Calendar, Clock, Star, User, ArrowRight, Mail } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { Button, Input, Badge } from '@/components/ui-v2'
import { accentVars } from '@/components/ui-v2/accent'

/**
 * Portail client self-service — version design v2 « Comptoir » (parallèle,
 * ne remplace pas /client/[slug]). Même logique (magic-link, carte de fidélité,
 * RDV à venir/passés, annulation/report). Neutres chauds + couleur = accent.
 */

interface Customer {
  id: string; first_name: string; last_name: string | null; email: string
  total_points: number; stamps_count: number; total_visits: number
  last_visit_at: string | null; created_at: string
}
interface Restaurant { id: string; name: string; slug: string; primary_color: string | null; logo_url: string | null }
interface Loyalty { program_type: 'points' | 'stamps'; reward_threshold: number; stamps_total: number; reward_message: string }
interface Appointment {
  id: string; date: string; start_time: string; end_time: string; status: string; cancel_token: string
  service: { name: string; price: number; duration_minutes: number } | null
  staff: { name: string } | null
}

export default function ClientPortalPageV2() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { t, locale } = useTranslation()
  const slug = params.slug as string
  const urlToken = searchParams.get('token')
  // Lien tokenisé ?t=<qr_token> (emails, passes Wallet) : échangé contre une
  // session côté serveur — aucun email magic-link envoyé (quota limité).
  const directToken = searchParams.get('t')
  const [token, setToken] = useState<string | null>(urlToken)

  const [loading, setLoading] = useState(Boolean(urlToken || directToken))
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loginEmail, setLoginEmail] = useState('')
  const [loginSent, setLoginSent] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)

  // Échange silencieux qr_token → session (accès direct depuis nos liens)
  useEffect(() => {
    if (token || !directToken) return
    let stop = false
    fetch('/api/client/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrToken: directToken, slug }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (stop) return
        if (j.token) setToken(j.token)
        else setLoading(false)
      })
      .catch(() => { if (!stop) setLoading(false) })
    return () => { stop = true }
  }, [token, directToken, slug])

  useEffect(() => {
    if (!token) return
    async function fetchData() {
      const [authRes, aptsRes] = await Promise.all([
        fetch(`/api/client/auth?token=${token}`),
        fetch(`/api/client/appointments?token=${token}`),
      ])
      if (authRes.ok) {
        const data = await authRes.json()
        setCustomer(data.customer)
        setRestaurant(data.restaurant)
        setLoyalty(data.loyalty)
      }
      if (aptsRes.ok) {
        const data = await aptsRes.json()
        setAppointments(data.appointments ?? [])
      }
      setLoading(false)
    }
    fetchData()
  }, [token])

  const primaryColor = restaurant?.primary_color ?? '#4148D6'
  const today = new Date().toISOString().split('T')[0]
  const upcoming = appointments.filter((a) => a.date >= today && a.status === 'confirmed')
  const past = appointments.filter((a) => a.date < today || a.status !== 'confirmed')

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div data-ui-v2="" className="v2-cp" style={accentVars(primaryColor)}>{children}</div>
  )

  // ── Login (pas de token, et pas d'échange de lien direct en cours) ────
  if (!token && !loading) {
    return (
      <Frame>
        <div className="v2-cp__login">
          <div className="v2-cp__login-in">
            <div className="v2-cp__icon"><User size={24} /></div>
            <h1>{t('clientPortal.title')}</h1>
            <p className="sub">{t('clientPortal.loginPrompt')}</p>

            {loginSent ? (
              <div className="v2-bk__notice v2-bk__notice--ok" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px 16px' }}>
                <Mail size={20} />
                <p style={{ fontWeight: 600, margin: 0 }}>{t('clientPortal.loginSuccess')}</p>
                <p style={{ fontSize: 12, opacity: 0.85, margin: 0 }}>{t('clientPortal.checkInbox')}</p>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  setLoginLoading(true)
                  await fetch('/api/client/auth', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: loginEmail, slug }),
                  })
                  setLoginSent(true)
                  setLoginLoading(false)
                }}
                className="flex flex-col gap-3"
              >
                <Input type="email" name="email" required
                  placeholder={t('clientPortal.emailPlaceholder') || 'your@email.com'}
                  value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                <Button type="submit" variant="primary" className="v2-reg__submit" disabled={loginLoading}>
                  {t('clientPortal.sendLink')}
                </Button>
              </form>
            )}
          </div>
        </div>
      </Frame>
    )
  }

  if (loading) {
    return <Frame><div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><div className="v2-spin" /></div></Frame>
  }

  if (!customer || !restaurant) {
    return (
      <Frame>
        <div className="v2-cp__login">
          <div className="v2-cp__login-in" style={{ textAlign: 'center' }}>
            <h1>{t('clientPortal.sessionExpired')}</h1>
            <p className="sub">{t('clientPortal.reconnectPrompt')}</p>
            <Link href={`/${locale}/client-v2/${slug}`}>
              <Button variant="primary" className="v2-reg__submit">{t('clientPortal.reconnect')}</Button>
            </Link>
          </div>
        </div>
      </Frame>
    )
  }

  const programType = loyalty?.program_type ?? 'points'
  const currentVal = programType === 'stamps' ? (customer.stamps_count ?? 0) : customer.total_points
  const targetVal = programType === 'stamps' ? (loyalty?.stamps_total ?? 10) : (loyalty?.reward_threshold ?? 100)
  const progress = Math.min(100, (currentVal / targetVal) * 100)

  return (
    <Frame>
      <header className="v2-cp__header">
        <div className="v2-cp__header-in">
          {restaurant.logo_url
            ? <img src={restaurant.logo_url} alt={restaurant.name} className="v2-cp__logo" />
            : <div className="v2-cp__logo-fb">{restaurant.name[0]}</div>}
          <div>
            <p className="v2-cp__bname">{restaurant.name}</p>
            <p className="v2-cp__greeting">{t('clientPortal.greeting', { name: customer.first_name })}</p>
          </div>
        </div>
      </header>

      <div className="v2-cp__body">
        {/* Carte de fidélité — le centre « carte de membre » */}
        <div className="v2-cp__loyalty">
          <div className="v2-cp__loyalty-top">
            <div className="v2-cp__loyalty-lbl">
              <Star size={13} />
              {programType === 'stamps' ? t('clientPortal.loyaltyCard') : t('clientPortal.loyaltyPoints')}
            </div>
            <div className="v2-cp__loyalty-num">{currentVal}</div>
            <p className="v2-cp__loyalty-sub">
              {programType === 'stamps'
                ? `${currentVal} / ${targetVal} ${t('clientPortal.stamps')}`
                : `${currentVal} / ${targetVal} ${t('clientPortal.points')}`}
            </p>
          </div>
          <div className="v2-cp__loyalty-foot">
            <div className="v2-cp__loyalty-meta">
              <span className="lab">{Math.round(progress)}%</span>
              <span className="v2-cp__visits">{customer.total_visits} {customer.total_visits !== 1 ? t('clientPortal.visits') : t('clientPortal.visit')}</span>
            </div>
            <div className="v2-cp__bar"><span style={{ width: `${progress}%` }} /></div>
            {loyalty?.reward_message && <p className="v2-cp__reward">{loyalty.reward_message}</p>}
          </div>
        </div>

        {/* RDV à venir */}
        <div>
          <div className="v2-cp__sec-head">
            <h2>{t('clientPortal.upcomingAppointments')}</h2>
            <Link href={`/${locale}/book/${slug}?ct=${token}`} className="v2-cp__book-link">
              {t('clientPortal.book')} <ArrowRight size={12} />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="v2-cp__empty">
              <Calendar size={20} />
              <span>{t('clientPortal.noUpcoming')}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {upcoming.map((apt) => <AptCard key={apt.id} apt={apt} locale={locale} t={t} />)}
            </div>
          )}
        </div>

        {/* Historique */}
        {past.length > 0 && (
          <div>
            <div className="v2-cp__sec-head"><h2>{t('clientPortal.history')}</h2></div>
            <div className="flex flex-col gap-2">
              {past.slice(0, 10).map((apt) => <AptCard key={apt.id} apt={apt} locale={locale} isPast t={t} />)}
            </div>
          </div>
        )}
      </div>
    </Frame>
  )
}

function AptCard({ apt, locale, isPast, t }: {
  apt: Appointment; locale: string; isPast?: boolean; t: (key: string, params?: Record<string, string>) => string
}) {
  const svc = apt.service
  const staff = apt.staff

  const [y, m, d] = apt.date.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const dayNames = [
    t('appointmentStaff.daySun'), t('appointmentStaff.dayMon'), t('appointmentStaff.dayTue'),
    t('appointmentStaff.dayWed'), t('appointmentStaff.dayThu'), t('appointmentStaff.dayFri'), t('appointmentStaff.daySat'),
  ]
  const monthKeys = ['monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun', 'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec']
  const displayDate = `${dayNames[dateObj.getDay()]} ${d} ${t(`clientPortal.${monthKeys[m - 1]}`)}`

  const tone = apt.status === 'completed' ? 'ok' : apt.status === 'cancelled' ? 'bad' : apt.status === 'no_show' ? 'warn' : 'accent'
  const statusLabels: Record<string, string> = {
    confirmed: t('clientPortal.statusConfirmed'), completed: t('clientPortal.statusCompleted'),
    cancelled: t('clientPortal.statusCancelled'), no_show: t('clientPortal.statusNoShow'),
  }

  return (
    <div className={`v2-cp__apt${isPast ? ' v2-cp__apt--past' : ''}`}>
      <div className="v2-cp__apt-top">
        <div>
          <p className="v2-cp__apt-name">{svc?.name ?? t('clientPortal.defaultAppointment')}</p>
          {staff && <p className="v2-cp__apt-staff">{t('clientPortal.withStaff')} {staff.name}</p>}
        </div>
        <Badge tone={tone as 'ok' | 'bad' | 'warn' | 'accent'}>{statusLabels[apt.status] ?? apt.status}</Badge>
      </div>
      <div className="v2-cp__apt-meta">
        <span><Calendar size={11} />{displayDate}</span>
        <span><Clock size={11} />{apt.start_time} — {apt.end_time}</span>
        {svc && <span>{svc.price}€</span>}
      </div>
      {apt.status === 'confirmed' && !isPast && (
        <div className="v2-cp__apt-actions">
          <Link href={`/${locale}/book/cancel/${apt.cancel_token}`} className="v2-cp__apt-cancel">{t('clientPortal.cancelAction')}</Link>
          <Link href={`/${locale}/book/reschedule/${apt.cancel_token}`} className="v2-cp__apt-resched">{t('clientPortal.rescheduleAction')}</Link>
        </div>
      )}
    </div>
  )
}
