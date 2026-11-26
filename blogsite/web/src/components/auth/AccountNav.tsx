'use client';

import Link from 'next/link';
import { useState } from 'react';
import { subscribeUrl } from '@/lib/format';
import { proPlan } from '@/lib/roles';
import { useSession } from '@/lib/session';
import ThemeToggle from '../site/ThemeToggle';
import LoginButton from './LoginButton';
import MemberUpgradeDialog from './MemberUpgradeDialog';
import UserMenu from './UserMenu';

const upgradeClass =
  'ml-1 inline-flex h-8 flex-none items-center rounded-full bg-amber-400 px-3.5 text-[13.5px] font-semibold text-black transition-colors hover:bg-amber-300';

interface AccountNavProps {
  /** Puts the theme switch in the account menu; signed-out visitors keep the button. */
  themeInMenu?: boolean;
  /** Member Lite's Upgrade (and a timed Pro's Extend Pro) opens this instead of the subscribe page. */
  onUpgrade?: () => void;
  /** Leaves sign-in and the account menu to a bottom tab bar on phones. */
  menuInTabBar?: boolean;
}

/** A plain Member's Upgrade: Lite or Pro, by way of the videos site's captcha. */
function MemberUpgrade() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={upgradeClass}>Upgrade</button>
      <MemberUpgradeDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ProBadge() {
  return (
    <span title="Member Pro" className="ml-1 inline-flex h-7 flex-none items-center rounded-full bg-amber-400 px-2.5 text-[12px] font-bold tracking-[0.06em] text-black">
      PRO
    </span>
  );
}

export default function AccountNav({ themeInMenu = false, onUpgrade, menuInTabBar = false }: AccountNavProps) {
  const menuClass = menuInTabBar ? 'hidden md:contents' : 'contents';
  const session = useSession();
  if (session) {
    const plan = proPlan(session);
    let action = null;
    if (session.role === 'member') {
      action = <MemberUpgrade />;
    } else if (session.role === 'member-lite') {
      action = onUpgrade
        ? <button type="button" onClick={onUpgrade} aria-haspopup="dialog" className={upgradeClass}>Upgrade</button>
        : <Link href={subscribeUrl} className={upgradeClass}>Upgrade</Link>;
    } else if (plan === 'timed') {
      action = onUpgrade
        ? <button type="button" onClick={onUpgrade} aria-haspopup="dialog" className={upgradeClass}>Extend Pro</button>
        : <ProBadge />;
    } else if (plan === 'lifetime') {
      action = <ProBadge />;
    }
    return (
      <>
        {action}
        <div className={menuClass}>
          <UserMenu session={session} themeInMenu={themeInMenu} />
        </div>
      </>
    );
  }
  return (
    <>
      {themeInMenu && <ThemeToggle />}
      <div className={menuClass}>
        <LoginButton />
      </div>
    </>
  );
}
