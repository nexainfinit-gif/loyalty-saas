'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { api } from '@/lib/use-api'
import { useTranslation } from '@/lib/i18n'

/* ── Design tokens ── */
const COLORS = {
  completed: '#10b981',
  confirmed: '#4F6BED',
  cancelled: '#f59e0b',
  no_show:   '#ef4444',
}
const PIE_COLORS = [COLORS.completed, COLORS.confirmed, COLORS.cancelled, COLORS.no_show]
const BAR_COLORS = ['#4F6BED', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981']

type Period = '7d' | '30d' | '90d'

interface KPIs {
  total: number
  completed: number
  cancelled: number
  noShow: number
  confirmed: number
  completionRate: number
  noShowRate: number
  cancellationRate: number
  estimatedRevenue: number
  avgPerDay: number
}

interface StaffRow {
  id: string; name: string; total: number; completed: number
  noShow: number; completionRate: number; noShowRate: number; revenue: number
}

interface ServiceRow {
  id: string; name: string; duration: number; price: number
  total: number; completed: number; revenue: number
}

interface DailyPoint { date: string; total: number; completed: number; noShow: number; cancelled: number }
interface DayOfWeek { day: number; label: string; count: number }
interface HourPoint { hour: number; label: string; count: number }
interface StatusSlice { status: string; count: number }

interface AnalyticsData {
  kpis: KPIs
  statusBreakdown: StatusSlice[]
  byStaff: StaffRow[]
  byService: ServiceRow[]
  dailyTrend: DailyPoint[]
  byDayOfWeek: DayOfWeek[]
  peakHours: HourPoint[]
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Terminé',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
  no_show: 'No-show',
}

export default function AppointmentAnalyticsPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const res = await api<AnalyticsData>(`/api/appointments/analytics?period=${period}`)
      if (res.data) setData(res.data)
      setLoading(false)
    }
    fetch()
  }, [period])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data || data.kpis.total === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {t('appointmentAnalytics.noData') || 'Pas encore de données'}
        </h3>
        <p className="text-sm text-gray-500">
          {t('appointmentAnalytics.noDataDesc') || 'Les statistiques apparaîtront après vos premiers rendez-vous.'}
        </p>
      </div>
    )
  }

  const { kpis, statusBreakdown, byStaff, byService, dailyTrend, byDayOfWeek, peakHours } = data

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {t('appointmentAnalytics.title') || 'Statistiques rendez-vous'}
        </h2>
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          {(['7d', '30d', '90d'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === p
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p === '7d' ? '7j' : p === '30d' ? '30j' : '90j'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label={t('appointmentAnalytics.totalAppointments') || 'Total RDV'}
          value={kpis.total}
        />
        <KpiCard
          label={t('appointmentAnalytics.completionRate') || 'Taux complétion'}
          value={`${kpis.completionRate}%`}
          color={kpis.completionRate >= 80 ? 'text-emerald-600' : kpis.completionRate >= 60 ? 'text-amber-600' : 'text-red-500'}
        />
        <KpiCard
          label={t('appointmentAnalytics.noShowRate') || 'Taux no-show'}
          value={`${kpis.noShowRate}%`}
          color={kpis.noShowRate <= 5 ? 'text-emerald-600' : kpis.noShowRate <= 15 ? 'text-amber-600' : 'text-red-500'}
        />
        <KpiCard
          label={t('appointmentAnalytics.avgPerDay') || 'Moy./jour'}
          value={kpis.avgPerDay}
        />
        <KpiCard
          label={t('appointmentAnalytics.estimatedRevenue') || 'Revenu estimé'}
          value={`${kpis.estimatedRevenue.toLocaleString('fr-FR')}€`}
          color="text-emerald-600"
        />
      </div>

      {/* Row: Status pie + Daily trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('appointmentAnalytics.statusBreakdown') || 'Répartition par statut'}
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="count"
                  nameKey="status"
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {statusBreakdown.map((entry, i) => (
                    <Cell
                      key={entry.status}
                      fill={COLORS[entry.status as keyof typeof COLORS] ?? PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [value, STATUS_LABELS[name] ?? name]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {statusBreakdown.map((s) => (
              <div key={s.status} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[s.status as keyof typeof COLORS] ?? '#9ca3af' }}
                />
                {STATUS_LABELS[s.status] ?? s.status} ({s.count})
              </div>
            ))}
          </div>
        </div>

        {/* Daily trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('appointmentAnalytics.dailyTrend') || 'Tendance quotidienne'}
          </h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => {
                    const parts = d.split('-')
                    return `${parts[2]}/${parts[1]}`
                  }}
                  fontSize={11}
                  tick={{ fill: '#9ca3af' }}
                />
                <YAxis fontSize={11} tick={{ fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(d) => {
                    const parts = (d as string).split('-')
                    return `${parts[2]}/${parts[1]}/${parts[0]}`
                  }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
                <Area type="monotone" dataKey="completed" stackId="1" stroke={COLORS.completed} fill={COLORS.completed} fillOpacity={0.3} name="Terminé" />
                <Area type="monotone" dataKey="noShow" stackId="1" stroke={COLORS.no_show} fill={COLORS.no_show} fillOpacity={0.3} name="No-show" />
                <Area type="monotone" dataKey="cancelled" stackId="1" stroke={COLORS.cancelled} fill={COLORS.cancelled} fillOpacity={0.3} name="Annulé" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row: Staff performance + Service popularity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Staff performance */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('appointmentAnalytics.staffPerformance') || 'Performance par employé'}
          </h3>
          {byStaff.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée</p>
          ) : (
            <div className="space-y-3">
              {byStaff.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                    style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
                      <span className="text-xs text-gray-500">{s.total} RDV</span>
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span className="text-emerald-600">{s.completionRate}% terminé</span>
                      {s.noShowRate > 0 && <span className="text-red-500">{s.noShowRate}% no-show</span>}
                      <span className="ml-auto font-medium text-gray-700">{s.revenue.toLocaleString('fr-FR')}€</span>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${s.completionRate}%`,
                          backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Service popularity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('appointmentAnalytics.servicePopularity') || 'Services les plus demandés'}
          </h3>
          {byService.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée</p>
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byService.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" fontSize={11} tick={{ fill: '#9ca3af' }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    fontSize={11}
                    tick={{ fill: '#6b7280' }}
                    tickFormatter={(v) => v.length > 14 ? v.slice(0, 14) + '…' : v}
                  />
                  <Tooltip
                    formatter={(value: number) => [value, 'RDV']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={24}>
                    {byService.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Revenue table below chart */}
          {byService.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3 space-y-2">
              {byService.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate">{s.name}</span>
                  <div className="flex gap-3 shrink-0">
                    <span className="text-gray-400">{s.total} RDV</span>
                    <span className="font-medium text-gray-700">{s.revenue.toLocaleString('fr-FR')}€</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row: Busiest day + Peak hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Day of week */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('appointmentAnalytics.busiestDays') || 'Jours les plus chargés'}
          </h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" fontSize={12} tick={{ fill: '#6b7280' }} />
                <YAxis fontSize={11} tick={{ fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => [value, 'RDV']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
                <Bar dataKey="count" fill="#4F6BED" radius={[6, 6, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Peak hours */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('appointmentAnalytics.peakHours') || 'Heures de pointe'}
          </h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHours}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: '#6b7280' }} />
                <YAxis fontSize={11} tick={{ fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => [value, 'RDV']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 13 }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── KPI Card ──────────────────────────────────────────────── */
function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
