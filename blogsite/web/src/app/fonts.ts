import { Libre_Franklin, Playfair_Display, Source_Serif_4 } from 'next/font/google';

// Self-hosted at build time; globals.css maps these variables to font-sans, font-serif and font-display.
export const libreFranklin = Libre_Franklin({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-libre-franklin',
  display: 'swap',
});

export const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-playfair',
  display: 'swap',
});

export const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const fontVariables = [libreFranklin.variable, playfairDisplay.variable, sourceSerif.variable].join(' ');
