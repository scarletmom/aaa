'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { CloseIcon } from './Icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Id of the element that names the dialog. */
  labelledBy: string;
  className?: string;
  /** False leaves no way out (no ✕, Esc or backdrop): the content must close it. */
  dismissible?: boolean;
  children: ReactNode;
}

/** A native modal <dialog>: Esc, the close button and a backdrop click close it unless `dismissible` is false. Content mounts only while open. */
export default function Modal({ open, onClose, labelledBy, className, dismissible = true, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onCancel={(event) => !dismissible && event.preventDefault()}
      // Browsers let a repeated Esc close a dialog even when cancel is prevented, so a locked one reopens.
      onClose={() => (dismissible ? onClose() : open && dialogRef.current?.showModal())}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(event) => dismissible && event.target === event.currentTarget && onClose()}
      className={cn(
        'm-auto max-h-[calc(100dvh-32px)] w-[min(460px,calc(100%-32px))] max-w-none overflow-y-auto rounded-[28px] border border-line bg-bg text-fg shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop:bg-black/60 backdrop:backdrop-blur-[3px]',
        className,
      )}
    >
      {open && (
        <div className="relative px-7 pt-9 pb-7 max-xs:px-5">
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-surface-2 text-muted hover:text-fg"
            >
              <CloseIcon />
            </button>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
