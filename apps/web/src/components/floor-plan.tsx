'use client';

import { Minus, Plus, RotateCcw, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Input } from './ui';

export interface PlanRoom {
  roomId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface RoomInfo {
  id: string;
  number: string;
  housekeepingStatus: string;
  maintenanceStatus: string;
  occupancy: string;
  assignmentState: string;
  doNotDisturb: boolean;
  accessible: boolean;
}

/** Visual style per room. Status is conveyed by fill AND a text marker AND stroke pattern (never colour alone). */
function roomStyle(r: RoomInfo) {
  if (['OUT_OF_ORDER', 'OUT_OF_SERVICE'].includes(r.maintenanceStatus)) return { fill: '#fee2e2', stroke: '#b91c1c', dash: '6 3', marker: 'OOO' };
  if (r.occupancy === 'OCCUPIED') return { fill: '#dbeafe', stroke: '#1d4ed8', dash: '', marker: '●' };
  if (r.housekeepingStatus === 'DIRTY') return { fill: '#fef3c7', stroke: '#b45309', dash: '2 2', marker: '✕' };
  if (['CLEANING', 'AWAITING_INSPECTION', 'CLEAN'].includes(r.housekeepingStatus)) return { fill: '#ede9fe', stroke: '#6d28d9', dash: '', marker: '◐' };
  return { fill: '#d1fae5', stroke: '#047857', dash: '', marker: '✓' };
}

export function FloorPlan({
  width,
  height,
  layout,
  rooms,
  selected,
  onSelect,
  editable,
  highlight,
  onSave,
  saving,
}: {
  width: number;
  height: number;
  layout: PlanRoom[];
  rooms: RoomInfo[];
  selected?: string | null;
  onSelect?(roomId: string): void;
  editable?: boolean;
  /** Room ids that match current filters/search; others are dimmed. */
  highlight?: Set<string> | null;
  onSave?(layout: PlanRoom[]): void;
  saving?: boolean;
}) {
  const t = useTranslations('rooms');
  const svg = useRef<SVGSVGElement>(null);
  const [items, setItems] = useState<PlanRoom[]>(layout);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<null | { kind: 'room' | 'pan'; id?: string; startX: number; startY: number; orig: { x: number; y: number } }>(null);
  useEffect(() => setItems(layout), [layout]);
  const byId = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const unplaced = rooms.filter((r) => !items.some((i) => i.roomId === r.id));
  const sel = items.find((i) => i.roomId === selected);

  const toSvg = (clientX: number, clientY: number) => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * (width / zoom), y: ((clientY - rect.top) / rect.height) * (height / zoom) };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>{t('zoomIn')}</Button>
        <Button size="sm" variant="secondary" icon={Minus} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>{t('zoomOut')}</Button>
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{t('resetView')}</Button>
        {editable && onSave && <Button size="sm" icon={Save} loading={saving} onClick={() => onSave(items)}>{t('saveLayout')}</Button>}
      </div>
      <div dir="ltr" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <svg
          ref={svg}
          role="img"
          aria-label={t('floorPlan')}
          viewBox={`${-pan.x} ${-pan.y} ${width / zoom} ${height / zoom}`}
          className="h-auto w-full touch-none select-none"
          style={{ aspectRatio: `${width} / ${height}` }}
          onPointerDown={(e) => {
            if (e.target === svg.current) drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, orig: { ...pan } };
          }}
          onPointerMove={(e) => {
            const dr = drag.current;
            if (!dr) return;
            const a = toSvg(dr.startX, dr.startY);
            const b = toSvg(e.clientX, e.clientY);
            if (dr.kind === 'pan') setPan({ x: dr.orig.x + (b.x - a.x), y: dr.orig.y + (b.y - a.y) });
            else setItems((xs) => xs.map((i) => (i.roomId === dr.id ? { ...i, x: Math.max(0, Math.round(dr.orig.x + b.x - a.x)), y: Math.max(0, Math.round(dr.orig.y + b.y - a.y)) } : i)));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={width} height={height} fill="url(#grid)" pointerEvents="none" />
          {items.map((i) => {
            const r = byId.get(i.roomId);
            if (!r) return null;
            const st = roomStyle(r);
            const dim = highlight && !highlight.has(i.roomId);
            return (
              <g
                key={i.roomId}
                transform={`rotate(${i.rotation} ${i.x + i.w / 2} ${i.y + i.h / 2})`}
                opacity={dim ? 0.25 : 1}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${r.number}`}
                aria-pressed={selected === i.roomId}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(i.roomId)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect?.(i.roomId);
                  if (editable) drag.current = { kind: 'room', id: i.roomId, startX: e.clientX, startY: e.clientY, orig: { x: i.x, y: i.y } };
                }}
              >
                <rect x={i.x} y={i.y} width={i.w} height={i.h} rx={8} fill={st.fill} stroke={selected === i.roomId ? '#0f172a' : st.stroke} strokeWidth={selected === i.roomId ? 4 : 2} strokeDasharray={st.dash} />
                <text x={i.x + i.w / 2} y={i.y + i.h / 2 - 6} textAnchor="middle" fontSize={22} fontWeight={700} fill="#0f172a">{r.number}</text>
                <text x={i.x + i.w / 2} y={i.y + i.h / 2 + 20} textAnchor="middle" fontSize={16} fill={st.stroke}>{st.marker}{r.doNotDisturb ? ' DND' : ''}{r.accessible ? ' Ⓐ' : ''}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-slate-500">{t('mapHelp')}</p>
      {editable && sel && (
        <div className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label={t('width')} htmlFor="fp-w"><Input id="fp-w" type="number" min={40} value={sel.w} onChange={(e) => setItems((xs) => xs.map((x) => (x.roomId === sel.roomId ? { ...x, w: Number(e.target.value) } : x)))} /></Field>
          <Field label={t('height')} htmlFor="fp-h"><Input id="fp-h" type="number" min={40} value={sel.h} onChange={(e) => setItems((xs) => xs.map((x) => (x.roomId === sel.roomId ? { ...x, h: Number(e.target.value) } : x)))} /></Field>
          <Field label={t('rotation')} htmlFor="fp-r"><Input id="fp-r" type="number" step={15} value={sel.rotation} onChange={(e) => setItems((xs) => xs.map((x) => (x.roomId === sel.roomId ? { ...x, rotation: Number(e.target.value) } : x)))} /></Field>
        </div>
      )}
      {editable && unplaced.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unplaced.map((r) => (
            <Button key={r.id} size="sm" variant="secondary" onClick={() => setItems((xs) => [...xs, { roomId: r.id, x: 20, y: 20, w: 120, h: 140, rotation: 0 }])}>
              {t('placeRoom')}: {r.number}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
