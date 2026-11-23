import type { ReactNode } from 'react';

/** The small grey line of dates and bylines under a headline. */
export default function Meta({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 font-sans text-[13px] text-muted">{children}</p>;
}
