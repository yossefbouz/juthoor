'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { User2 } from 'lucide-react';

import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { PersonView } from '@/lib/tree/types';

import { PersonHoverCard } from './PersonHoverCard';

interface Props {
  readonly person: PersonView;
  readonly treeId: string;
  readonly variant: 'center' | 'parent' | 'sibling' | 'spouse' | 'child';
  readonly subtitle?: string;
}

const toneForGender = (gender: PersonView['gender']) => {
  if (gender === 'F') {
    return {
      ring: 'ring-rose-300/60',
      badge:
        'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
      accent: 'from-rose-400 to-rose-200',
      icon: 'text-rose-500',
    };
  }
  return {
    ring: 'ring-blue-300/60',
    badge:
      'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
    accent: 'from-blue-500 to-blue-300',
    icon: 'text-blue-500',
  };
};

function lifespan(person: PersonView): string | null {
  const birth = person.birthYear ?? null;
  const death = person.deathYear ?? null;
  if (birth == null && death == null) return null;
  return `${birth ?? '…'} – ${death ?? ''}`.trim();
}

/**
 * One tile in the 360° view. framer-motion's shared layoutId makes
 * recentring animate smoothly — click a sibling and watch it "fly" to
 * the centre position.
 */
export function PersonSlot({ person, treeId, variant, subtitle }: Props) {
  const { locale } = useLocale();
  const isCenter = variant === 'center';
  const tone = toneForGender(person.gender);
  const primaryName =
    (locale === 'ar' ? person.displayNameAr ?? person.displayNameEn : person.displayNameEn ?? person.displayNameAr)
    ?? '—';
  const secondaryName = locale === 'ar' ? person.displayNameEn : person.displayNameAr;
  const initial = primaryName.trim()[0];
  const years = lifespan(person);

  return (
    <PersonHoverCard person={person}>
      <motion.div
        layoutId={`person-${person.id}`}
        layout
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className={cn(
          'group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
          isCenter &&
            `border-primary/40 bg-gradient-to-bl from-primary/10 via-card to-card p-5 ring-2 ring-offset-2 ring-offset-background ${tone.ring}`,
          !isCenter && 'p-3',
        )}
      >
        {/* gender accent stripe */}
        <div
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l',
            tone.accent,
          )}
        />
        <Link
          href={`/tree/${treeId}/person/${person.id}`}
          className="flex items-center gap-3"
          aria-label={primaryName}
        >
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full font-semibold',
              tone.badge,
              isCenter ? 'h-14 w-14 text-xl' : 'h-9 w-9 text-sm',
            )}
          >
            {initial ? (
              initial
            ) : (
              <User2
                className={cn(tone.icon, isCenter ? 'h-6 w-6' : 'h-4 w-4')}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {subtitle ? (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {subtitle}
              </div>
            ) : null}
            <div
              className={cn(
                'truncate',
                isCenter ? 'text-base font-bold' : 'text-sm font-medium',
              )}
            >
              {primaryName}
            </div>
            {person.displayNameEn && person.displayNameAr ? (
              <div
                className="truncate text-xs text-muted-foreground"
                dir={locale === 'ar' ? 'ltr' : 'rtl'}
              >
                {secondaryName}
              </div>
            ) : null}
            {years ? (
              <div
                className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
                dir="ltr"
              >
                {years}
              </div>
            ) : null}
          </div>
        </Link>
      </motion.div>
    </PersonHoverCard>
  );
}

export function EmptySlot({
  label,
  hint,
}: {
  readonly label: string;
  readonly hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/30 p-3 text-center transition hover:bg-muted/50">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
