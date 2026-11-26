/** The quill on its own: the video site's logo. */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-6 flex-none text-accent sm:size-7 ${className}`}>
      <path d="M20.5 2.5C12.8 2.9 7.7 8 6.5 15.5l-.3 2.3 2.3-.3c7.5-1.2 12.6-6.2 12-15z" fill="currentColor" />
      {/* The spine is cut out of the feather in the page colour, then continues past it as the nib. */}
      <path d="M8.4 15.6 15.2 8.8" fill="none" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 21 7.4 16.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
