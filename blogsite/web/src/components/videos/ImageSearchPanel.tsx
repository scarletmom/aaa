'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { checkSearchImage, imageFrom } from '@/lib/imageSearch';
import { ImageIcon } from '../ui/Icons';

/** The search box's dropdown: pick, drop or paste an image to search with. */
export default function ImageSearchPanel({ id, onImage }: { id: string; onImage: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const take = useCallback((file: File | null | undefined) => {
    if (!file) return;
    const problem = checkSearchImage(file);
    setError(problem ?? '');
    if (!problem) onImage(file);
  }, [onImage]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = imageFrom(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      take(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [take]);

  return (
    <div
      id={id}
      role="dialog"
      aria-label="Search with an image"
      className="absolute inset-x-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-line bg-bg p-4 text-fg shadow-[0_12px_40px_rgba(0,0,0,0.22)]"
    >
      <p className="text-[14.5px] font-semibold">Search with an image</p>
      <p className="mt-0.5 text-[13px] text-muted">Find videos that match a picture.</p>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(imageFrom(event.dataTransfer) ?? event.dataTransfer.files[0]);
        }}
        className={cn(
          'mt-3 grid place-items-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors',
          dragging ? 'border-accent bg-accent/5' : 'border-line',
        )}
      >
        <ImageIcon size={30} className="text-muted" />
        <p className="text-[14px]">
          Drag an image here or{' '}
          <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold text-accent underline-offset-2 hover:underline">
            upload a file
          </button>
        </p>
        <p className="text-[12.5px] text-muted">Or paste one with ⌘V / Ctrl+V. JPG, PNG, WebP or GIF, up to 10 MB.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            take(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {error && <p role="alert" className="mt-3 text-[13px] text-accent">{error}</p>}
    </div>
  );
}
