'use client';

type Tab = 'overview' | 'clients' | 'loyalty' | 'campaigns' | 'analytics' | 'settings';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  scannerHref: string;
}

/* ─── Inline SVG icons (18×18, matching sidebar) ─── */
const icons: Record<string, string> = {
  overview: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
  clients:  'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  scanner:  'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 13a4 4 0 100-8 4 4 0 000 8z',
  campaigns:'M3 11l19-9-9 19-2-8-8-2z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z',
};

export default function MobileBottomNav({ activeTab, onTabChange, scannerHref }: Props) {
  const tabs: { id: Tab | 'scanner'; label: string; icon: string }[] = [
    { id: 'overview',  label: 'Accueil',    icon: icons.overview },
    { id: 'clients',   label: 'Clients',    icon: icons.clients },
    { id: 'scanner',   label: 'Scanner',    icon: icons.scanner },
    { id: 'campaigns', label: 'Campagnes',  icon: icons.campaigns },
    { id: 'settings',  label: 'Plus',       icon: icons.settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-1px_3px_rgba(0,0,0,0.06)] md:hidden pb-safe">
      <div className="flex items-end justify-around px-1 pt-1.5 pb-1">
        {tabs.map(tab => {
          const isScanner = tab.id === 'scanner';
          const isActive = !isScanner && activeTab === tab.id;

          if (isScanner) {
            return (
              <a
                key="scanner"
                href={scannerHref}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/30 active:scale-95 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={tab.icon} />
                  </svg>
                </div>
                <span className="text-[10px] font-semibold text-primary-600 mt-1">Scanner</span>
              </a>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as Tab)}
              className={[
                'flex flex-col items-center justify-center py-1 px-2 tap-target transition-colors',
                isActive ? 'text-primary-600' : 'text-gray-400',
              ].join(' ')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={tab.icon} />
              </svg>
              <span className={`text-[10px] mt-0.5 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
