'use client';

import { Children, useState, type ReactNode } from 'react';
import { buttonClass } from '../ui/styles';

interface LoadMoreProps {
  pageSize: number;
  label: string;
  children: ReactNode;
}

/** Shows the first `pageSize` children, then `pageSize` more per click. */
export default function LoadMore({ pageSize, label, children }: LoadMoreProps) {
  const items = Children.toArray(children);
  const [shown, setShown] = useState(pageSize);

  return (
    <>
      <div>{items.slice(0, shown)}</div>
      {items.length > shown && (
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={() => setShown(shown + pageSize)}
            className={buttonClass({ size: 'h-10 px-[22px] rounded-[2px] text-[14px]' })}
          >
            {label}
          </button>
        </div>
      )}
    </>
  );
}
