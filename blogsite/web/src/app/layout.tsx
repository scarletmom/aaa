import type { Metadata, Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import AccountSync from '@/components/auth/AccountSync';
import NavigationTracker from '@/components/site/NavigationTracker';
import VisitTracker from '@/components/site/VisitTracker';
import { getSiteData } from '@/lib/data';
import { fontVariables } from './fonts';
import './globals.css';

// Runs before first paint so the page never flashes the wrong theme.
const THEME_SCRIPT = `(function () {
  var theme = 'light';
  try {
    theme = localStorage.getItem('ledger-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);
})();`;

export async function generateMetadata(): Promise<Metadata> {
  const { site } = await getSiteData();
  return {
    title: { default: `${site.name} — ${site.tagline}`, template: `%s | ${site.name}` },
    description: 'Quillwood Notes is a fictional blog. Every post, person and place on it is invented.',
  };
}

export const viewport: Viewport = { colorScheme: 'light dark' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { site } = await getSiteData();

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Stores ?token= and friends for this tab and trims them from the address bar (see lib/linkQuery.ts). */}
        <script src="/assets/js/query-parser.js" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Suspense fallback={null}>
          <NavigationTracker />
        </Suspense>
        <VisitTracker apiUrl={site.apiUrl} />
        <AccountSync />
      </body>
    </html>
  );
}
