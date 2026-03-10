'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, Scissors, Users, Settings } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard/appointments', label: 'Agenda', icon: Calendar },
  { href: '/dashboard/appointments/services', label: 'Services', icon: Scissors },
  { href: '/dashboard/appointments/staff', label: 'Staff', icon: Users },
  { href: '/dashboard/appointments/settings', label: 'Paramètres', icon: Settings },
]

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      {/* Sub-navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          )
        })}
      </div>

      {children}
    </div>
  )
}
