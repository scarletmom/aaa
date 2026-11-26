'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/cn';
import { searchUrl } from '@/lib/format';
import { useCurrentPage, useLinkQuery } from '@/lib/linkQuery';
import { SearchIcon } from '../ui/Icons';
import AccountNav from '../auth/AccountNav';
import { buttonClass } from '../ui/styles';
import ThemeToggle, { navToolClass } from './ThemeToggle';

export interface NavItem {
  slug: string;
  name: string;
  href: string;
}

interface PrimaryNavProps {
  items: NavItem[];
  /** Post id → section slug, to highlight a post's section. */
  articleSections: Record<string, string>;
}

function activeSlug(pathname: string, articleSections: Record<string, string>): string | null {
  const [kind, value] = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!kind) return 'home';
  if (kind === 'section') return value ?? null;
  if (kind === 'article' && value) return articleSections[value] ?? null;
  return null;
}

export default function PrimaryNav({ items, articleSections }: PrimaryNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { path } = useCurrentPage();
  const query = useLinkQuery().get('q') || '';
  const [searchOpen, setSearchOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const active = activeSlug(pathname, articleSections);

  // Each page starts with the panel open only when it shows search results, as a full page load did.
  useEffect(() => {
    setSearchOpen(Boolean(query));
    setValue(query);
  }, [path, query]);

  const toggleSearch = () => {
    flushSync(() => setSearchOpen(!searchOpen));
    if (!searchOpen) inputRef.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(searchUrl(value));
  };

  return (
    <nav aria-label="Sections" className="border-y border-t-rule border-b-line bg-surface">
      <div className="page-container flex items-center gap-4">
        <ul className="no-scrollbar flex min-w-0 flex-1 overflow-x-auto">
          {items.map((item, index) => (
            <li key={item.slug}>
              <Link
                href={item.href}
                aria-current={item.slug === active ? 'page' : undefined}
                className={cn(
                  'block border-b-2 border-transparent pt-[17px] pb-[15px] text-[16px] font-medium whitespace-nowrap hover:text-accent',
                  'aria-[current=page]:border-accent aria-[current=page]:text-accent',
                  'max-md:pt-[14px] max-md:pb-3 max-md:text-[15px]',
                  index === 0 ? 'pr-3.5 max-md:pr-[11px]' : 'px-3.5 max-md:px-[11px]',
                )}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={toggleSearch}
            aria-controls="search-panel"
            aria-expanded={searchOpen}
            aria-label="Search"
            className={navToolClass}
          >
            <SearchIcon size={18} />
          </button>
          <ThemeToggle />
          <AccountNav />
        </div>
      </div>
      <div id="search-panel" hidden={!searchOpen} className="border-t border-line bg-bg py-3.5">
        <div className="page-container">
          <form
            role="search"
            onSubmit={submit}
            className="mx-auto flex h-11 max-w-[640px] items-center gap-2.5 rounded-full border border-line bg-surface pr-[5px] pl-4 text-muted focus-within:border-fg-2"
          >
            <SearchIcon />
            <label className="sr-only" htmlFor="site-search">Search</label>
            <input
              ref={inputRef}
              id="site-search"
              type="search"
              name="q"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Search guides, features and topics"
              autoComplete="off"
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            <button type="submit" className={buttonClass({ solid: true, size: 'h-[34px] px-4 rounded-full text-[13px]' })}>
              Search
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
