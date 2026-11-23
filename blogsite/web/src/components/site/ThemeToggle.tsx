'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '../ui/Icons';

const THEME_KEY = 'ledger-theme';
const currentTheme = () => document.documentElement.getAttribute('data-theme');

/** Round icon button in the nav bar (search, theme). */
export const navToolClass =
  'inline-grid size-[38px] flex-none place-items-center rounded-full border border-transparent bg-transparent text-fg hover:border-fg-2 aria-expanded:border-fg-2';

export function useTheme() {
  // The theme is set by a <head> script before React runs, so it's read after mount.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => setIsDark(currentTheme() === 'dark'), []);

  const toggle = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
    setIsDark(next === 'dark');
  };

  return { isDark, toggle };
}

export default function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={navToolClass}>
      <MoonIcon size={18} className="dark:hidden" />
      <SunIcon size={18} className="hidden dark:block" />
    </button>
  );
}
