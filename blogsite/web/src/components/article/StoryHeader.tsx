import type { Story } from '@/lib/types';
import Kicker from '../story/Kicker';
import Media from '../story/Media';
import Byline from './Byline';

/** Section label, headline, standfirst, byline and lead image of a post. */
export default function StoryHeader({ article }: { article: Story }) {
  return (
    <>
      <Kicker article={article} asLink />
      <h1 className="mb-3.5 font-serif text-[clamp(30px,4vw,44px)] leading-[1.12] font-bold tracking-[-0.015em]">{article.title}</h1>
      <p className="mb-[22px] font-serif text-[21px] leading-[1.45] text-fg-2 max-md:text-[19px]">{article.summary}</p>
      <Byline article={article} />
      <figure className="mt-[26px] mb-[30px]">
        <Media image={article.image} alt={article.imageCaption} eager />
        <figcaption className="pt-2 text-[13px] text-muted">
          {article.imageCaption}
          <span className="ml-1.5 opacity-80">{article.imageCredit}</span>
        </figcaption>
      </figure>
    </>
  );
}
