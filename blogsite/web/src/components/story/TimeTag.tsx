'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatDateTime, formatStaticDate, formatStaticDateTime, timeAgo } from '@/lib/format';

interface TimeTagProps {
  iso: string;
  /** Show the full local date and time instead of "2 hours ago". */
  full?: boolean;
  className?: string;
}

// The prerendered HTML shows a fixed date; the browser swaps in "2 hours ago" (or the full local time).
export default function TimeTag({ iso, full = false, className }: TimeTagProps) {
  const [local, setLocal] = useState<{ text: string; title?: string } | null>(null);

  useEffect(() => {
    setLocal(full ? { text: formatDateTime(iso) } : { text: timeAgo(iso), title: formatDateTime(iso) });
  }, [iso, full]);

  const text = local?.text ?? (full ? formatStaticDateTime(iso) : formatStaticDate(iso));
  return (
    <time dateTime={iso} title={local?.title} className={cn('font-sans text-[13px] text-muted', className)}>
      {text}
    </time>
  );
}
