'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import BookingSetupGuide from '@/components/BookingSetupGuide'

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t, locale } = useTranslation()

  const NAV_ITEMS = [
    { href: `/${locale}/dashboard/appointments`, label: t('appointmentNav.agenda') },
    { href: `/${locale}/dashboard/appointments/services`, label: t('appointmentNav.services') },
    { href: `/${locale}/dashboard/appointments/staff`, label: t('appointmentNav.staff') },
    { href: `/${locale}/dashboard/appointments/analytics`, label: t('appointmentNav.analytics') },
    { href: `/${locale}/dashboard/appointments/settings`, label: t('appointmentNav.settings') },
  ]

  return (
    // Marges latérales : même convention que le dashboard (px-4 md:p-6) —
    // sans elles le contenu collait au bord de l'écran, surtout sur mobile.
    <div className="px-4 md:px-6 pb-8">
      {/* Underline tabs — professional SaaS pattern */}
      <div className="border-b border-gray-200 mb-5">
        <nav className="flex gap-0 -mb-px overflow-x-auto scrollbar-hide">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ${
                  isActive
                    ? 'text-gray-900'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {item.label}
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-gray-900 rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {children}

      {/* Guide de configuration (suite du tutoriel dashboard) — ne s'affiche
          que si le parcours guidé est en cours (localStorage). */}
      <BookingSetupGuide />
    </div>
  )
}
