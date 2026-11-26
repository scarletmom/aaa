import Link from 'next/link';
import { cn } from '@/lib/cn';
import { teraboxPlayerUrl } from '@/lib/format';
import { CloudPlayIcon } from '../ui/Icons';
import TeraboxLaunch from './TeraboxLaunch';

/** The Terabox Player's paste box, set into the Terabox section and its posts. */
export default function TeraboxPlayerCard({ className }: { className?: string }) {
  return (
    <section aria-labelledby="terabox-card-title" className={cn('rounded-2xl border border-line bg-surface p-6 max-sm:p-5', className)}>
      <div className="mb-4 flex items-start gap-3.5">
        <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-xl bg-sky-500 text-white">
          <CloudPlayIcon size={24} />
        </span>
        <div>
          <h2 id="terabox-card-title" className="font-sans text-[20px] leading-tight font-bold">Terabox Player</h2>
          <p className="mt-1 font-serif text-[15.5px] text-fg-2">
            Paste a Terabox share link and press Watch to play it in your browser.{' '}
            <Link href={teraboxPlayerUrl} className="font-sans text-[14px] font-semibold whitespace-nowrap text-accent underline-offset-[3px] hover:underline">
              How it works
            </Link>
          </p>
        </div>
      </div>
      <TeraboxLaunch />
    </section>
  );
}
