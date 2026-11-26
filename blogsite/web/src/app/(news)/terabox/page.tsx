import type { Metadata } from 'next';
import Link from 'next/link';
import TeraboxLaunch from '@/components/terabox/TeraboxLaunch';
import { CardRow } from '@/components/story/StoryCard';
import Media from '@/components/story/Media';
import BlockTitle from '@/components/ui/BlockTitle';
import { CloudPlayIcon } from '@/components/ui/Icons';
import { getSiteData } from '@/lib/data';
import { tagUrl, teraboxTabUrl } from '@/lib/format';
import { TERABOX_HOSTS } from '@/lib/teraboxLink';

export const metadata: Metadata = {
  title: 'Terabox Player',
  description: 'Paste a Terabox share link and watch the video in your browser, with the full Quillwood player.',
};

const STEPS = [
  { title: 'Copy the share link', text: 'In Terabox, open the video and press Share. Copy the link it gives you.' },
  { title: 'Paste it here', text: 'Paste the link in the box above, or tap Paste on a phone, and press Watch.' },
  { title: 'Watch', text: 'The player gets the video from Terabox and starts it. Big files can take up to a minute.' },
];

const FEATURES = [
  { title: 'The full player', text: 'Quality from Auto up to the best stream, speed, subtitles and keyboard shortcuts.' },
  { title: 'Resume where you left off', text: 'Come back to a video and it starts where you stopped.' },
  { title: 'Picture-in-picture', text: 'Pop the video out and keep watching while you do something else.' },
  { title: 'Paste the next one', text: 'A Watch new video box sits under the player, so you never have to go back.' },
  { title: 'Saved Terabox videos', text: 'A ready-made list of Terabox videos to pick from, with Up next beside the player.' },
  { title: 'No app, no download', text: 'Everything plays in the browser, on a phone or a computer.' },
];

const LINK_EXAMPLES = ['terabox.com/s/1AbC…', '1024tera.com/sharing/link?surl=AbC…', 'teraboxapp.com/s/1AbC…'];

export default async function TeraboxPlayerPage() {
  const { articles } = await getSiteData();
  const guides = articles.filter((a) => a.tags.includes('Terabox')).slice(0, 4);

  return (
    <>
      <section
        aria-labelledby="terabox-player-title"
        className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-12 border-b border-line pb-12 max-lg:grid-cols-1 max-lg:gap-8"
      >
        <div>
          <p className="inline-flex items-center gap-2 text-[13px] font-bold tracking-[0.08em] text-accent uppercase">
            <CloudPlayIcon size={18} />
            Terabox Player
          </p>
          <h1 id="terabox-player-title" className="mt-3 font-display text-[clamp(34px,4.6vw,54px)] leading-[1.05] font-extrabold tracking-[-0.01em]">
            Watch Terabox videos right in your browser
          </h1>
          <p className="mt-4 max-w-[560px] font-serif text-[19px] leading-[1.5] text-fg-2">
            Paste a Terabox share link and press Watch. No app and no download: the video plays in the same player as every
            other video on Quillwood.
          </p>
          <div className="mt-7 max-w-[620px]">
            <TeraboxLaunch />
          </div>
        </div>
        <Media
          image="/covers/terabox-player-guide.svg"
          alt="A Terabox link pasted into the player, with the Watch button next to it."
          eager
          className="aspect-[3/2] rounded-2xl"
        />
      </section>

      <section aria-labelledby="terabox-steps-title" className="mt-12">
        <BlockTitle id="terabox-steps-title">How it works</BlockTitle>
        <ol className="grid grid-cols-3 gap-8 max-md:grid-cols-1 max-md:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-fg font-display text-[20px] font-bold text-bg">
                {index + 1}
              </span>
              <div>
                <h3 className="text-[18px] font-bold">{step.title}</h3>
                <p className="mt-1 font-serif text-[16px] text-fg-2">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="terabox-features-title" className="mt-14">
        <BlockTitle id="terabox-features-title">What you get</BlockTitle>
        <ul className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line max-lg:grid-cols-2 max-sm:grid-cols-1">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="bg-surface p-6">
              <h3 className="text-[17px] font-bold">{feature.title}</h3>
              <p className="mt-1.5 font-serif text-[15.5px] text-fg-2">{feature.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[15px]">
          No link to hand?{' '}
          <Link href={teraboxTabUrl} className="font-semibold text-accent underline-offset-[3px] hover:underline">
            Browse the saved Terabox videos
          </Link>
        </p>
      </section>

      <section aria-labelledby="terabox-links-title" className="mt-14 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-10 max-md:grid-cols-1">
        <div>
          <BlockTitle id="terabox-links-title">Links that work</BlockTitle>
          <p className="font-serif text-[16px] text-fg-2">
            Any Terabox share link: the part after <code className="rounded bg-surface-2 px-1.5 py-0.5 font-sans text-[14px]">/s/1</code>{' '}
            or <code className="rounded bg-surface-2 px-1.5 py-0.5 font-sans text-[14px]">surl=</code> is the share. With or without
            https:// in front.
          </p>
          <ul className="mt-4 space-y-2">
            {LINK_EXAMPLES.map((example) => (
              <li key={example} className="truncate rounded-xl border border-line bg-surface px-4 py-2.5 font-mono text-[13.5px] text-fg-2">
                {example}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mt-[50px] mb-3 text-[15px] font-bold max-md:mt-0">Every Terabox mirror site</h3>
          <div className="flex flex-wrap gap-2">
            {TERABOX_HOSTS.map((host) => <span key={host} className="rounded-full border border-line px-3.5 py-1.5 text-[14px] text-fg-2">{host}</span>)}
          </div>
        </div>
      </section>

      {guides.length > 0 && (
        <section aria-labelledby="terabox-guides-title" className="mt-14">
          <BlockTitle id="terabox-guides-title" href={tagUrl('Terabox')}>Terabox guides</BlockTitle>
          <CardRow articles={guides} />
        </section>
      )}
    </>
  );
}
