import { cn } from '@/lib/cn';

/** Underlines a headline when it, or the link around it (marked `group`), is hovered. */
export const headline = 'transition-colors decoration-1 underline-offset-[0.14em] hover:underline group-hover:underline';

/** Serif text used for summaries under headlines. */
export const summaryText = 'font-serif text-fg-2';

/** Rows separated by a thin rule. */
export const ruledItem = 'border-t border-line';

interface ButtonOptions {
  solid?: boolean;
  /** Height, padding, radius and font size; defaults to the small 30px button. */
  size?: string;
  className?: string;
}

export function buttonClass({ solid = false, size = 'h-[30px] px-3 rounded-[2px] text-[13px]', className }: ButtonOptions = {}) {
  return cn(
    'inline-flex items-center justify-center gap-1.5 border font-medium whitespace-nowrap',
    solid ? 'border-fg bg-fg text-bg hover:border-fg-2 hover:bg-fg-2' : 'border-fg bg-transparent hover:bg-surface-2',
    size,
    className,
  );
}

export const pillClass =
  'inline-block rounded-full border border-line px-3.5 py-1.5 text-[14px] text-fg-2 transition-[border-color,color] duration-150 hover:border-fg hover:text-fg';

export const iconButtonClass =
  'inline-grid size-9 place-items-center rounded-full border border-line bg-transparent text-fg hover:border-fg-2';
