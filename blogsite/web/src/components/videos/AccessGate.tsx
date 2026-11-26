'use client';

import { type ReactNode, useState } from 'react';
import { readVideosPass } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/roles';
import type { Session } from '@/lib/session';
import LoginButton from '../auth/LoginButton';
import MemberUpgradeDialog from '../auth/MemberUpgradeDialog';
import { PlaySolidIcon } from '../ui/Icons';

const primaryButton =
  'inline-flex h-12 w-full items-center justify-center rounded-full bg-fg px-6 text-[15px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50';

function GateCard({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <section className="grid min-h-[calc(100dvh-57px)] place-items-center py-10">
      <div className="w-full max-w-[520px] rounded-[20px] border border-line bg-bg px-6 py-9 text-center shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)] sm:px-9">
        <span aria-hidden="true" className="mx-auto mb-4 grid size-[52px] place-items-center rounded-full bg-surface-2 text-accent">
          <PlaySolidIcon size={22} className="ml-0.5" />
        </span>
        <p className="text-[11px] font-bold tracking-[0.08em] text-accent uppercase">Member Lite &amp; Pro</p>
        <h1 className="mt-1.5 font-display text-[30px] leading-[1.1]">{title}</h1>
        <p className="mx-auto mt-2.5 max-w-[380px] font-serif text-[16px] text-fg-2">{text}</p>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}

function UpgradeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={primaryButton}>Upgrade</button>
      <MemberUpgradeDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function AccessGate({ session }: { session: Session | null }) {
  if (!session && readVideosPass()) {
    return (
      <GateCard title="Create your free account" text="Just your name and a quick check, and every video is yours to watch.">
        <LoginButton className={primaryButton} initialMode="register">Create free account</LoginButton>
        <p className="mt-4 text-[14px] text-muted">
          Already have an account?{' '}
          <LoginButton className="font-semibold text-fg underline underline-offset-2 hover:opacity-80" initialMode="signIn">Sign in</LoginButton>
        </p>
      </GateCard>
    );
  }

  if (!session) {
    return (
      <GateCard title="Sign in to watch" text="Videos are for Member Lite and Member Pro accounts. Sign in with yours to start watching.">
        <LoginButton className={primaryButton}>Sign in</LoginButton>
      </GateCard>
    );
  }

  return (
    <GateCard
      title="Videos aren’t in your plan"
      text={`Your ${ROLE_LABELS[session.role]} account covers reading. Upgrade to Member Lite for free, or to Member Pro for no ads.`}
    >
      <UpgradeButton />
    </GateCard>
  );
}
