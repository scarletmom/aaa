'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { teraboxTabUrl, videosUrl } from '@/lib/format';
import AccountNav from '../auth/AccountNav';
import { navToolClass } from '../site/ThemeToggle';
import { CloseIcon, CloudPlayIcon, HomeIcon, ImageIcon, SearchIcon } from '../ui/Icons';
import BrandMark from './BrandMark';
import ImageSearchPanel from './ImageSearchPanel';
import { videoContainer } from './styles';
import type { VideoTab } from './VideoTabBar';

interface VideoTopBarProps {
  brand: string;
  /** The section the desktop links (beside the account menu) mark as current; phones use the tab bar instead. */
  active: VideoTab;
  onHome: () => void;
  /** Hidden until the visitor can watch, since there's nothing to search. */
  searchEnabled: boolean;
  /** On phones the search box takes over the bar while this is on; the tab bar's Search turns it on. */
  searching: boolean;
  onSearchingChange: (searching: boolean) => void;
  query: string;
  onQuery: (query: string) => void;
  /** The image being searched with, shown as a chip in the box. */
  image?: { previewUrl: string; name: string } | null;
  /** Turns on searching by image. */
  onImage?: (file: File) => void;
  onClearImage?: () => void;
  /** Opens the Pro plans from Member Lite's Upgrade button. */
  onUpgrade: () => void;
}

const sectionLinkClass =
  'flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-semibold xl:px-3 text-muted transition-colors hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-surface-2 aria-[current=page]:text-fg';

export default function VideoTopBar({
  brand,
  active,
  onHome,
  searchEnabled,
  searching,
  onSearchingChange,
  query,
  onQuery,
  image = null,
  onImage,
  onClearImage,
  onUpgrade,
}: VideoTopBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const closeSearch = () => {
    onSearchingChange(false);
    setPanelOpen(false);
    onQuery('');
    onClearImage?.();
  };

  const pickImage = (file: File) => {
    setPanelOpen(false);
    inputRef.current?.blur();
    onImage?.(file);
  };

  useEffect(() => {
    if (!panelOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setPanelOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [panelOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md backdrop-saturate-150">
      <div className={cn(videoContainer, 'flex h-14 items-center gap-2 md:gap-6')}>
        <Link href={videosUrl} className={cn('flex min-w-0 flex-none items-center gap-1.5 sm:gap-2', searching && 'max-md:hidden')}>
          <BrandMark />
          <span className="font-display text-[18px] leading-none font-extrabold tracking-[-0.01em] whitespace-nowrap sm:text-[20px]">{brand}</span>
        </Link>

        {searchEnabled && (
          <>
            <div ref={searchRef} className={cn('relative mx-auto max-w-[520px] flex-1', searching ? 'block' : 'hidden md:block')}>
              <div
                onDragEnter={() => onImage && setPanelOpen(true)}
                className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface pr-1.5 pl-3.5 text-muted focus-within:border-fg-2"
              >
                <SearchIcon className="flex-none" />
                {image && (
                  <span className="flex min-w-0 flex-none items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-1 pl-0.5 text-[12.5px] font-semibold text-fg">
                    <img src={image.previewUrl} alt="" className="size-6 rounded-full object-cover" />
                    <span className="max-w-[110px] truncate max-sm:hidden" title={image.name}>Image</span>
                    <button type="button" onClick={onClearImage} aria-label="Clear image search" className="grid size-5 place-items-center rounded-full hover:bg-line">
                      <CloseIcon size={12} />
                    </button>
                  </span>
                )}
                <label htmlFor="video-search" className="sr-only">Search videos</label>
                <input
                  id="video-search"
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value && image) onClearImage?.();
                    if (value) setPanelOpen(false);
                    onQuery(value);
                  }}
                  onFocus={() => onImage && !query && setPanelOpen(true)}
                  onClick={() => onImage && !query && setPanelOpen(true)}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                  placeholder={image ? 'Or search by words' : 'Search videos'}
                  autoComplete="off"
                  enterKeyHint="search"
                  aria-controls={onImage ? 'image-search-panel' : undefined}
                  aria-expanded={onImage ? panelOpen : undefined}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
                />
                {onImage && (
                  <button
                    type="button"
                    onClick={() => setPanelOpen(!panelOpen)}
                    aria-label="Search with an image"
                    title="Search with an image"
                    aria-expanded={panelOpen}
                    className="grid size-8 flex-none place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg aria-expanded:bg-surface-2 aria-expanded:text-fg"
                  >
                    <ImageIcon size={18} />
                  </button>
                )}
                <button type="button" onClick={closeSearch} aria-label="Close search" className={cn(navToolClass, 'size-8 md:hidden')}>
                  <CloseIcon size={16} />
                </button>
              </div>
              {panelOpen && onImage && <ImageSearchPanel id="image-search-panel" onImage={pickImage} />}
            </div>
          </>
        )}

        <div className={cn('ml-auto flex flex-none items-center gap-1 md:ml-0', !searchEnabled && 'md:ml-auto', searching && 'max-md:hidden')}>
          <nav aria-label="Video sections" className="hidden items-center gap-1 md:flex">
            <Link href={videosUrl} onClick={onHome} title="Home" aria-current={active === 'home' ? 'page' : undefined} className={sectionLinkClass}>
              <HomeIcon size={18} filled={active === 'home'} />
              <span className="max-xl:sr-only">Home</span>
            </Link>
            <Link href={teraboxTabUrl} title="Terabox Videos" aria-current={active === 'terabox' ? 'page' : undefined} className={sectionLinkClass}>
              <CloudPlayIcon size={18} />
              <span className="max-xl:sr-only">Terabox Videos</span>
            </Link>
          </nav>
          <span aria-hidden="true" className="mx-1.5 hidden h-6 w-px bg-line md:block" />
          <AccountNav themeInMenu menuInTabBar onUpgrade={onUpgrade} />
        </div>
      </div>
    </header>
  );
}
