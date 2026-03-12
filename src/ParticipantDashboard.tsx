import React from 'react';
import {
  Calendar,
  MapPin,
  Bell,
  QrCode,
  Award,
  FileText,
  Users,
} from 'lucide-react';
import { User } from 'firebase/auth';

type ParticipantDashboardProps = {
  user: User;
  registration: any;
  onSignOut: () => Promise<void>;
};

export function ParticipantDashboard({
  user,
  registration,
  onSignOut,
}: ParticipantDashboardProps) {
  const [activeTab, setActiveTab] = React.useState<'home' | 'connect' | 'partners' | 'profile'>('home');

  const firstName = (registration?.fullName as string | undefined)?.split(' ')[0] || 'Participant';
  const initials =
    (registration?.fullName as string | undefined)
      ?.split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'P';

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-xs font-bold">
            iS
          </div>
          <span className="text-base font-semibold tracking-tight">iSCENE 2026</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"
          >
            <Bell size={16} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold"
          >
            {initials.slice(0, 2)}
          </button>
        </div>
      </header>

      {/* Content area */}
      <main className="flex-1 px-4 pb-24">
        {activeTab === 'home' && (
          <>
            {/* Hero card */}
            <section className="mb-4">
              <div className="rounded-3xl bg-gradient-to-br from-blue-500 via-blue-700 to-slate-900 p-4 shadow-lg">
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2 py-1 rounded-full bg-white/10 text-[10px] font-semibold uppercase tracking-[0.18em]">
                    Live Soon
                  </span>
                  <span className="text-[11px] text-blue-100 font-medium">
                    ICON · Cauayan City
                  </span>
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

            {/* Quick actions */}
            <section className="mb-4">
              <div className="grid grid-cols-4 gap-3 text-center text-[11px]">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                    <QrCode size={18} />
                  </div>
                  <span>Attendance</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                    <Award size={18} />
                  </div>
                  <span>Certificates</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                    <Calendar size={18} />
                  </div>
                  <span>Schedule</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <span>Materials</span>
                </div>
              </div>
            </section>

            {/* Upcoming sessions (static placeholder for now) */}
            <section className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold">Upcoming Sessions</h2>
                <button className="text-[11px] text-blue-300 font-medium">View all</button>
              </div>
              <div className="space-y-2">
                <div className="rounded-2xl bg-slate-900 px-3 py-3 flex items-center gap-3">
                  <div className="w-14 text-center">
                    <div className="text-sm font-bold">14:00</div>
                    <div className="text-[10px] text-slate-400">APR 9</div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold leading-snug">
                      Smart &amp; Sustainable Cities Plenary
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Main Hall · ICON
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900 px-3 py-3 flex items-center gap-3">
                  <div className="w-14 text-center">
                    <div className="text-sm font-bold">09:00</div>
                    <div className="text-[10px] text-slate-400">APR 10</div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold leading-snug">
                      Breakout: AI &amp; Cybersecurity for LGUs
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Room A · ICON
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Exhibitor highlights (placeholder) */}
            <section>
              <h2 className="text-sm font-semibold mb-2">Exhibitor Highlights</h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                <div className="min-w-[160px] rounded-2xl bg-slate-900 p-3">
                  <div className="h-20 rounded-xl bg-slate-800 mb-2" />
                  <p className="text-xs font-semibold mb-1">TechCorp Global</p>
                  <p className="text-[10px] text-slate-400">Booth #402</p>
                </div>
                <div className="min-w-[160px] rounded-2xl bg-slate-900 p-3">
                  <div className="h-20 rounded-xl bg-slate-800 mb-2" />
                  <p className="text-xs font-semibold mb-1">CloudStream Inc.</p>
                  <p className="text-[10px] text-slate-400">Booth #115</p>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'profile' && (
          <section className="pt-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-sm font-semibold">
                {initials.slice(0, 2)}
              </div>
              <div>
                <p className="text-sm font-semibold">{registration?.fullName}</p>
                <p className="text-[11px] text-slate-400">{user.email}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900 p-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Sector</span>
                <span className="font-medium text-slate-100">{registration?.sector || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Organization</span>
                <span className="font-medium text-slate-100">
                  {registration?.sectorOffice || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Position</span>
                <span className="font-medium text-slate-100">
                  {registration?.positionTitle || '—'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-red-400"
            >
              Sign out
            </button>
          </section>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 h-16 bg-slate-950/95 border-t border-slate-800 flex items-center justify-around text-[10px]">
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 ${
            activeTab === 'home' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900">
            <Users size={16} />
          </div>
          <span>Home</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('connect')}
          className={`flex flex-col items-center gap-1 ${
            activeTab === 'connect' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900">
            <Users size={16} />
          </div>
          <span>Connect</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center -translate-y-4 shadow-lg shadow-blue-500/40"
        >
          <QrCode size={22} />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('partners')}
          className={`flex flex-col items-center gap-1 ${
            activeTab === 'partners' ? 'text-blue-400' : 'text-slate-400'
          }`}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900">
            <Users size={16} />
          </div>
          <span>Partners</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 ${
            activeTab === 'profile' ? 'text-blue-400' : 'text-slate-400'
          }`}
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

