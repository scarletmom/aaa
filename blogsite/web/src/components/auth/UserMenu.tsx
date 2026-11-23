'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { formatStaticDate, initials, noteUrl, videosUrl } from '@/lib/format';
import { canWatchVideos, proPlan, ROLE_LABELS } from '@/lib/roles';
import { logOut } from '@/lib/auth';
import type { Session } from '@/lib/session';
import { useTheme } from '../site/ThemeToggle';
import { MoonIcon } from '../ui/Icons';
import SecurityDialog from './SecurityDialog';

const itemClass = 'block w-full rounded-xl px-3 py-2.5 text-left text-[14px] font-medium hover:bg-surface-2';

function ThemeSwitch() {
  const { isDark, toggle } = useTheme();
  return (
    <button type="button" role="switch" aria-checked={isDark} onClick={toggle} className={cn(itemClass, 'flex items-center gap-2.5')}>
      <MoonIcon size={16} className="flex-none text-muted" />
      <span className="flex-1">Dark theme</span>
      <span aria-hidden="true" className={cn('relative h-5 w-9 flex-none rounded-full transition-colors', isDark ? 'bg-fg' : 'bg-line')}>
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-bg shadow transition-transform', isDark && 'translate-x-4')} />
      </span>
    </button>
  );
}

/** `themeInMenu` puts the theme switch here, for bars that drop their own theme button. */
export default function UserMenu({ session, themeInMenu = false }: { session: Session; themeInMenu?: boolean }) {
  const { name, role } = session;
  const plan = proPlan(session);
  const [open, setOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-1.5">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="user-menu"
        aria-label={`Account menu for ${name}`}
        title={name}
        className="grid size-[38px] place-items-center rounded-full border border-transparent hover:border-fg-2 aria-expanded:border-fg-2"
      >
        <span aria-hidden="true" className="grid size-[30px] place-items-center rounded-full bg-fg text-[12px] font-semibold text-bg">
          {initials(name)}
        </span>
      </button>
      <div
        id="user-menu"
        hidden={!open}
        className="absolute top-[calc(100%+8px)] right-0 z-20 w-[240px] rounded-2xl border border-line bg-bg p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
      >
        <p className="px-3 pt-2 pb-2.5 text-[13px] text-muted">
          Signed in as
          <span className="block truncate text-[15px] font-semibold text-fg">{name}</span>
          <span
            className={cn(
              'mt-1 inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold',
              plan ? 'bg-amber-400 text-black' : 'bg-surface-2 text-fg-2',
            )}
          >
            {ROLE_LABELS[role]}
            {plan === 'lifetime' && ' · Lifetime'}
          </span>
          {plan === 'timed' && session.proUntil && (
            <span className="mt-1 block text-[12.5px]">Pro until {formatStaticDate(session.proUntil)}</span>
          )}
        </p>
        {canWatchVideos(role) && (
          <>
            <Link href={videosUrl} onClick={() => setOpen(false)} className={itemClass}>Videos</Link>
            <Link href={noteUrl} onClick={() => setOpen(false)} className={itemClass}>Notes</Link>
          </>
        )}
        {themeInMenu && <ThemeSwitch />}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSecurityOpen(true);
          }}
          className={itemClass}
        >
          Account security
        </button>
        <button type="button" onClick={logOut} className={itemClass}>
          Log out
        </button>
      </div>
      <SecurityDialog session={session} open={securityOpen} onClose={() => setSecurityOpen(false)} />
    </div>
  );
}
