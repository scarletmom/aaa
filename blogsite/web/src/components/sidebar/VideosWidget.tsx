import Link from 'next/link';
import { cn } from '@/lib/cn';
import { getSiteData } from '@/lib/data';
import { articleUrl } from '@/lib/format';
import type { Video } from '@/lib/types';
import Media from '../story/Media';
import BlockTitle from '../ui/BlockTitle';
import { PlayIcon, PlaySolidIcon } from '../ui/Icons';
import { headline } from '../ui/styles';

export default async function VideosWidget() {
  const { videos, articles, t } = await getSiteData();
  const [feature, ...rest] = videos;
  if (!feature) return null;
  const href = (video: Video) => {
    const article = articles.find((a) => a.id === video.articleId);
    return article ? articleUrl(article) : '#';
  };

  return (
    <section aria-labelledby="videos-title">
      <BlockTitle id="videos-title">{t('videos', 'Videos')}</BlockTitle>
      <Link href={href(feature)} className="group">
        <Media image={feature.image} className="mb-3 aspect-video">
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-[2px] bg-[#121212] py-[5px] pr-2.5 pl-2 text-[12px] font-semibold text-white">
            <PlaySolidIcon />{feature.duration}
          </span>
        </Media>
        <h3 className={cn('font-serif text-[20px] leading-[1.25] font-bold', headline)}>{feature.title}</h3>
      </Link>
      <ul>
        {rest.slice(0, 3).map((video) => (
          <li key={video.id} className="border-t border-line py-3 first:mt-3.5">
            <Link href={href(video)} className="group flex items-start justify-between gap-2.5">
              <span>
                <span className={cn('font-serif text-[16.5px] leading-[1.35] font-semibold', headline)}>{video.title}</span>
                <span className="mt-[3px] block font-sans text-[12.5px] font-normal text-muted">{video.duration}</span>
              </span>
              <PlayIcon className="mt-0.5 flex-none text-accent" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
