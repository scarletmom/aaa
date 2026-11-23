import type { Metadata } from 'next';
import FrontPage from '@/components/home/FrontPage';

export const metadata: Metadata = { title: 'Notes' };

export default function NotePage() {
  return <FrontPage />;
}
