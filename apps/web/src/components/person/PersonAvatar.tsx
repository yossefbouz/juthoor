'use client';

import { User } from 'lucide-react';

import { useLocale } from '@/contexts/LocaleContext';

/**
 * Circular avatar for a person. If `photoUrl` is provided, shows the image.
 * Otherwise renders the first letter of the display name in Amiri.
 */
export function PersonAvatar({
  name,
  photoUrl,
  size = 56,
  className = '',
}: {
  name: string | null;
  photoUrl: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const { t } = useLocale();
  const initial = (name ?? '·').trim().slice(0, 1) || '·';

  if (photoUrl) {
    return (
      <span
        className={`relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--jt-stone-100)] ${className}`}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name ?? t('صورة شخصية', 'avatar')}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-[var(--jt-olive-100)] font-bold text-[var(--jt-olive-800)] ${className}`}
      style={{
        width: size,
        height: size,
        fontFamily: 'var(--jt-font-display)',
        fontSize: Math.round(size * 0.42),
      }}
      aria-label={name ?? t('صورة شخصية', 'avatar')}
    >
      {name ? initial : <User className="h-1/2 w-1/2" />}
    </span>
  );
}
