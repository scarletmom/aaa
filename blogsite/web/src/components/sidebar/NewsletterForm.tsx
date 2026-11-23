'use client';

import { useState } from 'react';
import { buttonClass } from '../ui/styles';

export default function NewsletterForm({ doneText }: { doneText: string }) {
  const [done, setDone] = useState(false);

  if (done) {
    return <p role="status" className="mt-3.5 text-[14px] font-medium text-up">{doneText}</p>;
  }

  return (
    <form className="mt-3.5 flex gap-2" onSubmit={(event) => { event.preventDefault(); setDone(true); }}>
      <label className="sr-only" htmlFor="newsletter-email">Email address</label>
      <input
        id="newsletter-email"
        type="email"
        name="email"
        placeholder="you@example.com"
        required
        className="h-[38px] min-w-0 flex-1 rounded-[2px] border border-line bg-bg px-3 text-[14px] focus:border-fg-2 focus:outline-none"
      />
      <button type="submit" className={buttonClass({ solid: true, size: 'h-[38px] px-3 rounded-[2px] text-[13px]' })}>
        Sign up
      </button>
    </form>
  );
}
