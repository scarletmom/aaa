import Link from 'next/link';
import { tagUrl } from '@/lib/format';
import { pillClass } from '../ui/styles';

export default function TagList({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
      <span className="mr-1 text-[14px] font-semibold">{label}</span>
      {tags.map((tag) => <Link key={tag} href={tagUrl(tag)} className={pillClass}>{tag}</Link>)}
    </div>
  );
}
