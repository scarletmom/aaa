'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { teraboxTabUrl, videosUrl } from '@/lib/format';
import { useSession } from '@/lib/session';
import LoginButton from '../auth/LoginButton';
import UserMenu, { AvatarInitials } from '../auth/UserMenu';
import { CloudPlayIcon, HomeIcon, SearchIcon, UserIcon } from '../ui/Icons';

export type VideoTab = 'home' | 'terabox' | 'search' | null;

interface VideoTabBarProps {
  active: VideoTab;
  searchEnabled: boolean;
  onHome: () => void;
  onSearch: () => void;
}

const tabClass =
  'group flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-[0.01em] text-muted transition-colors aria-[current=page]:text-fg aria-expanded:text-fg aria-pressed:text-fg disabled:opacity-40';

const pillClass =
  'grid h-8 w-14 place-items-center rounded-full transition-colors group-active:bg-surface-2 group-aria-[current=page]:bg-surface-2 group-aria-expanded:bg-surface-2 group-aria-pressed:bg-surface-2';

function TabContent({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <>
      <span className={pillClass}>{icon}</span>
      <span className="max-w-full truncate">{label}</span>
    </>
  );
}

function ProfileTab() {
  const session = useSession();
  if (!session) {
    return (
      <LoginButton className={tabClass}>
        <TabContent icon={<UserIcon />} label="Profile" />
      </LoginButton>
    );
  }
  return (
    <UserMenu
      session={session}
      themeInMenu
      placement="above"
      className="relative flex h-full min-w-0 flex-1"
      buttonClassName={tabClass}
      trigger={<TabContent icon={<AvatarInitials name={session.name} className="size-6 text-[10px]" />} label="Profile" />}
    />
  );
}

export default function VideoTabBar({ active, searchEnabled, onHome, onSearch }: VideoTabBarProps) {
  return (
    <nav
      aria-label="Video sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-[560px] items-stretch px-1">
        <Link href={videosUrl} onClick={onHome} aria-current={active === 'home' ? 'page' : undefined} className={tabClass}>
          <TabContent icon={<HomeIcon filled={active === 'home'} />} label="Home" />
        </Link>
        <Link href={teraboxTabUrl} aria-current={active === 'terabox' ? 'page' : undefined} className={tabClass}>
          <TabContent icon={<CloudPlayIcon />} label="Terabox" />
        </Link>
        <button type="button" onClick={onSearch} disabled={!searchEnabled} aria-pressed={active === 'search'} className={tabClass}>
          <TabContent icon={<SearchIcon size={22} />} label="Search" />
        </button>
        <ProfileTab />
      </div>
    </nav>
  );
}
