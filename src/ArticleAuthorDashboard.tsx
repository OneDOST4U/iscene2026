import React from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { LogOut, FileText } from 'lucide-react';
import { ArticlesManager } from './ArticlesManager';

type Props = {
  user: FirebaseUser;
  registration: any;
  onSignOut: () => Promise<void>;
};

export function ArticleAuthorDashboard({ user, registration, onSignOut }: Props) {
  const fullName = (registration?.fullName as string) || user.email || 'Author';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="relative sticky top-0 z-20 overflow-hidden border-b border-violet-900/20 shadow-md">
        <div
          className="absolute inset-0 bg-gradient-to-br from-violet-600 via-indigo-700 to-violet-900"
          aria-hidden
        />
        <div
          className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-2 ring-white/25 backdrop-blur-sm">
              <FileText size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black tracking-tight text-white drop-shadow-sm">Articles</h1>
              <p className="truncate text-xs font-medium text-violet-100/95">{fullName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <ArticlesManager mode="author" user={user} authorDisplayName={fullName} />
      </main>
    </div>
  );
}
