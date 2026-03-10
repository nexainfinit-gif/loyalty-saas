'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard/appointments', label: 'Agenda' },
  { href: '/dashboard/appointments/services', label: 'Services' },
  { href: '/dashboard/appointments/staff', label: 'Staff' },
  { href: '/dashboard/appointments/settings', label: 'Paramètres' },
]

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
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
    </div>
  )
}
