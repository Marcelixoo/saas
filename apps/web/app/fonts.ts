import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';

/**
 * Self-hosted, optimized fonts (next/font) matching the design system's
 * `$font-sans` / `$font-mono` tokens. Avoids render-blocking Google Fonts
 * `<link>` tags and layout shift from late font swaps.
 */
export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
