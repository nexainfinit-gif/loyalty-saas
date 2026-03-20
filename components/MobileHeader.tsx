'use client';
import { useEffect, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';
import LocaleLink from '@/components/LocaleLink';

type Tab = 'overview' | 'clients' | 'loyalty' | 'campaigns' | 'analytics' | 'settings' | 'wallet';

interface Props {
  restaurantName: string;
  logoUrl: string | null;
  primaryColor: string;
  businessType: string | null;
  planName: string;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onSignOut: () => void;
  drawerOpen: boolean;
  onDrawerToggle: (open: boolean) => void;
  enabledKpiKeys?: string[];
  showUpgrade?: boolean;
  onUpgrade?: () => void;
}

const BUSINESS_TYPE_EMOJI: Record<string, string> = {
  restaurant: '🍽️', cafe: '☕', salon_beaute: '💅', salon_coiffure: '💇', boutique: '🛍️',
};

const BOOKING_ELIGIBLE_TYPES = new Set([
  'salon_coiffure', 'salon_beaute', 'barbershop', 'spa', 'bien_etre',
]);

export default function MobileHeader({
  restaurantName, logoUrl, primaryColor, businessType, planName,
  activeTab, onTabChange, onSignOut,
  drawerOpen, onDrawerToggle,
  enabledKpiKeys = [], showUpgrade, onUpgrade,
}: Props) {
  const { t } = useTranslation();

  const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',   label: t('nav.overview'),   icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z' },
    { id: 'clients',    label: t('nav.clients'),    icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75' },
    { id: 'loyalty',    label: t('nav.loyalty'),    icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7' },
    { id: 'campaigns',  label: t('nav.campaigns'),  icon: 'M3 11l19-9-9 19-2-8-8-2z' },
    { id: 'analytics',  label: t('nav.analytics'),  icon: 'M12 20V10m6 10V4M6 20v-4' },
    { id: 'settings',   label: t('nav.settings'),   icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z' },
  ];

  const EXTRA_LINKS: { label: string; href: string; icon: string }[] = [
    { label: t('mobile.scannerQr'), href: '/dashboard/scanner', icon: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 13a4 4 0 100-8 4 4 0 000 8z' },
    { label: t('mobile.billing'), href: '/dashboard/billing', icon: 'M1 4h22v16H1V4z M1 10h22' },
  ];

  const tabLabels: Record<Tab, string> = {
    overview: t('nav.overview'),
    clients: t('nav.clients'),
    loyalty: t('nav.loyalty'),
    campaigns: t('nav.campaigns'),
    analytics: t('nav.analytics'),
    settings: t('nav.settings'),
    wallet: t('nav.walletStudio'),
  };

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [drawerOpen]);

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDrawerToggle(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen, onDrawerToggle]);

  const handleTabClick = useCallback((tab: Tab) => {
    onTabChange(tab);
    onDrawerToggle(false);
  }, [onTabChange, onDrawerToggle]);

  const showWalletLink = enabledKpiKeys.includes('wallet_pass_rate');

  return (
    <>
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 lg:hidden pt-safe">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left: hamburger + title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => onDrawerToggle(true)}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors -ml-1"
              aria-label={t('mobile.openMenu')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <p className="text-sm font-semibold text-gray-900 truncate">{tabLabels[activeTab]}</p>
          </div>

          {/* Right: logo */}
          <div
            className="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-sm shadow-sm"
            style={{ background: `color-mix(in srgb, ${primaryColor} 15%, white)` }}
          >
            {logoUrl
              ? <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              : (BUSINESS_TYPE_EMOJI[businessType ?? ''] ?? '🏪')}
          </div>
        </div>
      </header>

      {/* ── Overlay ── */}
      <div
        className={[
          'fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 lg:hidden',
          drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={() => onDrawerToggle(false)}
        aria-hidden="true"
      />

      {/* ── Drawer sidebar ── */}
      <aside
        className={[
          'fixed top-0 left-0 bottom-0 z-50 w-[85vw] max-w-72 bg-white flex flex-col',
          'shadow-[4px_0_24px_rgba(0,0,0,0.12)]',
          'transition-transform duration-300 ease-out lg:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
          <div
            className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center text-xl shadow-sm"
            style={{ background: `color-mix(in srgb, ${primaryColor} 15%, white)` }}
          >
            {logoUrl
              ? <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              : (BUSINESS_TYPE_EMOJI[businessType ?? ''] ?? '🏪')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{restaurantName}</p>
            <span className={[
              'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md inline-block mt-0.5',
              planName === 'pro'     ? 'bg-purple-100 text-purple-700' :
              planName === 'growth'  ? 'bg-primary-100 text-primary-700' :
                                       'bg-gray-100 text-gray-500',
            ].join(' ')}>
              {planName}
            </span>
          </div>
          {/* Close button */}
          <button
            onClick={() => onDrawerToggle(false)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            aria-label={t('mobile.closeMenu')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 pb-20 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150',
                  isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100',
                ].join(' ')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                <span className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Divider */}
          <div className="h-px bg-gray-100 my-2" />

          {/* Extra links */}
          {EXTRA_LINKS.map(link => (
            <LocaleLink
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={link.icon} />
              </svg>
              <span className="text-sm font-medium">{link.label}</span>
            </LocaleLink>
          ))}

          {/* Wallet Studio (conditional) */}
          {showWalletLink && (
            <LocaleLink
              href="/dashboard/wallet"
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 010-4h14v4" /><path d="M3 5v14a2 2 0 002 2h16v-5" /><path d="M18 12a2 2 0 000 4h4v-4Z" />
              </svg>
              <span className="text-sm font-medium">{t('nav.walletStudio')}</span>
            </LocaleLink>
          )}

          {/* Booking Rebites (conditional — salons, spas, beauty & wellness) */}
          {BOOKING_ELIGIBLE_TYPES.has(businessType ?? '') && (
            <LocaleLink
              href="/dashboard/appointments"
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>
              </svg>
              <span className="text-sm font-medium">{t('nav.booking')}</span>
            </LocaleLink>
          )}

          {/* Divider */}
          <div className="h-px bg-gray-100 my-2" />

          {/* Upgrade card — inside scroll area so sign-out is always reachable */}
          {showUpgrade && onUpgrade && (
            <div className="rounded-xl p-3 mb-2 bg-gradient-to-br from-purple-600 to-primary-600 text-white">
              <p className="text-xs font-bold mb-0.5">{t('mobile.upgradeTitle')}</p>
              <p className="text-[11px] text-white/70 mb-2.5">{t('mobile.upgradeSubtitle')}</p>
              <button
                onClick={() => { onUpgrade(); onDrawerToggle(false); }}
                className="w-full bg-white text-purple-700 text-xs font-bold py-1.5 rounded-xl hover:bg-white/90 transition-colors"
              >
                {t('mobile.upgradeBtn')}
              </button>
            </div>
          )}

          {/* Sign out */}
          <button
            onClick={() => { onSignOut(); onDrawerToggle(false); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="text-sm font-medium">{t('mobile.signOut')}</span>
          </button>
        </nav>
      </aside>
    </>
  );
}
