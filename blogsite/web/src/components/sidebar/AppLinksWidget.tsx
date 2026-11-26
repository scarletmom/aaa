import Link from 'next/link';
import { cn } from '@/lib/cn';
import { getSiteData } from '@/lib/data';
import Media from '../story/Media';
import BlockTitle from '../ui/BlockTitle';
import { ChevronIcon, PlaySolidIcon } from '../ui/Icons';
import { headline } from '../ui/styles';

/** Shortcuts from the blog into the videos app: a featured one with an image, then a short list. */
export default async function AppLinksWidget() {
  const { appLinks, t } = await getSiteData();
  const [feature, ...rest] = appLinks;
  if (!feature) return null;

  return (
    <section aria-labelledby="app-links-title">
      <BlockTitle id="app-links-title">{t('appLinks', 'Start watching')}</BlockTitle>
      <Link href={feature.href} className="group block">
        {feature.image && (
          <Media image={feature.image} className="mb-3 aspect-video">
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-[2px] bg-[#121212] py-[5px] pr-2.5 pl-2 text-[12px] font-semibold text-white">
              <PlaySolidIcon />Open
            </span>
          </Media>
        )}
        <h3 className={cn('font-serif text-[20px] leading-[1.25] font-bold', headline)}>{feature.title}</h3>
        <p className="mt-1 font-serif text-[15px] text-fg-2">{feature.text}</p>
      </Link>
      <ul className="mt-3.5">
        {rest.map((link) => (
          <li key={link.id} className="border-t border-line py-3">
            <Link href={link.href} className="group flex items-center justify-between gap-2.5">
              <span>
                <span className={cn('font-serif text-[16.5px] leading-[1.35] font-semibold', headline)}>{link.title}</span>
                <span className="mt-[3px] block font-sans text-[12.5px] text-muted">{link.text}</span>
              </span>
              <ChevronIcon className="flex-none text-accent" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
