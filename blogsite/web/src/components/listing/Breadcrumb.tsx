import Link from 'next/link';
import { Fragment } from 'react';
import { homeUrl } from '@/lib/format';

interface BreadcrumbProps {
  /** Links between Home and the current page. */
  trail?: Array<{ href: string; label: string }>;
  current: string;
}

export default function Breadcrumb({ trail = [], current }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-7 flex flex-wrap gap-1.5 border-b border-line pb-3.5 text-[13px] text-muted print:hidden">
      {[{ href: homeUrl, label: 'Home' }, ...trail].map((crumb) => (
        <Fragment key={crumb.href}>
          <Link href={crumb.href} className="hover:text-accent">{crumb.label}</Link>
          <span aria-hidden="true">›</span>
        </Fragment>
      ))}
      <span aria-current="page" className="text-fg">{current}</span>
    </nav>
  );
}
