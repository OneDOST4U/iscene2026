import React from 'react';
import {
  Calendar,
  MapPin,
  Bell,
  QrCode,
  FileText,
  Users,
} from 'lucide-react';
import { User } from 'firebase/auth';

export type RoleDashboardBaseProps = {
  user: User;
  registration: any;
  onSignOut: () => Promise<void>;
  roleLabel: string;
  quickActions: { icon: React.ReactNode; label: string }[];
  children?: React.ReactNode;
};

export function RoleDashboardBase({
  user,
  registration,
  onSignOut,
  roleLabel,
  quickActions,
  children,
}: RoleDashboardBaseProps) {
  const [activeTab, setActiveTab] = React.useState<'home' | 'connect' | 'partners' | 'profile'>('home');
  const initials =
    (registration?.fullName as string | undefined)
      ?.split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-xs font-bold">
            iS
          </div>
          <span className="text-base font-semibold tracking-tight">iSCENE 2026</span>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
            <Bell size={16} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold"
          >
            {initials}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24">
        {activeTab === 'home' && (
          <>
            <section className="mb-4">
              <div className="rounded-3xl bg-gradient-to-br from-blue-500 via-blue-700 to-slate-900 p-4 shadow-lg">
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2 py-1 rounded-full bg-white/10 text-[10px] font-semibold uppercase tracking-[0.18em]">
                    {roleLabel}
                  </span>
                  <span className="text-[11px] text-blue-100 font-medium">ICON · Cauayan City</span>
                </div>
                <h1 className="text-xl font-bold leading-snug mb-1">
                  International Smart &amp; Sustainable Cities Expo
                </h1>
                <p className="text-xs text-blue-100 mb-3">
                  April 9–11, 2026 · Isabela Convention Center (ICON)
                </p>
                <div className="flex items-center gap-3 text-[11px] text-blue-100">
                  <div className="flex items-center gap-1">
                    <Calendar size={14} />
                    <span>3-day program</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin size={14} />
                    <span>Cauayan City · Isabela</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-[11px]">
                {quickActions.map((action, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                      {action.icon}
                    </div>
                    <span>{action.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {children}
          </>
        )}

        {activeTab === 'profile' && (
          <section className="pt-2 space-y-4">
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-900 p-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-sm font-bold shadow-inner">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate fill text-sm font-bold text-slate-100">{registration?.fullName || user.email}</p>
                <p className="text-[11px] font-medium text-blue-400">{roleLabel}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900 p-4 space-y-3 text-xs mb-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-slate-400">Email</span>
                <span className="font-semibold text-slate-200 truncate pl-4">{user.email}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-slate-400">Sector</span>
                <span className="font-semibold text-slate-200 text-right">{registration?.sector || '—'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-slate-400">Organization</span>
                <span className="font-semibold text-slate-200 text-right">{registration?.sectorOffice || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Position</span>
                <span className="font-semibold text-slate-200 text-right">{registration?.positionTitle || '—'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="w-full rounded-full border border-red-500/30 py-3 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/10 mb-8"
            >
              Sign out
            </button>
          </section>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 h-16 bg-slate-950/95 border-t border-slate-800 flex items-center justify-around text-[10px]">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-blue-400' : 'text-slate-400'}`}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900">
            <Users size={16} />
          </div>
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('connect')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'connect' ? 'text-blue-400' : 'text-slate-400'}`}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900">
            <Users size={16} />
          </div>
          <span>Connect</span>
        </button>
        <button className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center -translate-y-4 shadow-lg shadow-blue-500/40">
          <QrCode size={22} />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('partners')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'partners' ? 'text-blue-400' : 'text-slate-400'}`}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900">
            <Users size={16} />
          </div>
          <span>Partners</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-blue-400' : 'text-slate-400'}`}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900">
            <Users size={16} />
          </div>
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}
