'use client';
import { useState } from 'react';

type Tab = 'overview' | 'clients' | 'loyalty' | 'campaigns' | 'analytics' | 'settings';

interface Props {
  restaurantName: string;
  logoUrl: string | null;
  primaryColor: string;
  businessType: string | null;
  planName: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onSignOut: () => void;
}

const BUSINESS_TYPE_EMOJI: Record<string, string> = {
  restaurant: '🍽️', cafe: '☕', salon_beaute: '💅', salon_coiffure: '💇', boutique: '🛍️',
};

const MORE_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'loyalty',   label: 'Fidélité',   icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7' },
  { id: 'analytics', label: 'Analytics',  icon: 'M12 20V10m6 10V4M6 20v-4' },
  { id: 'settings',  label: 'Paramètres', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z' },
];

export default function MobileHeader({
  restaurantName, logoUrl, primaryColor, businessType, planName,
  activeTab, onTabChange, onSignOut,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  const tabLabels: Record<Tab, string> = {
    overview: "Vue d'ensemble",
    clients: 'Clients',
    loyalty: 'Fidélité',
    campaigns: 'Campagnes',
    analytics: 'Analytics',
    settings: 'Paramètres',
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 md:hidden pt-safe">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: logo + name */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center text-lg shadow-sm"
              style={{ background: `color-mix(in srgb, ${primaryColor} 15%, white)` }}
            >
              {logoUrl
                ? <img src={logoUrl} alt="" className="w-full h-full object-contain" />
                : (BUSINESS_TYPE_EMOJI[businessType ?? ''] ?? '🏪')}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate max-w-[160px]">{tabLabels[activeTab]}</p>
            </div>
          </div>

          {/* Right: more menu */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors tap-target"
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            )}
          </button>
        </div>
      </header>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-14 right-3 z-50 w-56 bg-white rounded-2xl border border-gray-100 shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden md:hidden animate-fade-up">
            {/* Restaurant info */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <p className="text-sm font-semibold text-gray-900 truncate">{restaurantName}</p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{planName}</span>
            </div>

            {/* Extra tabs not in bottom nav */}
            <div className="py-1.5">
              {MORE_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { onTabChange(tab.id); setMenuOpen(false); }}
                  className={[
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:bg-gray-50',
                    activeTab === tab.id ? 'text-primary-600 bg-primary-50' : 'text-gray-700',
                  ].join(' ')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={tab.icon} />
                  </svg>
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Sign out */}
            <div className="border-t border-gray-100 py-1.5">
              <button
                onClick={() => { onSignOut(); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-400 active:bg-gray-50 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="text-sm font-medium">Déconnexion</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
