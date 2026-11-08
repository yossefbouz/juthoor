'use client';

import Link from 'next/link';
import { MapPin, Network, Plus, User, User2 } from 'lucide-react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { PersonView } from '@/lib/tree/types';

import { PersonHoverCard } from './PersonHoverCard';

/**
 * Landscape card: avatar on the start side, name + life-years stacked on
 * the rest — mirrors FamilyEcho / Ancestry / Geni layout.
 *
 * Sizing notes (must stay in sync with FamilyChart's UNIT_PX/PADDING):
 *   • Card 220×84. UNIT_PX 130 → cell 260×260 →
 *       horizontal gap = 260 − 220 = 40 px (between siblings)
 *       vertical   gap = 260 −  84 = 176 px (between generations)
 */
export const CHART_NODE_WIDTH = 220;
export const CHART_NODE_HEIGHT = 84;

const AVATAR_SIZE = 46;

interface Props {
  readonly person: PersonView;
  readonly treeId: string;
  /** Layout position from relatives-tree. */
  readonly left: number;
  readonly top: number;
  /** One relatives-tree unit in px — scales the whole chart. */
  readonly unitPx: number;
  /** True when this node is the chart's current root/focus. */
  readonly isFocus?: boolean;
  /** True when this node is the `?selected=` person (side-panel target). */
  readonly isSelected?: boolean;
  /**
   * PFT / read-only overlays: hide add-relative controls and link the card
   * straight to the person profile instead of the editor selection query.
   */
  readonly readOnly?: boolean;
}

/**
 * One tile in the family chart. Rendered as absolutely-positioned HTML
 * over the SVG connector layer so Arabic text uses native font shaping
 * (SVG `<text>` shapes Arabic poorly in some browsers).
 *
 * Interactions:
 *   • click → select (side panel shows actions; no page navigation)
 *   • right-click → profile / re-root context menu
 *   • hover `+` buttons → open the side-panel add sheet via `?add=<kind>`
 */
export function ChartNode({
  person,
  treeId,
  left,
  top,
  unitPx,
  isFocus = false,
  isSelected = false,
  readOnly = false,
}: Props) {
  const x = left * unitPx;
  const y = top * unitPx;
  const label = person.displayNameAr ?? person.displayNameEn ?? '—';
  const isFemale = person.gender === 'F';
  const isPlaceholder = person.isPlaceholder;
  const initial = label !== '—' ? label.trim().slice(0, 1) : null;

  const years =
    person.birthYear || person.deathYear
      ? `${person.birthYear ?? '؟'} – ${person.deathYear ?? (person.birthYear ? '' : '؟')}`.replace(/ – $/, '')
      : null;

  // Left-click selects the card (updates ?selected= so the side panel
  // shows this person + actions). Profile view lives in the right-click
  // context menu — keeps people on the chart instead of bouncing them
  // to a separate page on every click. readOnly (PFT) goes to profile.
  const selectHref = `/tree/${treeId}?selected=${person.id}`;
  const profileHref = `/tree/${treeId}/person/${person.id}`;
  const cardHref = readOnly ? profileHref : selectHref;
  const addHref = (kind: 'parent' | 'child' | 'spouse' | 'sibling') =>
    `/tree/${treeId}?selected=${person.id}&add=${kind}`;

  return (
    <div
      className={cn('group absolute', isFocus && 'z-10', isSelected && 'z-10')}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${CHART_NODE_WIDTH}px`,
        height: `${CHART_NODE_HEIGHT}px`,
      }}
    >
      {/* Add-relative buttons — appear on hover at the card edges and
          open the side-panel sheet inline (no page navigation). */}
      {!readOnly ? (
        <>
          <AddRelativeButton
            href={addHref('parent')}
            position="top"
            labelAr="أضف والدًا/والدة"
          />
          <AddRelativeButton
            href={addHref('child')}
            position="bottom"
            labelAr="أضف ابنًا/ابنة"
          />
          <AddRelativeButton
            href={addHref('sibling')}
            position="start"
            labelAr="أضف أخًا/أختًا"
          />
          <AddRelativeButton
            href={addHref('spouse')}
            position="end"
            labelAr="أضف زوجًا/زوجة"
          />
        </>
      ) : null}

      <PersonHoverCard person={person}>
        <div className="h-full w-full">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            href={cardHref}
            scroll={false}
            className="block h-full w-full focus-visible:outline-none"
            aria-label={label}
            aria-current={isFocus ? 'true' : undefined}
          >
            {/* Card body. dir="rtl" puts the avatar + accent bar on the
                right (start side) for Arabic readers. */}
            <div
              dir="rtl"
              className={cn(
                'relative flex h-full w-full items-center gap-2.5 overflow-hidden rounded-2xl border bg-[var(--card)] ps-1 pe-3 py-2 transition-all',
                'shadow-[var(--jt-shadow-sm)] group-hover:-translate-y-0.5 group-hover:shadow-[var(--jt-shadow-md)]',
                isPlaceholder
                  ? 'border-dashed border-[var(--jt-gold-400)]/70 bg-[var(--jt-gold-50)]'
                  : 'border-[var(--jt-stone-200)]',
                isSelected &&
                  'ring-2 ring-[var(--jt-olive-600)] ring-offset-2 ring-offset-[var(--background)]',
                isFocus &&
                  !isSelected &&
                  'ring-2 ring-[var(--jt-gold-400)] ring-offset-2 ring-offset-[var(--background)]',
              )}
            >
              {/* Gender accent bar — start edge */}
              <span
                aria-hidden
                className={cn(
                  'h-[calc(100%-16px)] w-1 flex-none rounded-full',
                  isPlaceholder
                    ? 'bg-[var(--jt-gold-300)]'
                    : isFemale
                      ? 'bg-[var(--jt-terra-300)]'
                      : 'bg-[var(--jt-olive-400)]',
                )}
              />

              {/* Avatar */}
              <div
                className={cn(
                  'flex flex-none items-center justify-center rounded-full',
                  isPlaceholder
                    ? 'border-2 border-dashed border-[var(--jt-gold-400)]/70 bg-[var(--jt-gold-100)]/60 text-[var(--jt-gold-600)]'
                    : isFemale
                      ? 'bg-gradient-to-br from-[var(--jt-terra-100)] to-[var(--jt-terra-200)] text-[var(--jt-terra-700)]'
                      : 'bg-gradient-to-br from-[var(--jt-olive-100)] to-[var(--jt-olive-200)] text-[var(--jt-olive-800)]',
                )}
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              >
                {initial ? (
                  <span
                    className="text-lg font-bold"
                    style={{ fontFamily: 'var(--jt-font-display, inherit)' }}
                  >
                    {initial}
                  </span>
                ) : (
                  <User2 className="h-5 w-5" />
                )}
              </div>

              {/* Name + facts stack */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-start">
                <div
                  className="truncate text-[13.5px] font-bold leading-tight text-[var(--jt-stone-800)]"
                  dir={person.displayNameAr ? 'rtl' : 'ltr'}
                  style={{ fontFamily: 'var(--jt-font-display, inherit)' }}
                >
                  {label}
                </div>

                {isPlaceholder ? (
                  <span className="inline-flex w-fit items-center rounded-full bg-[var(--jt-gold-200)]/80 px-1.5 py-px text-[9px] font-bold tracking-wider text-[var(--jt-gold-800)]">
                    مؤقت — أكمل البيانات
                  </span>
                ) : (
                  <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] leading-tight text-[var(--jt-stone-500)]">
                    {years ? (
                      <span dir="ltr" className="flex-none tabular-nums">
                        {years}
                      </span>
                    ) : null}
                    {years && person.birthPlaceAr ? (
                      <span aria-hidden className="flex-none opacity-50">
                        •
                      </span>
                    ) : null}
                    {person.birthPlaceAr ? (
                      <span className="inline-flex min-w-0 items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5 flex-none opacity-70" />
                        <span className="truncate">{person.birthPlaceAr}</span>
                      </span>
                    ) : null}
                    {!years && !person.birthPlaceAr ? (
                      <span className="opacity-0">·</span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </Link>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem asChild>
            <Link href={profileHref} className="flex items-center gap-2">
              <User className="h-4 w-4" />
              عرض الملف الشخصي
            </Link>
          </ContextMenuItem>
          <ContextMenuItem asChild>
            <Link
              href={`/tree/${treeId}?root=${person.id}`}
              className="flex items-center gap-2"
            >
              <Network className="h-4 w-4" />
              عرض الشجرة من هذا الشخص
            </Link>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
        </div>
      </PersonHoverCard>
    </div>
  );
}

/**
 * Small `+` button that overlays a card edge. Hidden by default, fades in
 * on `group-hover` of the parent ChartNode. Each one is a Link that sets
 * `?selected=<id>&add=<kind>` so the side panel opens its add-relative
 * sheet inline — the user never leaves the chart.
 */
function AddRelativeButton({
  href,
  position,
  labelAr,
}: {
  readonly href: string;
  readonly position: 'top' | 'bottom' | 'start' | 'end';
  readonly labelAr: string;
}) {
  const positionClasses: Record<typeof position, string> = {
    top: 'left-1/2 -top-3.5 -translate-x-1/2',
    bottom: 'left-1/2 -bottom-3.5 -translate-x-1/2',
    // In RTL the "start" edge is the right side; CSS logical props
    // (start-/end-) map cleanly so we don't have to branch on dir.
    start: '-start-3.5 top-1/2 -translate-y-1/2',
    end: '-end-3.5 top-1/2 -translate-y-1/2',
  };

  return (
    <Link
      href={href}
      scroll={false}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'absolute z-20 flex h-7 w-7 items-center justify-center rounded-full',
        'bg-[var(--jt-olive-600)] text-[var(--jt-stone-50)] shadow-md ring-2 ring-[var(--background)]',
        'opacity-0 group-hover:opacity-100 hover:scale-110 hover:bg-[var(--jt-olive-800)]',
        'transition-all',
        'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[var(--jt-gold-400)]',
        positionClasses[position],
      )}
      aria-label={labelAr}
      title={labelAr}
    >
      <Plus className="h-3.5 w-3.5" />
    </Link>
  );
}
