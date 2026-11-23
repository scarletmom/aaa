import type { ReactNode } from 'react';
import NewsChrome from '@/components/site/NewsChrome';

export default function NewsLayout({ children }: { children: ReactNode }) {
  return <NewsChrome>{children}</NewsChrome>;
}
