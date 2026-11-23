import type { BodyBlock } from '@/lib/types';

function Block({ block }: { block: BodyBlock }) {
  if (typeof block === 'string') return <p className="mb-[1.15em]">{block}</p>;
  if ('h' in block) {
    return <h2 className="mt-[1.7em] mb-[0.6em] font-sans text-[21px] leading-[1.3] font-bold">{block.h}</h2>;
  }
  return (
    <blockquote className="my-[1.6em] border-l-[3px] border-accent py-0.5 pl-[22px]">
      <p className="text-[24px] leading-[1.4] italic max-md:text-[21px]">{block.quote}</p>
      {block.by && <cite className="mt-2.5 block font-sans text-[14px] text-muted not-italic">{block.by}</cite>}
    </blockquote>
  );
}

export default function ArticleBody({ body }: { body: BodyBlock[] }) {
  return (
    <div className="font-serif text-[19.5px] leading-[1.7] max-md:text-[18px]">
      {body.map((block, index) => <Block key={index} block={block} />)}
    </div>
  );
}
