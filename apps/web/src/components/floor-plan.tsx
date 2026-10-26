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

/**
 * Each status dimension has its own visual channel, and every state also has a text label (never colour alone):
 *  - housekeeping → tile fill, border colour and symbol (5 distinct states)
 *  - occupancy    → text line, plus a solid header bar when occupied
 *  - maintenance  → red dashed border and red label when not operational
 */
export const HK_STYLE: Record<string, { fill: string; stroke: string; marker: string }> = {
  DIRTY: { fill: '#fef3c7', stroke: '#b45309', marker: '✕' },
  CLEANING: { fill: '#e0f2fe', stroke: '#0369a1', marker: '◔' },
  CLEAN: { fill: '#ecfccb', stroke: '#4d7c0f', marker: '◑' },
  AWAITING_INSPECTION: { fill: '#ede9fe', stroke: '#6d28d9', marker: '◕' },
  INSPECTED: { fill: '#d1fae5', stroke: '#047857', marker: '✓' },
};
const MAINT_STROKE = '#b91c1c';
const OCCUPIED_COLOR = '#1e3a8a';

function useShortLabels() {
  const t = useTranslations('rooms.short');
  return (key: string) => (t.has(key as any) ? t(key as any) : key);
}

/** Legend generated from the same styles as the tiles. */
export function FloorPlanLegend() {
  const short = useShortLabels();
  const t = useTranslations('rooms');
  const Item = ({ fill, stroke, dash, label }: { fill: string; stroke: string; dash?: string; label: string }) => (
    <li className="flex items-center gap-1.5">
      <svg width="22" height="16" aria-hidden>
        <rect x="1" y="1" width="20" height="14" rx="3" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray={dash} />
      </svg>
      {label}
    </li>
  );
  return (
    <div className="space-y-1 text-xs text-slate-700">
      <p className="font-medium">{t('housekeeping')}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(HK_STYLE).map(([k, s]) => (
          <Item key={k} fill={s.fill} stroke={s.stroke} label={`${s.marker} ${short(k)}`} />
        ))}
      </ul>
      <p className="pt-1 font-medium">{t('occupancy')} · {t('maintenance')}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <Item fill={OCCUPIED_COLOR} stroke={OCCUPIED_COLOR} label={`● ${short('OCCUPIED')}`} />
        <Item fill="#ffffff" stroke="#94a3b8" label={`○ ${short('VACANT')}`} />
        <Item fill="#ffffff" stroke={MAINT_STROKE} dash="4 2" label={`⚠ ${short('MAINTENANCE_REQUESTED')} / ${short('OUT_OF_ORDER')}`} />
      </ul>
    </div>
  );
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
  const short = useShortLabels();
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
            const hk = HK_STYLE[r.housekeepingStatus] ?? HK_STYLE.INSPECTED;
            const maint = r.maintenanceStatus !== 'OPERATIONAL';
            const occupied = r.occupancy === 'OCCUPIED';
            const dim = highlight && !highlight.has(i.roomId);
            const cx = i.x + i.w / 2;
            const labels = [short(r.housekeepingStatus), short(r.occupancy), maint ? short(r.maintenanceStatus) : null].filter(Boolean).join(', ');
            return (
              <g
                key={i.roomId}
                transform={`rotate(${i.rotation} ${i.x + i.w / 2} ${i.y + i.h / 2})`}
                opacity={dim ? 0.25 : 1}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${r.number}: ${labels}`}
                aria-pressed={selected === i.roomId}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(i.roomId)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect?.(i.roomId);
                  if (editable) drag.current = { kind: 'room', id: i.roomId, startX: e.clientX, startY: e.clientY, orig: { x: i.x, y: i.y } };
                }}
              >
                {selected === i.roomId && <rect x={i.x - 6} y={i.y - 6} width={i.w + 12} height={i.h + 12} rx={12} fill="none" stroke="#0f172a" strokeWidth={3} />}
                <rect x={i.x} y={i.y} width={i.w} height={i.h} rx={8} fill={hk.fill} stroke={maint ? MAINT_STROKE : hk.stroke} strokeWidth={maint ? 4 : 2.5} strokeDasharray={maint ? '8 4' : undefined} />
                {/* Header bar: occupancy (solid when occupied) */}
                <rect x={i.x + 4} y={i.y + 4} width={i.w - 8} height={22} rx={5} fill={occupied ? OCCUPIED_COLOR : '#ffffff'} stroke={occupied ? OCCUPIED_COLOR : '#cbd5e1'} />
                <text x={cx} y={i.y + 19} textAnchor="middle" fontSize={12} fontWeight={600} fill={occupied ? '#ffffff' : '#475569'}>
                  {occupied ? '● ' : '○ '}
                  {short(r.occupancy)}
                </text>
                <text x={cx} y={i.y + i.h / 2 + 4} textAnchor="middle" fontSize={24} fontWeight={700} fill="#0f172a">{r.number}</text>
                {/* Housekeeping: symbol + label in the status colour */}
                <text x={cx} y={i.y + i.h / 2 + 28} textAnchor="middle" fontSize={13} fontWeight={600} fill={hk.stroke}>
                  {hk.marker} {short(r.housekeepingStatus)}
                </text>
                {maint && (
                  <text x={cx} y={i.y + i.h - 26} textAnchor="middle" fontSize={12} fontWeight={700} fill={MAINT_STROKE}>
                    ⚠ {short(r.maintenanceStatus)}
                  </text>
                )}
                {(r.doNotDisturb || r.accessible) && (
                  <text x={cx} y={i.y + i.h - 10} textAnchor="middle" fontSize={11} fill="#334155">
                    {[r.doNotDisturb ? short('DND') : null, r.accessible ? `Ⓐ ${short('ACCESSIBLE')}` : null].filter(Boolean).join(' · ')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <FloorPlanLegend />
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
