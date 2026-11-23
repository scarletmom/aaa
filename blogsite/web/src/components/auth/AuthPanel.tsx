'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { cn } from '@/lib/cn';
import { type Account, AuthError, clearVideosPass, isAccountNumber, register, type Registered, signIn } from '@/lib/auth';
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, WarningIcon } from '../ui/Icons';
import Turnstile from './Turnstile';

export type AuthMode = 'signIn' | 'register';

const HEADINGS: Record<AuthMode | 'key', { title: string; subtitle: string }> = {
  signIn: { title: 'Welcome back', subtitle: 'Enter your account number' },
  register: { title: 'Create your account', subtitle: 'Just your name, and we’ll make your key' },
  key: { title: 'Your key is ready', subtitle: 'This number is the only way to log in' },
};

export const fieldClass =
  'h-[54px] w-full rounded-2xl border border-line bg-surface px-5 text-[16px] text-fg outline-none placeholder:text-muted focus:border-fg-2';
export const primaryButtonClass =
  'h-[54px] w-full rounded-full bg-fg text-[17px] font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
export const errorMessage = (error: unknown) => (error instanceof AuthError ? error.message : 'Something went wrong. Please try again.');

export type SignedIn = (account: Account) => void;

interface AuthPanelProps {
  onSignedIn: SignedIn;
  /** Told when a new key is on screen, so the dialog can refuse to close and lose it. */
  onKeyShown: () => void;
  initialMode?: AuthMode;
  notice?: string;
  /** The videos site's pass; registering with it makes the account Member Lite. */
  videosPass?: string;
}

export default function AuthPanel({ onSignedIn, onKeyShown, initialMode = 'signIn', notice, videosPass = '' }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [registered, setRegistered] = useState<Registered | null>(null);
  const { title, subtitle } = HEADINGS[registered ? 'key' : mode];

  const showKey = (result: Registered) => {
    setRegistered(result);
    onKeyShown();
  };

  return (
    <div className="flex flex-col items-center">
      <div aria-hidden="true" className="grid size-16 place-items-center rounded-2xl bg-fg font-display text-[38px] leading-none font-extrabold text-bg">
        Q
      </div>
      <h2 id="auth-title" className="mt-6 text-center text-[28px] leading-tight font-bold tracking-[-0.01em]">{title}</h2>
      <p className="mt-2 text-center text-[16px] text-muted">{subtitle}</p>
      {notice && !registered && (
        <div role="alert" className="mt-5 flex w-full gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3.5 text-[14px] leading-relaxed text-fg-2">
          <WarningIcon className="mt-px flex-none text-accent" />
          <p>{notice}</p>
        </div>
      )}

      <div hidden={Boolean(registered)} className="mt-7 flex w-full rounded-full border border-line bg-surface p-1.5">
        {(['signIn', 'register'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={mode === tab}
            onClick={() => setMode(tab)}
            className={cn(
              'h-11 flex-1 rounded-full text-[16px] font-semibold transition-colors',
              mode === tab ? 'bg-fg text-bg shadow-[0_2px_12px_rgba(0,0,0,0.18)]' : 'text-muted hover:text-fg',
            )}
          >
            {tab === 'signIn' ? 'Sign In' : 'Register'}
          </button>
        ))}
      </div>

      <div className="mt-7 w-full">
        {registered ? <GeneratedKey {...registered} onSignedIn={onSignedIn} />
          : mode === 'signIn' ? <SignInForm onSignedIn={onSignedIn} />
          : <RegisterForm videosPass={videosPass} onRegistered={showKey} />}
      </div>
    </div>
  );
}

/** A Turnstile token works once, so a failed attempt remounts the widget for a fresh one. */
function useCaptcha() {
  const [token, setToken] = useState('');
  const [round, setRound] = useState(0);
  return { token, widget: <Turnstile key={round} onToken={setToken} />, renew: () => setRound((n) => n + 1) };
}

function SignInForm({ onSignedIn }: { onSignedIn: SignedIn }) {
  const [accountNumber, setAccountNumber] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const captcha = useCaptcha();
  const complete = isAccountNumber(accountNumber);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete || !captcha.token) return;
    setBusy(true);
    setError('');
    try {
      onSignedIn(await signIn({ accountNumber, captchaToken: captcha.token }));
    } catch (failure) {
      setError(errorMessage(failure));
      captcha.renew();
      setBusy(false);
    }
  };

  const toggleLabel = visible ? 'Hide account number' : 'Show account number';
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="relative">
        <label htmlFor="account-number" className="sr-only">Account number</label>
        <input
          id="account-number"
          name="account-number"
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          autoCapitalize="off"
          spellCheck={false}
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value.replace(/\s/g, '').slice(0, 36))}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          className={cn(fieldClass, 'pr-14 font-mono text-[14px]')}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-fg"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {captcha.widget}
      {error && <p role="alert" className="text-center text-[14px] text-accent">{error}</p>}
      <button type="submit" disabled={!complete || !captcha.token || busy} className={primaryButtonClass}>
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}

function RegisterForm({ videosPass, onRegistered }: { videosPass: string; onRegistered: (result: Registered) => void }) {
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const captcha = useCaptcha();
  const name = fullName.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name || !captcha.token) return;
    setBusy(true);
    setError('');
    try {
      const result = await register({ fullName: name, captchaToken: captcha.token, videosPass: videosPass || undefined });
      clearVideosPass();
      onRegistered(result);
    } catch (failure) {
      setError(errorMessage(failure));
      captcha.renew();
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-4">
      <label htmlFor="full-name" className="sr-only">Full name</label>
      <input
        id="full-name"
        name="name"
        autoComplete="name"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        placeholder="Enter your full name"
        maxLength={120}
        className={fieldClass}
      />
      {captcha.widget}
      {error && <p role="alert" className="text-center text-[14px] text-accent">{error}</p>}
      <button type="submit" disabled={!name || !captcha.token || busy} className={primaryButtonClass}>
        {busy ? 'Generating…' : 'Generate my key'}
      </button>
    </form>
  );
}

const SCRAMBLE_TICK_MS = 45;
const SETTLE_DELAY_MS = 400;
const SETTLE_STAGGER_MS = 40;
const HEX = '0123456789abcdef';

const randomHex = (length: number) => Array.from({ length }, () => HEX[Math.floor(Math.random() * 16)]).join('');

/** Shows random characters that settle into `target` one by one, left to right. */
function useKeyReveal(target: string) {
  const [settled, setSettled] = useState(0);
  const [noise, setNoise] = useState(() => randomHex(target.length));

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSettled(target.length);
      return;
    }
    const start = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - start - SETTLE_DELAY_MS;
      const count = Math.min(target.length, Math.max(0, Math.floor(elapsed / SETTLE_STAGGER_MS) + 1));
      setSettled(count);
      setNoise(randomHex(target.length));
      if (count === target.length) clearInterval(timer);
    }, SCRAMBLE_TICK_MS);
    return () => clearInterval(timer);
  }, [target]);

  return { settled, noise, done: settled === target.length };
}

export function GeneratedKey({ account, accountNumber, onSignedIn }: Registered & { onSignedIn: SignedIn }) {
  const { settled, noise, done } = useKeyReveal(accountNumber);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
    } catch {
      // Clipboard blocked; the number stays visible and selectable.
    }
  };

  let offset = 0;
  const groups = accountNumber.split('-').map((group) => {
    const start = offset;
    offset += group.length + 1;
    return { start, length: group.length };
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-center text-[16px] text-muted">
        Here&apos;s your key, <span className="font-semibold text-fg">{account.name}</span>.
      </p>
      <div
        className={cn(
          'flex w-full items-center gap-2 rounded-2xl border bg-surface py-3 pr-2 pl-4 transition-[border-color,box-shadow] duration-500',
          done ? 'border-fg-2 shadow-[0_0_0_4px_var(--color-surface-2)]' : 'border-line',
        )}
      >
        <div aria-hidden="true" className="flex flex-1 flex-wrap justify-center gap-x-[0.45em] font-mono text-[clamp(13px,3.6vw,16px)] font-semibold">
          {groups.map(({ start, length }) => (
            <span key={start} className="flex">
              {Array.from({ length }, (_, i) => {
                const index = start + i;
                const isSettled = index < settled;
                return (
                  <span
                    key={`${index}-${isSettled}`}
                    className={cn('inline-block w-[0.62em] text-center', isSettled ? 'text-fg motion-safe:animate-digit-in' : 'text-muted/60')}
                  >
                    {isSettled ? accountNumber[index] : noise[index]}
                  </span>
                );
              })}
            </span>
          ))}
        </div>
        <span className="sr-only" aria-live="polite">
          {done ? `Your account number is ${accountNumber}` : 'Generating your account number'}
        </span>
        <button
          type="button"
          onClick={copy}
          disabled={!done}
          aria-label={copied ? 'Copied' : 'Copy account number'}
          title={copied ? 'Copied' : 'Copy account number'}
          className="grid size-10 flex-none place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
        >
          {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
        </button>
      </div>
      <div role="note" className="flex w-full gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3.5 text-[14px] leading-relaxed text-fg-2">
        <WarningIcon className="mt-px flex-none text-accent" />
        <p>
          <strong className="font-semibold text-fg">Keep it safe.</strong> There&apos;s no way to log in if you lose it,
          and we can&apos;t recover or reset it for you.
        </p>
      </div>
      <button type="button" onClick={() => onSignedIn(account)} disabled={!done} className={primaryButtonClass}>
        I’ve kept my key safe
      </button>
    </div>
  );
}
