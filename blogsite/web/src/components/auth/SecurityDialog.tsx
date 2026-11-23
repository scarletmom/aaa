'use client';

import { type FormEvent, useState } from 'react';
import { cn } from '@/lib/cn';
import { changeAccountNumber, isAccountNumber, type Registered, signOutOtherDevices } from '@/lib/auth';
import { getSession, saveSession, type Session } from '@/lib/session';
import { CheckIcon, EyeIcon, EyeOffIcon } from '../ui/Icons';
import Modal from '../ui/Modal';
import { errorMessage, fieldClass, GeneratedKey, primaryButtonClass } from './AuthPanel';

type Action = 'signOutOthers' | 'newNumber';

const secondaryButtonClass =
  'h-[52px] w-full rounded-full border border-line text-[16px] font-semibold transition-colors hover:border-fg disabled:cursor-not-allowed disabled:opacity-40';

/** Signs out other devices, or replaces a leaked account number. A new number locks the dialog until it's kept. */
export default function SecurityDialog({ session, open, onClose }: { session: Session; open: boolean; onClose: () => void }) {
  const [newKey, setNewKey] = useState<Registered | null>(null);

  const close = () => {
    setNewKey(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} dismissible={!newKey} labelledBy="security-title">
      <h2 id="security-title" className="font-display text-[28px] leading-[1.12] font-bold">
        {newKey ? 'Your new key' : 'Account security'}
      </h2>
      <div className="mt-5">
        {newKey ? <GeneratedKey {...newKey} onSignedIn={close} /> : <SecurityForm session={session} onNewKey={setNewKey} />}
      </div>
    </Modal>
  );
}

function SecurityForm({ session, onNewKey }: { session: Session; onNewKey: (key: Registered) => void }) {
  const [accountNumber, setAccountNumber] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState('');
  const [signedOutOthers, setSignedOutOthers] = useState(false);
  const complete = isAccountNumber(accountNumber);

  // The old token stops working the moment the server answers, so the new session is saved straight away.
  const keepSession = (account: Session) => {
    if (getSession()?.id === session.id) saveSession(account);
  };

  const run = async (action: Action) => {
    if (!complete || busy) return;
    setBusy(action);
    setError('');
    setSignedOutOthers(false);
    try {
      if (action === 'signOutOthers') {
        keepSession(await signOutOtherDevices(session, accountNumber));
        setSignedOutOthers(true);
        setAccountNumber('');
      } else {
        const registered = await changeAccountNumber(session, accountNumber);
        keepSession(registered.account);
        onNewKey(registered);
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run('signOutOthers');
  };

  const toggleLabel = visible ? 'Hide account number' : 'Show account number';
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-fg-2">
        Think someone else has your account number, or you signed in on a device you no longer have? Enter your
        current number to confirm it&apos;s you.
      </p>
      <div className="relative">
        <label htmlFor="security-account-number" className="sr-only">Current account number</label>
        <input
          id="security-account-number"
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
      {error && <p role="alert" className="text-center text-[14px] text-accent">{error}</p>}
      {signedOutOthers && (
        <p role="status" className="flex items-center justify-center gap-2 text-center text-[14px] text-fg-2">
          <CheckIcon size={16} /> Every other device is signed out.
        </p>
      )}
      <button type="submit" disabled={!complete || Boolean(busy)} className={secondaryButtonClass}>
        {busy === 'signOutOthers' ? 'Signing out…' : 'Sign out other devices'}
      </button>
      <div className="mt-1">
        <button type="button" onClick={() => run('newNumber')} disabled={!complete || Boolean(busy)} className={primaryButtonClass}>
          {busy === 'newNumber' ? 'Making a new number…' : 'Get a new account number'}
        </button>
        <p className="mt-2 text-center text-[13px] text-muted">
          Your current number stops working and every other device is signed out. Pro and everything else stays.
        </p>
      </div>
    </form>
  );
}
