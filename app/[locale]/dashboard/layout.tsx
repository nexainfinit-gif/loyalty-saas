import InstallAppBanner from '@/components/InstallAppBanner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      {children}
      <InstallAppBanner />
    </div>
  );
}
