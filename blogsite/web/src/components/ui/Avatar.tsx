import { initials } from '@/lib/format';

/** A round badge with the author's initials. */
export default function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-11 flex-none place-items-center rounded-full bg-surface-2 font-serif text-[16px] font-semibold text-fg-2"
    >
      {initials(name)}
    </span>
  );
}
