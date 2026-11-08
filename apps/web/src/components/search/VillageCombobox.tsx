'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, X } from 'lucide-react';

type Village = { id: string; name_ar: string; name_en: string | null; district_ar: string | null; district_en?: string | null };

/**
 * Combobox renders the dropdown into a portal anchored to <body> so the parent
 * advanced-drawer's overflow-hidden (required for its height animation) doesn't
 * clip the menu. Position is recomputed on scroll/resize while the menu is open.
 */
export function VillageCombobox({
  villages,
  value,
  onChange,
  locale,
  placeholder,
}: {
  villages: Village[];
  value: string | null;
  onChange: (id: string | null, village?: Village) => void;
  locale: 'ar' | 'en';
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = useMemo(() => villages.find((v) => v.id === value) ?? null, [villages, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return villages.slice(0, 25);
    const q = query.trim().toLowerCase();
    return villages
      .filter(
        (v) =>
          v.name_ar.toLowerCase().includes(q) ||
          (v.name_en ?? '').toLowerCase().includes(q) ||
          (v.district_ar ?? '').toLowerCase().includes(q) ||
          (v.district_en ?? '').toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [villages, query]);

  // Close on outside click — must consider both wrapper AND the portaled list
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Recompute portal position whenever open OR the page scrolls/resizes
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function update() {
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({
        top: r.bottom + window.scrollY + 4,
        left: r.left + window.scrollX,
        width: r.width,
      });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const showDropdown = open && !selected && filtered.length > 0 && pos && typeof window !== 'undefined';

  return (
    <div ref={wrapperRef} className="relative">
      {selected ? (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery('');
            setOpen(true);
          }}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--jt-olive-300)] bg-[var(--jt-olive-50)] px-3 py-2.5 text-sm font-semibold text-[var(--jt-olive-800)]"
        >
          <span className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            <span style={{ fontFamily: 'var(--jt-font-display)' }}>{selected.name_ar}</span>
            {selected.name_en && (
              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
                {selected.name_en}
              </span>
            )}
          </span>
          <X className="h-3.5 w-3.5 text-[var(--jt-stone-500)]" />
        </button>
      ) : (
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none placeholder:text-[var(--jt-stone-400)] focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
          style={{ fontFamily: locale === 'ar' ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)' }}
        />
      )}

      {showDropdown && pos &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            style={{
              position: 'absolute',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="max-h-64 overflow-y-auto rounded-xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-1 shadow-[var(--jt-shadow-lg)]"
          >
            {filtered.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(v.id, v);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-[var(--jt-olive-50)] rtl:text-right"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span
                      className="text-[var(--jt-olive-900)] font-semibold truncate"
                      style={{ fontFamily: 'var(--jt-font-display)' }}
                    >
                      {v.name_ar}
                    </span>
                    {v.name_en && (
                      <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
                        {v.name_en}
                      </span>
                    )}
                  </span>
                  {v.district_ar && (
                    <span
                      className="text-[10px] text-[var(--jt-stone-500)]"
                      style={{ fontFamily: 'var(--jt-font-arabic)' }}
                    >
                      {v.district_ar}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
