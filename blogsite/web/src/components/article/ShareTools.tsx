'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { CheckIcon, LinkIcon, MailIcon, PrintIcon } from '../ui/Icons';

const COPIED_MS = 1800;
const iconButton = 'inline-grid size-9 place-items-center rounded-full border bg-transparent';
const idle = 'border-line text-fg hover:border-fg-2';

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const href = window.location.href;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      window.prompt('Copy this link:', href);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy link"
      title="Copy link"
      className={cn(iconButton, copied ? 'border-up text-up' : idle)}
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
    </button>
  );
}

/** Copy link, share by email and print buttons beside the byline. */
export default function ShareTools({ title }: { title: string }) {
  // The page's full address is only known in the browser.
  const [pageUrl, setPageUrl] = useState('');
  useEffect(() => setPageUrl(window.location.href), []);
  const mailto = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${pageUrl}`)}`;

  return (
    <div className="flex gap-2 print:hidden">
      <CopyLinkButton />
      <a href={mailto} aria-label="Share by email" title="Share by email" className={cn(iconButton, idle)}><MailIcon /></a>
      <button type="button" onClick={() => window.print()} aria-label="Print" title="Print" className={cn(iconButton, idle)}>
        <PrintIcon />
      </button>
    </div>
  );
}
