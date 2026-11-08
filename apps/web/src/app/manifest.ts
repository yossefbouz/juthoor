import type { MetadataRoute } from 'next';

/**
 * Web App Manifest — makes Juthoor installable as a Progressive Web App
 * (Add to Home Screen / Install app) on phones and desktops.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'جذور — Juthoor',
    short_name: 'جذور',
    description:
      'Palestinian Roots Platform — reconnect families through a unified family tree.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F7F3ED',
    theme_color: '#3E7030',
    lang: 'ar',
    dir: 'rtl',
    categories: ['genealogy', 'social', 'education'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
