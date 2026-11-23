import Link from 'next/link';
import { homeUrl } from '@/lib/format';

interface NoticeProps {
  title: string;
  text: string;
  linkText?: string;
}

/** A centred message with a link back home, for missing pages. */
export default function Notice({ title, text, linkText = 'Return to the home page' }: NoticeProps) {
  return (
    <div className="py-20 text-center text-muted">
      <h1 className="mb-2.5 font-serif text-[28px] text-fg">{title}</h1>
      <p>
        {text} <Link href={homeUrl} className="text-accent">{linkText}</Link>.
      </p>
    </div>
  );
}
