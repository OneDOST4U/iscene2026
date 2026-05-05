import React from 'react';
import { Search, X, Loader2, FileText, ExternalLink } from 'lucide-react';
import type { ArticleDoc } from './ArticlesManager';
import { articleCategoryLabel } from './articleCategories';

export function participantArticleAttachments(a: ArticleDoc): { url: string; fileName: string }[] {
  const raw = a.attachments;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((x: { url?: string }) => !!x?.url)
      .map((x: { url: string; fileName?: string }) => ({ url: x.url, fileName: x.fileName || 'File' }));
  }
  if (a.attachmentUrl) return [{ url: a.attachmentUrl, fileName: a.attachmentFileName || 'Attachment' }];
  return [];
}

export type ArticleBrowsePanelProps = {
  loading: boolean;
  articles: ArticleDoc[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  categoryFilter: string;
  onCategoryChange: (c: string) => void;
  /** Labels from Firestore `articleCategories` (or defaults); drives filter chips. */
  categoryChipNames: string[];
  /** mobile: px-4 padding inside; desktop: full width content */
  variant: 'mobile' | 'desktop';
  /** When true, omit the mobile “Articles Home” heading + subtitle (nav already labels the tab). */
  hideMobileTitle?: boolean;
};

export function ArticleBrowsePanel({
  loading,
  articles,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  categoryChipNames,
  variant,
  hideMobileTitle = false,
}: ArticleBrowsePanelProps) {
  const filtered = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      const cat = ((a.category || '') as string).trim() || 'Uncategorized';
      if (categoryFilter !== 'all') {
        if (cat !== categoryFilter) return false;
      }
      if (!q) return true;
      const blob = [a.title, a.description, a.authorName, articleCategoryLabel(a)].map((x) => String(x || '').toLowerCase()).join(' ');
      return blob.includes(q);
    });
  }, [articles, searchQuery, categoryFilter]);

  const shell = variant === 'mobile' ? 'px-4 pt-5 pb-4' : 'py-4 sm:py-6 lg:py-8';

  if (loading) {
    return (
      <div className={shell}>
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {variant === 'mobile' && !hideMobileTitle ? (
        <>
          <h2 className="text-2xl font-black tracking-tight">Articles Home</h2>
          <p className="text-sm text-slate-500 mt-1 mb-4">News and updates from the organizers.</p>
        </>
      ) : null}

      <div className={`mb-6 max-w-2xl space-y-3 ${variant === 'desktop' ? '' : ''}`}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search title, description, category, author…"
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm outline-none focus:ring-2 focus:ring-violet-500 shadow-sm"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div
          className={
            variant === 'mobile'
              ? '-mx-4 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]'
              : 'overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]'
          }
          role="region"
          aria-label="Filter articles by category"
        >
          <div
            className={`flex w-max max-w-none flex-nowrap items-stretch gap-2 ${variant === 'mobile' ? 'px-4' : ''}`}
          >
            <button
              type="button"
              onClick={() => onCategoryChange('all')}
              className={`inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3.5 text-xs font-bold transition-colors ${
                categoryFilter === 'all'
                  ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
              }`}
            >
              All categories
            </button>
            {categoryChipNames.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCategoryChange(c)}
                className={`inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-3.5 text-xs font-bold transition-colors ${
                  categoryFilter === c
                    ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
          {articles.length === 0 ? 'No articles published yet.' : 'No articles match your search or category.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const links = participantArticleAttachments(a);
            return (
              <div key={a.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {a.headerImageUrl ? (
                  <div className="h-32 w-full overflow-hidden bg-slate-100">
                    <img src={a.headerImageUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">{a.title}</p>
                    <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                      {articleCategoryLabel(a)}
                    </span>
                  </div>
                  {a.authorName ? (
                    <p className="mt-1 text-[11px] text-slate-400">By {a.authorName}</p>
                  ) : null}
                  <p className="mt-2 max-h-40 min-h-0 overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-relaxed text-slate-600 [scrollbar-width:thin]">
                    {a.description}
                  </p>
                  {links.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3">
                      {links.map((link) => (
                        <li key={link.url}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-violet-600 hover:underline"
                          >
                            <FileText size={14} />
                            {link.fileName}
                            <ExternalLink size={12} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
