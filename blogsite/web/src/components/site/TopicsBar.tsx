import Link from 'next/link';
import { getSiteData } from '@/lib/data';
import { tagUrl } from '@/lib/format';

export default async function TopicsBar() {
  const { site, t } = await getSiteData();
  return (
    <div className="page-container">
      <nav
        aria-label="Topics"
        className="no-scrollbar flex items-center gap-5 overflow-x-auto border-b-[3px] border-double border-rule py-[11px] text-[14px] whitespace-nowrap"
      >
        <span className="font-bold text-accent">{t('topics', 'Topics')}</span>
        {site.topics.map((topic) => (
          <Link key={topic} href={tagUrl(topic)} className="text-fg-2 underline-offset-[3px] hover:text-fg hover:underline">
            {topic}
          </Link>
        ))}
      </nav>
    </div>
  );
}
