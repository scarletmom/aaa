import { getSiteData } from '@/lib/data';
import NewsletterForm from './NewsletterForm';

export default async function NewsletterWidget() {
  const { t } = await getSiteData();
  return (
    <section id="newsletter" aria-labelledby="newsletter-title" className="border border-line bg-surface p-[22px]">
      <h2 id="newsletter-title" className="font-serif text-[21px] font-bold">{t('newsletterTitle', 'Newsletter')}</h2>
      <p className="mt-1.5 text-[14px] text-fg-2">{t('newsletterText', '')}</p>
      <NewsletterForm doneText={t('newsletterDone', 'Thanks for signing up.')} />
    </section>
  );
}
