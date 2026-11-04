import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Our font-* classes are all font families (global.css), so any two of them must conflict.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-weight': [{ font: ['regular', 'display', 'tamil'] }] } },
});

/** Join class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
