'use client';

/**
 * One interactive chart per PFT identity group.
 * Layout uses synthetic parent→child family links (visualization only).
 * Dashed olive strokes mark confirmed same_as person_links.
 */

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Crosshair, Maximize, Minus, Plus } from 'lucide-react';
import calcTree from 'relatives-tree';
import type { ExtNode } from 'relatives-tree/lib/types';

import type { PftIdentityGroup } from '@/data/user/pft';
import { useLocale } from '@/contexts/LocaleContext';
import { toPftChartModel } from '@/lib/tree/toPftSnapshot';
import { toRelativesTree } from '@/lib/tree/toRelativesTree';

import {
  CHART_NODE_HEIGHT,
  CHART_NODE_WIDTH,
  ChartNode,
} from './ChartNode';

const UNIT_PX = 130;
const PADDING = 160;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;

interface ViewState {
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
}

function clampScale(v: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
}

export function PftIdentityChart({
  group,
  index,
}: {
  readonly group: PftIdentityGroup;
  readonly index: number;
}) {
  const { t, locale } = useLocale();
  const model = useMemo(() => toPftChartModel(group), [group]);

  const { nodes, canvas } = useMemo(() => {
    if (!model) return { nodes: [] as ExtNode[], canvas: { width: 0, height: 0 } };
    const rtNodes = toRelativesTree(model.snapshot);
    if (!rtNodes.some((n) => n.id === model.rootPersonId)) {
      return { nodes: [] as ExtNode[], canvas: { width: 0, height: 0 } };
    }
    return calcTree(rtNodes, {
      rootId: model.rootPersonId,
      placeholders: true,
    });
  }, [model]);

  const personById = useMemo(
    () => new Map(model?.snapshot.persons.map((p) => [p.id, p]) ?? []),
    [model],
  );

  const canvasWidth = canvas.width * UNIT_PX + PADDING * 2;
  const canvasHeight = canvas.height * UNIT_PX + PADDING * 2;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<ViewState>({ tx: 0, ty: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const nodeCenter = useCallback(
    (node: ExtNode) => ({
      x: PADDING + node.left * UNIT_PX,
      y: PADDING + node.top * UNIT_PX,
    }),
    [],
  );

  const centerOnRoot = useCallback(
    (scale?: number) => {
      const el = containerRef.current;
      const rootNode = nodes.find((n) => n.id === model?.rootPersonId);
      if (!el || !rootNode) return;
      const rect = el.getBoundingClientRect();
      const s = clampScale(scale ?? viewRef.current.scale);
      const { x, y } = nodeCenter(rootNode);
      setView({
        tx: rect.width / 2 - x * s,
        ty: rect.height / 2 - y * s,
        scale: s,
      });
    },
    [nodes, model?.rootPersonId, nodeCenter],
  );

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || canvasWidth === 0) return;
    const rect = el.getBoundingClientRect();
    const s = clampScale(
      Math.min(rect.width / canvasWidth, rect.height / canvasHeight, 1),
    );
    setView({
      tx: (rect.width - canvasWidth * s) / 2,
      ty: (rect.height - canvasHeight * s) / 2,
      scale: s,
    });
  }, [canvasWidth, canvasHeight]);

  useLayoutEffect(() => {
    centerOnRoot();
  }, [centerOnRoot]);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((prev) => {
      const scale = clampScale(prev.scale * factor);
      const ratio = scale / prev.scale;
      return {
        scale,
        tx: cx - (cx - prev.tx) * ratio,
        ty: cy - (cy - prev.ty) * ratio,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const panState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originTx: number;
    originTy: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, button')) return;
    panState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originTx: viewRef.current.tx,
      originTy: viewRef.current.ty,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const pan = panState.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    setView((prev) => ({
      ...prev,
      tx: pan.originTx + (e.clientX - pan.startX),
      ty: pan.originTy + (e.clientY - pan.startY),
    }));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (panState.current?.pointerId === e.pointerId) {
      panState.current = null;
      setIsPanning(false);
    }
  }

  if (!model || nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--jt-stone-500)]">
        {t('لا يمكن رسم هذه المجموعة.', 'This group cannot be charted yet.')}
      </p>
    );
  }

  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    pos.set(n.id, {
      x: PADDING + n.left * UNIT_PX,
      y: PADDING + n.top * UNIT_PX,
    });
  }

  // Synthetic family connectors (parent → children bus).
  const childPaths: string[] = [];
  for (const fam of model.snapshot.families) {
    const p1 = fam.partner1Id ? pos.get(fam.partner1Id) : undefined;
    if (!p1) continue;
    const kids = model.snapshot.familyChildren
      .filter((l) => l.familyId === fam.id)
      .map((l) => pos.get(l.childId))
      .filter((c): c is { x: number; y: number } => Boolean(c));
    if (kids.length === 0) continue;
    const HALF_H = CHART_NODE_HEIGHT / 2;
    const busY = Math.min(...kids.map((c) => c.y)) - HALF_H - 48;
    const xs = [p1.x, ...kids.map((c) => c.x)];
    const segments = [
      `M ${p1.x} ${p1.y + HALF_H} V ${busY}`,
      `M ${Math.min(...xs)} ${busY} H ${Math.max(...xs)}`,
      ...kids.map((c) => `M ${c.x} ${busY} V ${c.y - HALF_H}`),
    ];
    childPaths.push(segments.join(' '));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            className="text-lg font-bold text-[var(--jt-olive-900)]"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {t(`مجموعة ${index + 1}`, `Group ${index + 1}`)}
          </h2>
          <p className="text-[11px] font-medium text-[var(--jt-olive-700)]">
            {t('هويات مرتبطة (عرض فقط)', 'Linked identities (visualization only)')}
          </p>
        </div>
        <span className="rounded-full bg-[var(--jt-olive-50)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--jt-olive-700)]">
          {t(
            `${group.members.length} أشخاص · ${group.links.length} روابط`,
            `${group.members.length} people · ${group.links.length} links`,
          )}
        </span>
      </div>

      <div
        ref={containerRef}
        dir="ltr"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative h-[min(52vh,440px)] min-h-[280px] w-full touch-none select-none overflow-hidden rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--background)] shadow-[var(--jt-shadow-sm)]"
        style={{
          cursor: isPanning ? 'grabbing' : 'grab',
          backgroundImage:
            'radial-gradient(circle, rgba(125, 112, 89, 0.14) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={canvasWidth}
            height={canvasHeight}
            aria-hidden
          >
            {childPaths.map((d, i) => (
              <path
                key={`fam-${i}`}
                d={d}
                fill="none"
                stroke="var(--jt-stone-300)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}
            {/* same_as identity edges */}
            {model.sameAsEdges.map((edge) => {
              const a = pos.get(edge.a);
              const b = pos.get(edge.b);
              if (!a || !b) return null;
              return (
                <line
                  key={edge.linkId}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--jt-olive-500)"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  strokeOpacity={0.85}
                />
              );
            })}
          </svg>

          <div className="absolute" style={{ left: PADDING, top: PADDING }}>
            {nodes.map((n) => {
              const person = personById.get(n.id);
              if (!person) return null;
              const treeId = model.treeIdByPerson.get(n.id);
              if (!treeId) return null;
              const leftGrid = n.left - CHART_NODE_WIDTH / 2 / UNIT_PX;
              const topGrid = n.top - CHART_NODE_HEIGHT / 2 / UNIT_PX;
              return (
                <ChartNode
                  key={n.id}
                  person={person}
                  treeId={treeId}
                  left={leftGrid}
                  top={topGrid}
                  unitPx={UNIT_PX}
                  isFocus={n.id === model.rootPersonId}
                  readOnly
                />
              );
            })}
          </div>
        </div>

        <div
          dir="rtl"
          className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)]/95 px-1.5 py-1 shadow-sm backdrop-blur-sm"
        >
          <ToolbarBtn
            label={t('تصغير', 'Zoom out')}
            onClick={() => {
              const el = containerRef.current;
              if (!el) return;
              const r = el.getBoundingClientRect();
              zoomAt(r.width / 2, r.height / 2, 1 / 1.2);
            }}
          >
            <Minus className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            label={t('تكبير', 'Zoom in')}
            onClick={() => {
              const el = containerRef.current;
              if (!el) return;
              const r = el.getBoundingClientRect();
              zoomAt(r.width / 2, r.height / 2, 1.2);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn label={t('ملاءمة', 'Fit')} onClick={fitToView}>
            <Maximize className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            label={t('تمركز', 'Center')}
            onClick={() => centerOnRoot(1)}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </ToolbarBtn>
        </div>

        <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex flex-wrap gap-2 text-[10px] text-[var(--jt-stone-500)]">
          <span className="rounded-full border border-[var(--jt-stone-200)]/70 bg-[var(--card)]/85 px-2 py-0.5">
            {t('خط متقطع = نفس الهوية', 'Dashed = same identity')}
          </span>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2 pt-1">
        {group.members.map((m) => {
          const label =
            locale === 'ar'
              ? m.nameAr || m.nameEn || t('شخص', 'Person')
              : m.nameEn || m.nameAr || t('شخص', 'Person');
          return (
            <li key={m.personId}>
              <Link
                href={`/tree/${m.treeId}/person/${m.personId}`}
                className="inline-flex rounded-full border border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/70 px-2.5 py-1 text-[11px] font-medium text-[var(--jt-olive-900)] hover:border-[var(--jt-olive-300)]"
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ToolbarBtn({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--jt-stone-600)] hover:bg-[var(--jt-olive-50)] hover:text-[var(--jt-olive-800)]"
    >
      {children}
    </button>
  );
}
