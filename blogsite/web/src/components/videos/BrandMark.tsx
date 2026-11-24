/** Quill on an ink tile: the video site's logo. */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`grid size-8 flex-none place-items-center rounded-[10px] bg-fg text-accent shadow-sm ${className}`}>
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M19.8 3.2C12.6 3.6 7.9 8.4 6.8 15.4l-.3 2.1 2.1-.3c7-1.1 11.8-5.8 11.2-14z" fill="currentColor" />
        <path d="M4 20.5 14.6 9.4" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10.2 11.6h3.4M8.6 14.2h3" fill="none" stroke="var(--bg)" strokeWidth="1.2" strokeLinecap="round" opacity=".55" />
      </svg>
    </span>
  );
}
