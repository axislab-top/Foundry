import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface DashboardGridLayoutItem {
  id: string;
  x: number;
  y: number;
  hidden?: boolean;
}

export interface DashboardGridDnDProps {
  storageKey: string;
  columns: number;
  rowHeight: number;
  defaultLayout: DashboardGridLayoutItem[];
  renderItem: (id: string) => React.ReactNode;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export const DashboardGridDnD: React.FC<DashboardGridDnDProps> = ({
  storageKey,
  columns,
  rowHeight,
  defaultLayout,
  renderItem,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cellWidth, setCellWidth] = useState(200);

  const [layout, setLayout] = useState<DashboardGridLayoutItem[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaultLayout;
      const parsed = JSON.parse(raw) as DashboardGridLayoutItem[];
      if (!Array.isArray(parsed)) return defaultLayout;
      // Merge: keep any unknown ids out, but allow updates of missing ids via defaultLayout.
      const defMap = new Map(defaultLayout.map((d) => [d.id, d]));
      const merged: DashboardGridLayoutItem[] = [];
      for (const it of parsed) {
        if (!defMap.has(it.id)) continue;
        const base = defMap.get(it.id)!;
        merged.push({ ...base, ...it });
      }
      for (const base of defaultLayout) {
        if (!merged.some((m) => m.id === base.id)) merged.push({ ...base });
      }
      return merged;
    } catch {
      return defaultLayout;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // Ignore storage errors (private mode / quota).
    }
  }, [layout, storageKey]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || 0;
      const cw = w / Math.max(1, columns);
      setCellWidth(Math.max(120, Math.floor(cw)));
    };
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [columns]);

  const visible = useMemo(() => layout.filter((l) => !l.hidden), [layout]);
  const hidden = useMemo(() => layout.filter((l) => !!l.hidden), [layout]);
  const maxY = Math.max(...visible.map((v) => v.y), 0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startLayoutX: number;
    startLayoutY: number;
  } | null>(null);

  const beginDrag = (id: string, e: React.PointerEvent) => {
    const item = layout.find((l) => l.id === id);
    if (!item || item.hidden) return;

    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    setActiveId(id);
    setPreviewPos({ x: item.x, y: item.y });
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLayoutX: item.x,
      startLayoutY: item.y,
    };
  };

  useEffect(() => {
    if (!activeId) return;

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = ev.clientX - drag.startClientX;
      const dy = ev.clientY - drag.startClientY;

      const nextX = clamp(
        Math.round(((drag.startLayoutX * cellWidth + dx) as number) / cellWidth),
        0,
        Math.max(0, columns - 1),
      );
      const nextY = clamp(Math.round((drag.startLayoutY * rowHeight + dy) / rowHeight), 0, 50);

      setPreviewPos({ x: nextX, y: nextY });
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag || !activeId) return;
      const final = previewPos;
      if (!final) return;

      setLayout((prev) => {
        const idx = prev.findIndex((p) => p.id === activeId);
        if (idx < 0) return prev;
        const next = [...prev];
        const active = { ...next[idx] };
        const oldX = active.x;
        const oldY = active.y;

        // Swap with occupant cell (only among visible items).
        const occupantIdx = prev.findIndex(
          (p) => !p.hidden && p.id !== activeId && p.x === final.x && p.y === final.y,
        );

        active.x = final.x;
        active.y = final.y;
        next[idx] = active;

        if (occupantIdx >= 0) {
          const occ = { ...next[occupantIdx] };
          occ.x = oldX;
          occ.y = oldY;
          next[occupantIdx] = occ;
        }

        return next;
      });

      setActiveId(null);
      setPreviewPos(null);
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
    };
  }, [activeId, cellWidth, columns, previewPos, rowHeight]);

  const setHidden = (id: string, hidden: boolean) => {
    setLayout((prev) => prev.map((p) => (p.id === id ? { ...p, hidden } : p)));
  };

  const containerHeight = (maxY + 1) * rowHeight + 10;

  return (
    <div>
      <div
        ref={containerRef}
        className="dnd-grid"
        style={{ height: containerHeight, gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {layout.map((it) => {
          if (it.hidden) return null;
          const isActive = it.id === activeId;
          const x = isActive && previewPos ? previewPos.x : it.x;
          const y = isActive && previewPos ? previewPos.y : it.y;
          return (
            <div
              key={it.id}
              className="dnd-grid-item"
              style={{
                width: cellWidth,
                left: x * cellWidth,
                top: y * rowHeight,
                height: rowHeight,
              }}
            >
              <div className="dnd-overlay">
                <div className="dnd-drag-handle" onPointerDown={(e) => beginDrag(it.id, e)} aria-label="Drag" />
                <button className="dnd-hide-btn" onClick={() => setHidden(it.id, true)} type="button">
                  Hide
                </button>
              </div>
              <div className="dnd-content">{renderItem(it.id)}</div>
            </div>
          );
        })}
      </div>

      {hidden.length ? (
        <div className="dnd-hidden-bar">
          <span className="dnd-hidden-label">Hidden:</span>
          <div className="dnd-hidden-actions">
            {hidden.map((h) => (
              <button key={h.id} className="btn btn-small" onClick={() => setHidden(h.id, false)}>
                {h.id}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

