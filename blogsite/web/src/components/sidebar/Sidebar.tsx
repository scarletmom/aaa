import type { ReactNode } from 'react';

/** Right-hand column; two columns of widgets on tablets, one on phones. */
export default function Sidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="flex flex-col gap-10 max-lg:grid max-lg:grid-cols-2 max-md:grid-cols-1 print:hidden">
      {children}
    </aside>
  );
}
