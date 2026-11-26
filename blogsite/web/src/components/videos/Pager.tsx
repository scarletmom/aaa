const pagerButton =
  'h-10 rounded-full border border-line bg-surface px-5 text-[14px] font-semibold transition-colors hover:border-fg disabled:pointer-events-none disabled:opacity-40';

interface PagerProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  /** Another page is loading, so turning again waits. */
  busy?: boolean;
}

export default function Pager({ page, pages, onPage, busy = false }: PagerProps) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-center gap-3 pb-12">
      <button type="button" onClick={() => onPage(page - 1)} disabled={busy || page <= 1} className={pagerButton}>
        Previous
      </button>
      <span className="text-[13.5px] text-muted tabular-nums">Page {page} of {pages}</span>
      <button type="button" onClick={() => onPage(page + 1)} disabled={busy || page >= pages} className={pagerButton}>
        Next
      </button>
    </nav>
  );
}
