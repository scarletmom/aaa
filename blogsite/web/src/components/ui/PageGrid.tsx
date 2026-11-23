import type { ReactNode } from 'react';

/** Main column plus a 340px sidebar; stacks below 1080px. */
export default function PageGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-12 max-lg:grid-cols-1 print:block">
      {children}
    </div>
  );
}
