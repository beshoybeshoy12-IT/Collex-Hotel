'use client';

import { Pencil } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { HousekeepingStatus, MaintenanceStatus } from '@collex/shared';
import { FloorPlan } from '@/components/floor-plan';
import { Badge, Button, Card, Field, Input, Ltr, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Td } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useFormat, useLocalName } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

export default function RoomsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const s = useRequiredSession();
  const ln = useLocalName();
  const [view, setView] = useState<'map' | 'list'>('map');
  const buildings = useApi<any[]>('/v1/property/buildings');
  const floors = useMemo(() => buildings.data?.flatMap((b) => b.floors) ?? [], [buildings.data]);
  const [floorId, setFloorId] = useState('');
  useEffect(() => {
    if (!floorId && floors.length) setFloorId(floors[0].id);
  }, [floors, floorId]);
  const rooms = useApi<any[]>('/v1/property/rooms', { refetchInterval: 30_000 });
  const plan = useApi<any>(floorId ? `/v1/property/floors/${floorId}/plan` : null);
  const categories = useApi<any[]>('/v1/property/categories');
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [filters, setFilters] = useState({ q: '', category: '', hk: '', mt: '', occ: '' });
  const detail = useApi<any>(selected ? `/v1/property/rooms/${selected}` : null);
  const saveLayout = useApiMutation((layout: any[]) => ({ path: `/v1/property/floors/${floorId}/plan`, method: 'PUT', body: { width: plan.data.width, height: plan.data.height, rooms: layout } }), { success: t('rooms.layoutSaved'), onSuccess: () => setEdit(false) });
  const setStatus = useApiMutation((v: { housekeepingStatus?: string; doNotDisturb?: boolean }) => ({ path: `/v1/property/rooms/${selected}/status`, method: 'PATCH', body: v }), { success: t('rooms.statusChanged') });

  const matches = (r: any) =>
    (!filters.q || r.number.includes(filters.q)) &&
    (!filters.category || r.category.id === filters.category) &&
    (!filters.hk || r.housekeepingStatus === filters.hk) &&
    (!filters.mt || r.maintenanceStatus === filters.mt) &&
    (!filters.occ || r.occupancy === filters.occ);
  const floorRooms = (rooms.data ?? []).filter((r) => r.floor.id === floorId);
  const highlight = useMemo(() => new Set((rooms.data ?? []).filter(matches).map((r) => r.id)), [rooms.data, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rooms.isLoading || buildings.isLoading) return <Spinner />;
  return (
    <>
      <PageHeader title={t('rooms.title')} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label={t('rooms.selectFloor')} htmlFor="rm-fl">
          <Select id="rm-fl" value={floorId} onChange={(e) => { setFloorId(e.target.value); setSelected(null); setEdit(false); }}>
            {floors.map((fl) => <option key={fl.id} value={fl.id}>{ln(fl)}</option>)}
          </Select>
        </Field>
        <Field label={t('common.search')} htmlFor="rm-q"><Input id="rm-q" dir="ltr" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></Field>
        <Field label={t('rooms.category')} htmlFor="rm-c">
          <Select id="rm-c" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameAr : c.nameEn}</option>)}
          </Select>
        </Field>
        <Field label={t('rooms.housekeeping')} htmlFor="rm-hk">
          <Select id="rm-hk" value={filters.hk} onChange={(e) => setFilters({ ...filters, hk: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {HousekeepingStatus.map((x) => <option key={x} value={x}>{t(`status.housekeeping.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('rooms.maintenance')} htmlFor="rm-mt">
          <Select id="rm-mt" value={filters.mt} onChange={(e) => setFilters({ ...filters, mt: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {MaintenanceStatus.map((x) => <option key={x} value={x}>{t(`status.maintenance.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('rooms.occupancy')} htmlFor="rm-oc">
          <Select id="rm-oc" value={filters.occ} onChange={(e) => setFilters({ ...filters, occ: e.target.value })}>
            <option value="">{t('common.all')}</option>
            <option value="OCCUPIED">{t('status.occupancy.OCCUPIED')}</option>
            <option value="VACANT">{t('status.occupancy.VACANT')}</option>
          </Select>
        </Field>
      </div>
      <Tabs<'map' | 'list'> value={view} onChange={setView} tabs={[{ id: 'map', label: t('rooms.floorPlan') }, { id: 'list', label: t('rooms.list') }]} />
      {view === 'map' ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            {s.can('floorplan.edit') && !edit && <Button size="sm" variant="secondary" icon={Pencil} className="mb-2" onClick={() => setEdit(true)}>{t('rooms.editLayout')}</Button>}
            {plan.data ? (
              <FloorPlan width={plan.data.width} height={plan.data.height} layout={plan.data.rooms} rooms={floorRooms} selected={selected} onSelect={setSelected} editable={edit} highlight={highlight} onSave={(l) => saveLayout.mutate(l)} saving={saveLayout.isPending} />
            ) : (
              <Spinner />
            )}
          </div>
          <div>
            {detail.data ? (
              <Card title={<span>{t('common.room')} <bdi>{detail.data.number}</bdi></span>}>
                <div className="space-y-3 text-sm">
                  <p>{locale === 'ar' ? detail.data.category.nameAr : detail.data.category.nameEn} · {ln(detail.data.floor)}</p>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge group="occupancy" value={detail.data.occupancy} />
                    <StatusBadge group="housekeeping" value={detail.data.housekeepingStatus} />
                    <StatusBadge group="maintenance" value={detail.data.maintenanceStatus} />
                    <StatusBadge group="assignment" value={detail.data.assignmentState} />
                    {detail.data.doNotDisturb && <Badge tone="warning">{t('rooms.dnd')}</Badge>}
                    {detail.data.accessible && <Badge tone="info">{t('rooms.accessible')}</Badge>}
                  </div>
                  {detail.data.currentGuest && (
                    <p>{t('rooms.currentGuest')}: <Link href={`/app/reservations/${detail.data.currentGuest.reservationId}`} className="text-brand-700 hover:underline">{detail.data.currentGuest.name}</Link> ({f.date(detail.data.currentGuest.departure)})</p>
                  )}
                  {detail.data.upcoming.filter((u: any) => u.status === 'PLANNED').slice(0, 3).map((u: any) => (
                    <p key={u.id}>{t('rooms.nextArrival')}: <Link href={`/app/reservations/${u.reservation.id}`} className="text-brand-700 hover:underline"><Ltr>{u.reservation.confirmationNo}</Ltr></Link> · {f.date(u.start)}</p>
                  ))}
                  {s.can('housekeeping.work') && (
                    <Field label={t('rooms.setStatus')} htmlFor="rm-set">
                      <Select id="rm-set" value={detail.data.housekeepingStatus} onChange={(e) => setStatus.mutate({ housekeepingStatus: e.target.value })}>
                        {HousekeepingStatus.map((x) => <option key={x} value={x}>{t(`status.housekeeping.${x}`)}</option>)}
                      </Select>
                    </Field>
                  )}
                  {s.can('housekeeping.work') && (
                    <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ doNotDisturb: !detail.data.doNotDisturb })}>{t('rooms.dnd')}: {detail.data.doNotDisturb ? t('common.yes') : t('common.no')}</Button>
                  )}
                  <details>
                    <summary className="cursor-pointer text-slate-600">{t('rooms.history')}</summary>
                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      {detail.data.history.map((h: any) => <li key={h.id}>{f.dateTime(h.createdAt)} · {h.field}: <Ltr>{h.fromValue} → {h.toValue}</Ltr> {h.reason ? `(${h.reason})` : ''}</li>)}
                    </ul>
                  </details>
                </div>
              </Card>
            ) : (
              <p className="text-sm text-slate-500">{t('rooms.mapHelp')}</p>
            )}
          </div>
        </div>
      ) : (
        <Table head={[t('rooms.number'), t('rooms.floor'), t('rooms.category'), t('rooms.occupancy'), t('rooms.housekeeping'), t('rooms.maintenance'), t('rooms.assignment')]}>
          {rooms.data!.filter(matches).map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => { setSelected(r.id); setFloorId(r.floor.id); setView('map'); }}>
              <Td><button className="font-semibold text-brand-700 hover:underline"><bdi>{r.number}</bdi></button></Td>
              <Td>{ln(r.floor)}</Td>
              <Td>{locale === 'ar' ? r.category.nameAr : r.category.nameEn}</Td>
              <Td><StatusBadge group="occupancy" value={r.occupancy} /></Td>
              <Td><StatusBadge group="housekeeping" value={r.housekeepingStatus} /></Td>
              <Td><StatusBadge group="maintenance" value={r.maintenanceStatus} /></Td>
              <Td><StatusBadge group="assignment" value={r.assignmentState} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
