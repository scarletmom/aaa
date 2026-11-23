import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronIcon } from './Icons';

interface BlockTitleProps {
  id: string;
  /** When set, the heading links to the full list. */
  href?: string;
  children: ReactNode;
}

/** A section heading with a heavy rule above it. */
export default function BlockTitle({ id, href, children }: BlockTitleProps) {
  return (
    <h2
      id={id}
      className="mb-[18px] flex items-center justify-between gap-3 border-t-[3px] border-rule pt-3.5 font-sans text-[22px] font-bold tracking-[-0.01em]"
    >
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1 hover:text-accent">
          {children} <ChevronIcon />
        </Link>
      ) : (
        children
      )}
    </h2>
  );
}
