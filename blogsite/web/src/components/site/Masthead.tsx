import Link from 'next/link';
import { getSiteData } from '@/lib/data';
import { homeUrl, subscribeUrl } from '@/lib/format';
import TodayDate from './TodayDate';

export default async function Masthead() {
  const { site, t } = await getSiteData();
  return (
    <header className="page-container relative pt-8 pb-[22px] text-center max-md:pt-[22px] max-md:pb-[18px]">
      <Link
        href={homeUrl}
        className="inline-block font-display text-[clamp(34px,5.6vw,62px)] leading-[1.05] font-extrabold tracking-[-0.01em]"
      >
        {site.name}
      </Link>
      <Link
        href={subscribeUrl}
        className="absolute top-1/2 right-5 inline-flex h-10 -translate-y-1/2 items-center rounded-full bg-accent px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 max-md:hidden"
      >
        {t('subscribe', 'Subscribe')}
      </Link>
      <p className="mt-2.5 flex flex-wrap justify-center text-[14px] text-fg-2 *:px-3 [&>*+*]:border-l [&>*+*]:border-line max-md:text-[13px] max-md:*:px-2">
        <span>{site.edition}</span>
        <TodayDate />
        <a href="#" className="hover:text-accent">{t('mastheadLink', 'About')}</a>
        <Link href={subscribeUrl} className="font-semibold text-accent md:hidden">{t('subscribe', 'Subscribe')}</Link>
      </p>
    </header>
  );
}
