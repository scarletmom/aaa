'use client';

import { useState, type ReactNode } from 'react';
import { buttonClass } from '../ui/styles';
import AuthDialog from './AuthDialog';
import type { AuthMode } from './AuthPanel';

const navButtonClass = buttonClass({ solid: true, size: 'ml-1.5 h-[34px] px-4 rounded-full text-[13px]' });

interface LoginButtonProps {
  className?: string;
  children?: ReactNode;
  initialMode?: AuthMode;
}

export default function LoginButton({ className = navButtonClass, children = 'Log in', initialMode }: LoginButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        {children}
      </button>
      <AuthDialog open={open} onClose={() => setOpen(false)} initialMode={initialMode} />
    </>
  );
}
