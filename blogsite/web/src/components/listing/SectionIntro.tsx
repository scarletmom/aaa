export default function SectionIntro({ heading, intro }: { heading: string; intro: string }) {
  return (
    <header className="mb-7">
      <h1 className="font-serif text-[clamp(32px,4vw,42px)] leading-[1.1] font-bold tracking-[-0.015em]">{heading}</h1>
      <p className="mt-2 text-[16px] text-fg-2">{intro}</p>
    </header>
  );
}
