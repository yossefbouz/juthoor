'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Crosshair, Home, Maximize, Minus, Plus } from 'lucide-react';
import calcTree from 'relatives-tree';
import type { ExtNode } from 'relatives-tree/lib/types';

import type { ChartLayoutMode } from '@/lib/tree/chartLayout';
import type { PersonView, TreeSnapshot } from '@/lib/tree/types';
import {
  familyIdOfPhantom,
  isPhantomId,
  phantomIdForFamily,
  toRelativesTree,
} from '@/lib/tree/toRelativesTree';

import {
  ChartLayoutToggle,
  useChartLayoutState,
} from './ChartLayoutToggle';
import {
  CHART_NODE_HEIGHT,
  CHART_NODE_WIDTH,
  ChartNode,
} from './ChartNode';
import { FindInTreePanel } from './FindInTreePanel';

interface Props {
  readonly treeId: string;
  readonly snapshot: TreeSnapshot;
  readonly rootPersonId: string;
  /** Currently selected person (?selected= URL param) — highlighted. */
  readonly selectedPersonId?: string | null;
}

// relatives-tree reports positions in grid units. Each node occupies
// a 2-unit × 2-unit grid cell, so connector endpoints sit at
// `center ± UNIT_PX` on each axis. The grid is square, but our card is
// landscape (220×84) — we pick UNIT_PX so the *vertical* gap between
// generations is generous (room for connector lines and the gen label
// chip) and the *horizontal* gap between siblings is tight (so the
// tree reads as one structure, not floating cards).
//
// Card 220×84, UNIT_PX 130 → 260×260 cell:
//   • horizontal gap = 260 − 220 =  40 px (20 each side, sibling-to-sibling)
//   • vertical   gap = 260 −  84 = 176 px (88 each side, generation-to-generation)
const UNIT_PX = 130;
// PADDING must be ≥ max(CHART_NODE_WIDTH, CHART_NODE_HEIGHT) / 2 + slack
// + room for the generation-label chip ABOVE the topmost row.
const PADDING = 180;

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

/** Camera transform: world position offset + zoom. Immutable updates. */
interface ViewState {
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/**
 * Full family-tree chart with pan + zoom. `relatives-tree` computes the
 * layout; nodes render as absolutely-positioned HTML cards over an SVG
 * connector layer, inside a translate/scale "camera" so panning and
 * zooming never fight the page scroll.
 *
 * Interactions:
 *   • drag empty canvas → pan
 *   • mouse wheel / trackpad pinch → zoom toward the cursor
 *   • toolbar → zoom, fit-to-view, re-center on the focus person
 *   • the chart auto-centers on the focus person on mount/root change
 */
export function FamilyChart({
  treeId,
  snapshot,
  rootPersonId,
  selectedPersonId = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [layout, setLayout] = useChartLayoutState(searchParams.get('layout'));
  const personById = useMemo(
    () => new Map(snapshot.persons.map((p) => [p.id, p])),
    [snapshot.persons]
  );

  const { nodes: rawNodes, canvas: rawCanvas } = useMemo(() => {
    const rtNodes = toRelativesTree(snapshot);
    // relatives-tree throws when rootId is not in the nodes list — guard.
    if (!rtNodes.some((n) => n.id === rootPersonId)) {
      return {
        nodes: [] as readonly ExtNode[],
        canvas: { width: 0, height: 0 },
      };
    }
    // placeholders:true lets the layout algorithm insert invisible filler
    // nodes for missing partners — without it, children of single-parent
    // families get dropped from the layout entirely. Filler nodes have
    // generated ids, so the render loop below skips them naturally.
    const data = calcTree(rtNodes, {
      rootId: rootPersonId,
      placeholders: true,
    });
    return data;
  }, [snapshot, rootPersonId]);

  /** Apply horizontal / vertical / fan transforms on top of relatives-tree. */
  const { nodes, canvas } = useMemo(
    () => applyChartLayout(rawNodes, rawCanvas, rootPersonId, layout),
    [rawNodes, rawCanvas, rootPersonId, layout],
  );

  /**
   * Connector edges from family data. Horizontal: marriage bus above children.
   * Vertical (after axis swap): partners stack, so marriage is a vertical
   * segment and the child bus runs beside the generation column.
   */
  const edges = useMemo(() => {
    const pos = new Map(
      nodes.map((n) => [
        n.id,
        { x: PADDING + n.left * UNIT_PX, y: PADDING + n.top * UNIT_PX },
      ])
    );
    const HALF_W = CHART_NODE_WIDTH / 2;
    const HALF_H = CHART_NODE_HEIGHT / 2;
    // Must stay ≤ inter-column gap (~40px) so the vertical bus sits in the
    // gutter beside the child column, not inside the parent column.
    const BUS_RISE = 24;
    const vertical = layout === 'vertical';

    const spouseEdges: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      ghost: boolean;
    }[] = [];
    const childPaths: string[] = [];

    for (const fam of snapshot.families) {
      const real1 = fam.partner1Id ? pos.get(fam.partner1Id) : undefined;
      const real2 = fam.partner2Id ? pos.get(fam.partner2Id) : undefined;
      const phantom =
        real1 && real2 ? undefined : pos.get(phantomIdForFamily(fam.id));
      const p1 = real1 ?? phantom;
      const p2 = real1 ? (real2 ?? phantom) : real2;

      let anchor: { x: number; y: number } | null = null;

      if (p1 && p2) {
        if (vertical) {
          const [topP, botP] = p1.y <= p2.y ? [p1, p2] : [p2, p1];
          spouseEdges.push({
            x1: topP.x,
            y1: topP.y + HALF_H,
            x2: botP.x,
            y2: botP.y - HALF_H,
            ghost: Boolean(phantom),
          });
          anchor = { x: (topP.x + botP.x) / 2, y: (topP.y + botP.y) / 2 };
        } else {
          const [left, right] = p1.x <= p2.x ? [p1, p2] : [p2, p1];
          const y = (left.y + right.y) / 2;
          spouseEdges.push({
            x1: left.x + HALF_W,
            y1: y,
            x2: right.x - HALF_W,
            y2: y,
            ghost: Boolean(phantom),
          });
          anchor = { x: (left.x + right.x) / 2, y };
        }
      } else if (p1 ?? p2) {
        const solo = (p1 ?? p2) as { x: number; y: number };
        anchor = vertical
          ? { x: solo.x + HALF_W, y: solo.y }
          : { x: solo.x, y: solo.y + HALF_H };
      }
      if (!anchor) continue;

      const childPos = snapshot.familyChildren
        .filter((l) => l.familyId === fam.id)
        .map((l) => pos.get(l.childId))
        .filter((c): c is { x: number; y: number } => Boolean(c));
      if (childPos.length === 0) continue;

      if (vertical) {
        const childMidX =
          childPos.reduce((sum, c) => sum + c.x, 0) / childPos.length;
        const childrenOnRight = childMidX >= anchor.x;
        const busX = childrenOnRight
          ? Math.min(...childPos.map((c) => c.x)) - HALF_W - BUS_RISE
          : Math.max(...childPos.map((c) => c.x)) + HALF_W + BUS_RISE;
        const ys = [anchor.y, ...childPos.map((c) => c.y)];
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const segments: string[] = [`M ${anchor.x} ${anchor.y} H ${busX}`];
        if (maxY - minY > 0.5) {
          segments.push(`M ${busX} ${minY} V ${maxY}`);
        }
        for (const c of childPos) {
          const edgeX = childrenOnRight ? c.x - HALF_W : c.x + HALF_W;
          segments.push(`M ${busX} ${c.y} H ${edgeX}`);
        }
        childPaths.push(segments.join(' '));
      } else {
        const childTopY = Math.min(...childPos.map((c) => c.y)) - HALF_H;
        const busY = childTopY - BUS_RISE;
        const xs = [anchor.x, ...childPos.map((c) => c.x)];
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);

        const segments: string[] = [`M ${anchor.x} ${anchor.y} V ${busY}`];
        if (maxX - minX > 0.5) {
          segments.push(`M ${minX} ${busY} H ${maxX}`);
        }
        for (const c of childPos) {
          segments.push(`M ${c.x} ${busY} V ${c.y - HALF_H}`);
        }
        childPaths.push(segments.join(' '));
      }
    }

    return { spouseEdges, childPaths };
  }, [nodes, snapshot, layout]);

  /**
   * Generation-row labels (Ancestry-style: "parents", "grandparents", …).
   * Each `relatives-tree` node spans 2 grid units vertically, so adjacent
   * generations differ by exactly 2 in `top`.
   */
  const generationRows = useMemo(() => {
    const focus = nodes.find((n) => n.id === rootPersonId);
    if (!focus) return [] as readonly { top: number; label: string }[];
    const seen = new Set<number>();
    const rows: { top: number; label: string }[] = [];
    for (const n of nodes) {
      if (seen.has(n.top)) continue;
      seen.add(n.top);
      const generation = Math.round((n.top - focus.top) / 2);
      rows.push({ top: n.top, label: generationLabel(generation) });
    }
    return rows;
  }, [nodes, rootPersonId]);

  const canvasWidth = canvas.width * UNIT_PX + PADDING * 2;
  const canvasHeight = canvas.height * UNIT_PX + PADDING * 2;

  // ── Camera ────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<ViewState>({ tx: 0, ty: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  /** World-space center of a node (canvas px, incl. padding offset). */
  const nodeCenter = useCallback(
    (node: ExtNode) => ({
      x: PADDING + node.left * UNIT_PX,
      y: PADDING + node.top * UNIT_PX,
    }),
    []
  );

  const centerOnRoot = useCallback(
    (scale?: number) => {
      const el = containerRef.current;
      const rootNode = nodes.find((n) => n.id === rootPersonId);
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
    [nodes, rootPersonId, nodeCenter]
  );

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || canvasWidth === 0) return;
    const rect = el.getBoundingClientRect();
    const s = clampScale(
      Math.min(rect.width / canvasWidth, rect.height / canvasHeight, 1)
    );
    setView({
      tx: (rect.width - canvasWidth * s) / 2,
      ty: (rect.height - canvasHeight * s) / 2,
      scale: s,
    });
  }, [canvasWidth, canvasHeight]);

  // Center the focus person on mount and whenever the root changes.
  useLayoutEffect(() => {
    centerOnRoot();
  }, [centerOnRoot]);

  /** Zoom keeping a viewport point (cx, cy) visually fixed. */
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

  function zoomFromToolbar(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  }

  // Wheel zoom — native listener so preventDefault() beats page scroll.
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

  // Pointer pan (left button on empty canvas; cards/links keep their clicks).
  const panState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originTx: number;
    originTy: number;
    moved: boolean;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, button, [role="menu"]')) return;
    panState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originTx: viewRef.current.tx,
      originTy: viewRef.current.ty,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsPanning(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const pan = panState.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    setView((prev) => ({
      ...prev,
      tx: pan.originTx + dx,
      ty: pan.originTy + dy,
    }));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (panState.current?.pointerId === e.pointerId) {
      panState.current = null;
      setIsPanning(false);
    }
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-[var(--jt-stone-200)] bg-[var(--card)]/50 p-10 text-center text-sm text-[var(--jt-stone-600)]">
        لا توجد بيانات كافية لعرض المخطط بعد.
      </div>
    );
  }

  const showConnectors = layout !== 'fan';

  return (
    <div
      ref={containerRef}
      dir="ltr"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-[min(72vh,640px)] min-h-[360px] w-full max-w-full touch-none select-none overflow-hidden rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--background)] shadow-[var(--jt-shadow-sm)] sm:min-h-[440px]"
      style={{
        cursor: isPanning ? 'grabbing' : 'grab',
        backgroundImage:
          'radial-gradient(circle, rgba(125, 112, 89, 0.16) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
      }}
    >
      {/* ── World (camera target) ── */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {/* SVG connector layer — every edge snaps exactly to a card
            border (positions already include PADDING). */}
        {showConnectors ? (
          <svg
            className="pointer-events-none absolute inset-0"
            width={canvasWidth}
            height={canvasHeight}
            aria-hidden
          >
            {edges.childPaths.map((d, i) => (
              <path
                key={`child-${i}`}
                d={d}
                fill="none"
                stroke="var(--jt-stone-300)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}
            {edges.spouseEdges.map((e, i) => (
              <line
                key={`spouse-${i}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="var(--jt-stone-400)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={e.ghost ? '2 7' : undefined}
              />
            ))}
          </svg>
        ) : (
          <FanSpokes
            nodes={nodes}
            rootPersonId={rootPersonId}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        )}

        {/* Node layer */}
        <div
          className="absolute"
          style={{ left: PADDING, top: PADDING }}
        >
          {nodes.map((n) => {
            // relatives-tree gives node centre in grid units; convert to
            // top-left by offsetting half the node size.
            const leftGrid = n.left - CHART_NODE_WIDTH / 2 / UNIT_PX;
            const topGrid = n.top - CHART_NODE_HEIGHT / 2 / UNIT_PX;

            // Phantom partner of a single-parent family → ghost card
            // inviting the user to record the missing parent.
            if (isPhantomId(n.id)) {
              const familyId = familyIdOfPhantom(n.id);
              const family = snapshot.families.find((f) => f.id === familyId);
              const soloId = family?.partner1Id ?? family?.partner2Id;
              const solo = soloId ? personById.get(soloId) : undefined;
              if (!solo) return null;
              return (
                <GhostParentNode
                  key={n.id}
                  treeId={treeId}
                  soloPersonId={solo.id}
                  labelAr={solo.gender === 'M' ? 'أضف الأم' : 'أضف الأب'}
                  left={leftGrid * UNIT_PX}
                  top={topGrid * UNIT_PX}
                />
              );
            }

            const person = personById.get(n.id);
            if (!person) return null;
            return (
              <ChartNode
                key={n.id}
                person={person}
                treeId={treeId}
                left={leftGrid}
                top={topGrid}
                unitPx={UNIT_PX}
                isFocus={n.id === rootPersonId}
                isSelected={n.id === selectedPersonId}
              />
            );
          })}
        </div>
      </div>

      {/* ── Generation rail — horizontal layout only (vertical/fan re-root axes) ── */}
      {layout === 'horizontal' ? (
        <div className="pointer-events-none absolute inset-y-0 left-3 hidden sm:block" aria-hidden>
          {generationRows.map((row) => {
            const screenY =
              view.ty + (PADDING + row.top * UNIT_PX) * view.scale;
            return (
              <div
                key={`gen-${row.top}`}
                className="absolute -translate-y-1/2 whitespace-nowrap rounded-full border border-[var(--jt-stone-200)]/80 bg-[var(--card)]/90 px-3 py-1 text-[10px] font-semibold tracking-wide text-[var(--jt-stone-500)] shadow-sm backdrop-blur-sm"
                style={{ top: `${screenY}px` }}
              >
                {row.label}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ── Layout mode toggle ── */}
      <div className="absolute left-4 top-14 z-10 sm:left-auto sm:right-4 sm:top-14">
        <ChartLayoutToggle value={layout} onChange={setLayout} />
      </div>

      {/* ── Floating toolbar ── */}
      <div
        dir="rtl"
        className="absolute right-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-1 rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)]/95 px-2 py-1.5 shadow-[var(--jt-shadow-md)] backdrop-blur-sm"
      >
        <ToolbarButton
          label="تصغير"
          onClick={() => zoomFromToolbar(1 / 1.2)}
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="min-w-[4ch] text-center text-[11px] font-semibold tabular-nums text-[var(--jt-stone-600)]">
          {Math.round(view.scale * 100)}%
        </span>
        <ToolbarButton label="تكبير" onClick={() => zoomFromToolbar(1.2)}>
          <Plus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-[var(--jt-stone-200)]" />
        <ToolbarButton label="ملاءمة الشجرة كاملة" onClick={fitToView}>
          <Maximize className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="التمركز على المحور"
          onClick={() => centerOnRoot(1)}
        >
          <Crosshair className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="العودة للشخص الرئيسي"
          onClick={() => router.push(`/tree/${treeId}`, { scroll: false })}
        >
          <Home className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* ── Find in tree (Ancestry parity) ── */}
      <div className="absolute left-4 top-4 z-10 max-w-[min(100%-2rem,16rem)]">
        <FindInTreePanel
          treeId={treeId}
          persons={snapshot.persons}
          rootPersonId={rootPersonId}
        />
      </div>

      {/* ── Hint + count ── */}
      <div
        dir="rtl"
        className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-2 text-[10px] text-[var(--jt-stone-500)]"
      >
        <span className="rounded-full border border-[var(--jt-stone-200)]/70 bg-[var(--card)]/80 px-2.5 py-1 backdrop-blur-sm">
          {snapshot.persons.length} {snapshot.persons.length === 1 ? 'شخص' : 'أشخاص'}
        </span>
        <span className="hidden rounded-full border border-[var(--jt-stone-200)]/70 bg-[var(--card)]/80 px-2.5 py-1 backdrop-blur-sm md:inline">
          اسحب للتنقل • عجلة الفأرة للتقريب
        </span>
      </div>
    </div>
  );
}

/**
 * Ghost card standing in for the unrecorded parent of a single-parent
 * family (Ancestry-style). Clicking it opens the add-spouse sheet for
 * the recorded parent, which also repairs the family for the children.
 */
function GhostParentNode({
  treeId,
  soloPersonId,
  labelAr,
  left,
  top,
}: {
  readonly treeId: string;
  readonly soloPersonId: string;
  readonly labelAr: string;
  readonly left: number;
  readonly top: number;
}) {
  return (
    <Link
      href={`/tree/${treeId}?selected=${soloPersonId}&add=spouse`}
      scroll={false}
      aria-label={labelAr}
      className="absolute flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--jt-stone-300)] bg-[var(--card)]/40 text-[var(--jt-stone-400)] transition-colors hover:border-[var(--jt-olive-400)] hover:bg-[var(--jt-olive-50)]/60 hover:text-[var(--jt-olive-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jt-gold-400)]"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${CHART_NODE_WIDTH}px`,
        height: `${CHART_NODE_HEIGHT}px`,
      }}
    >
      <Plus className="h-4 w-4" />
      <span
        className="text-sm font-semibold"
        style={{ fontFamily: 'var(--jt-font-display)' }}
      >
        {labelAr}
      </span>
    </Link>
  );
}

function ToolbarButton({
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
      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--jt-stone-600)] transition-colors hover:bg-[var(--jt-olive-50)] hover:text-[var(--jt-olive-800)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jt-gold-400)]"
    >
      {children}
    </button>
  );
}

// Re-export the person type for callers.
export type { PersonView };

/** Remap relatives-tree positions for vertical (swap axes) or fan (radial). */
function applyChartLayout(
  nodes: readonly ExtNode[],
  canvas: { width: number; height: number },
  rootPersonId: string,
  layout: ChartLayoutMode,
): { nodes: readonly ExtNode[]; canvas: { width: number; height: number } } {
  if (nodes.length === 0 || layout === 'horizontal') {
    return { nodes, canvas };
  }

  if (layout === 'vertical') {
    const mapped = nodes.map((n) => ({
      ...n,
      left: n.top,
      top: n.left,
    }));
    return {
      nodes: mapped,
      canvas: { width: canvas.height, height: canvas.width },
    };
  }

  // Fan: concentric arcs by generation from root.
  // Limits that remain: (1) full ChartNode cards stay axis-aligned, so dense
  // rings can still collide labels; (2) marriage/child bus connectors from
  // the horizontal layout are not remapped (spokes + rings replace them);
  // (3) same-generation spouses share a ring without a dedicated marriage arc.
  const root = nodes.find((n) => n.id === rootPersonId);
  if (!root) return { nodes, canvas };

  const byGen = new Map<number, ExtNode[]>();
  for (const n of nodes) {
    const gen = Math.round((n.top - root.top) / 2);
    const list = byGen.get(gen) ?? [];
    list.push(n);
    byGen.set(gen, list);
  }

  // Ring spacing in grid units. Sized so a 220px-wide card (~1.7 units) has
  // breathing room on the arc before the next generation ring.
  const RING = 3.4;
  // Minimum chord between card centres ≈ card width / UNIT_PX + gap.
  const MIN_ARC_GAP = CHART_NODE_WIDTH / UNIT_PX + 0.55;

  const mapped: ExtNode[] = [];
  let maxR = 0;
  for (const [gen, group] of byGen) {
    const sorted = [...group].sort((a, b) => a.left - b.left);
    const peers = sorted.filter((n) => !(gen === 0 && n.id === rootPersonId));
    if (gen === 0) {
      mapped.push({ ...sorted.find((n) => n.id === rootPersonId)!, left: 0, top: 0 });
    }
    if (peers.length === 0) continue;

    // Ancestors above (negative y), descendants below (positive y), each on
    // a semicircle. Same-gen peers (siblings/spouses) share a side ring.
    const side = gen === 0 ? 1 : Math.sign(gen);
    let radius = Math.max(Math.abs(gen), gen === 0 ? 1 : Math.abs(gen)) * RING;
    // Widen the ring when many peers would overlap on the default sweep.
    const sweep = Math.PI * 0.95;
    const needed =
      peers.length <= 1
        ? radius
        : (MIN_ARC_GAP * (peers.length - 1)) / sweep;
    radius = Math.max(radius, needed);
    maxR = Math.max(maxR, radius);

    peers.forEach((n, i) => {
      const t =
        peers.length === 1 ? 0.5 : i / Math.max(peers.length - 1, 1);
      // Angle: 0 = east. Descendants fan through the lower half; ancestors upper.
      const base = side > 0 ? 0 : -Math.PI;
      const angle = base + (-sweep / 2 + sweep * t);
      mapped.push({
        ...n,
        left: Math.cos(angle) * radius,
        top: Math.sin(angle) * radius,
      });
    });
  }

  const span = Math.max(maxR * 2 + 5, 10);
  const minL = Math.min(...mapped.map((n) => n.left));
  const minT = Math.min(...mapped.map((n) => n.top));
  const shifted = mapped.map((n) => ({
    ...n,
    left: n.left - minL,
    top: n.top - minT,
  }));
  return {
    nodes: shifted,
    canvas: { width: span, height: span },
  };
}

/**
 * Radial spokes + faint generation rings for fan mode.
 * Family bus connectors stay off in fan (positions no longer match them).
 */
function FanSpokes({
  nodes,
  rootPersonId,
  canvasWidth,
  canvasHeight,
}: {
  readonly nodes: readonly ExtNode[];
  readonly rootPersonId: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}) {
  const root = nodes.find((n) => n.id === rootPersonId);
  if (!root) return null;
  const cx = PADDING + root.left * UNIT_PX;
  const cy = PADDING + root.top * UNIT_PX;

  const radii = new Map<number, number>();
  for (const n of nodes) {
    if (n.id === rootPersonId) continue;
    const dx = (PADDING + n.left * UNIT_PX) - cx;
    const dy = (PADDING + n.top * UNIT_PX) - cy;
    const r = Math.hypot(dx, dy);
    const bucket = Math.round(r / 8) * 8;
    if (!radii.has(bucket) || r > (radii.get(bucket) ?? 0)) {
      radii.set(bucket, r);
    }
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={canvasWidth}
      height={canvasHeight}
      aria-hidden
    >
      {[...radii.values()].map((r) => (
        <circle
          key={`ring-${r}`}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--jt-stone-200)"
          strokeWidth={1}
          strokeDasharray="4 6"
          strokeOpacity={0.7}
        />
      ))}
      {nodes
        .filter((n) => n.id !== rootPersonId)
        .map((n) => (
          <line
            key={`spoke-${n.id}`}
            x1={cx}
            y1={cy}
            x2={PADDING + n.left * UNIT_PX}
            y2={PADDING + n.top * UNIT_PX}
            stroke="var(--jt-stone-300)"
            strokeWidth={1.75}
            strokeOpacity={0.8}
            strokeLinecap="round"
          />
        ))}
    </svg>
  );
}

/**
 * Arabic label for a generation row, based on signed distance from focus.
 * Negative = ancestors (parents, grandparents…). Positive = descendants.
 * 0 = focus's own generation (self + siblings).
 */
function generationLabel(distance: number): string {
  switch (distance) {
    case 0:
      return 'الذات والأشقاء';
    case -1:
      return 'الوالدان';
    case -2:
      return 'الأجداد';
    case -3:
      return 'أجداد الأجداد';
    case -4:
      return 'أجداد أجداد الأجداد';
    case 1:
      return 'الأبناء';
    case 2:
      return 'الأحفاد';
    case 3:
      return 'أحفاد الأحفاد';
    default:
      return distance < 0 ? `الجيل ${Math.abs(distance)}+ للأعلى` : `الجيل ${distance}+ للأسفل`;
  }
}
