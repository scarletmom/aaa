/** Joins class names, skipping empty ones. */
export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');
