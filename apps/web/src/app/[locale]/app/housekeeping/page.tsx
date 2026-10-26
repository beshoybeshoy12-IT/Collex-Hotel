'use client';

import { CheckCircle2, Play, Plus, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { HousekeepingTaskType, Priority } from '@collex/shared';
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Td } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

type Tab = 'tasks' | 'board' | 'lostFound';

export default function HousekeepingPage() {
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const [tab, setTab] = useState<Tab>('tasks');
  const [mine, setMine] = useState(false);
  const tasks = useApi<any[]>(`/v1/housekeeping/tasks${mine ? '?mine=true' : ''}`, { refetchInterval: 20_000 });
  const board = useApi<any[]>(tab === 'board' ? '/v1/housekeeping/board' : null);
  const lost = useApi<any[]>(tab === 'lostFound' ? '/v1/housekeeping/lost-found' : null);
  const staff = useApi<any[]>('/v1/admin/users');
  const rooms = useApi<any[]>('/v1/property/rooms');
  const [newTask, setNewTask] = useState<null | { roomId: string; type: string; priority: string; assignedToId: string }>(null);
  const [item, setItem] = useState<null | { roomId: string; description: string; storageLocation: string }>(null);
  const update = useApiMutation((v: { id: string; body: any }) => ({ path: `/v1/housekeeping/tasks/${v.id}`, method: 'PATCH', body: v.body }));
  const create = useApiMutation(() => ({ path: '/v1/housekeeping/tasks', body: { ...newTask, assignedToId: newTask!.assignedToId || null } }), { onSuccess: () => setNewTask(null) });
  const addItem = useApiMutation(() => ({ path: '/v1/housekeeping/lost-found', body: { ...item, roomId: item!.roomId || null } }), { onSuccess: () => setItem(null) });
  const closeItem = useApiMutation((v: { id: string; status: string }) => ({ path: `/v1/housekeeping/lost-found/${v.id}/close`, body: { status: v.status } }));
  const supervisor = s.can('housekeeping.supervise');
  const staffName = (id: string | null) => staff.data?.find((u) => u.id === id)?.fullName ?? t('housekeeping.unassigned');

  return (
    <>
      <PageHeader
        title={t('housekeeping.title')}
        actions={
          <>
            {supervisor && <Button icon={Plus} onClick={() => setNewTask({ roomId: '', type: 'STAYOVER', priority: 'NORMAL', assignedToId: '' })}>{t('housekeeping.newTask')}</Button>}
            {s.can('housekeeping.work') && <Button variant="secondary" icon={Plus} onClick={() => setItem({ roomId: '', description: '', storageLocation: '' })}>{t('housekeeping.logItem')}</Button>}
          </>
        }
      />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: 'tasks', label: t('housekeeping.tasks'), count: tasks.data?.length }, { id: 'board', label: t('housekeeping.board') }, { id: 'lostFound', label: t('housekeeping.lostFound') }]} />

      {tab === 'tasks' && (
        <>
          <div className="mb-3"><Checkbox label={t('housekeeping.mine')} checked={mine} onChange={(e) => setMine(e.target.checked)} /></div>
          {tasks.isLoading ? <Spinner /> : !tasks.data?.length ? <EmptyState /> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tasks.data.map((task) => (
                <Card
                  key={task.id}
                  title={<span className="flex items-center gap-2">{t('common.room')} <bdi>{task.room.number}</bdi> <Badge tone={task.priority === 'HIGH' || task.priority === 'URGENT' ? 'danger' : 'neutral'}>{t(`enum.priority.${task.priority}` as any)}</Badge></span>}
                  actions={<StatusBadge group="task" value={task.status} />}
                >
                  <p className="text-sm font-medium">{t(`enum.taskType.${task.type}` as any)}</p>
                  <p className="mt-1 flex flex-wrap gap-1 text-xs text-slate-600">
                    <StatusBadge group="housekeeping" value={task.room.housekeepingStatus} />
                    {task.room.doNotDisturb && <Badge tone="warning">{t('rooms.dnd')}</Badge>}
                    <span>{task.room.floor.name}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{t('housekeeping.assignTo')}: {staffName(task.assignedToId)}</p>
                  {supervisor && (
                    <Select aria-label={t('housekeeping.assignTo')} className="mt-2" value={task.assignedToId ?? ''} onChange={(e) => update.mutate({ id: task.id, body: { assignedToId: e.target.value || null } })}>
                      <option value="">{t('housekeeping.unassigned')}</option>
                      {staff.data?.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                    </Select>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-slate-700">{t('housekeeping.checklist')}</summary>
                    <ul className="mt-1 space-y-1">
                      {(task.checklist as any[]).map((c, i) => (
                        <li key={c.item}>
                          <Checkbox
                            label={t.has(`enum.checklistItem.${c.item}` as any) ? t(`enum.checklistItem.${c.item}` as any) : c.item}
                            checked={c.done}
                            disabled={!['PENDING', 'IN_PROGRESS'].includes(task.status)}
                            onChange={(e) => update.mutate({ id: task.id, body: { checklist: task.checklist.map((x: any, j: number) => (j === i ? { ...x, done: e.target.checked } : x)) } })}
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {task.status === 'PENDING' && <Button size="sm" icon={Play} onClick={() => update.mutate({ id: task.id, body: { status: 'IN_PROGRESS' } })}>{t('housekeeping.start')}</Button>}
                    {task.status === 'IN_PROGRESS' && <Button size="sm" icon={CheckCircle2} onClick={() => update.mutate({ id: task.id, body: { status: 'DONE' } })}>{t('housekeeping.done')}</Button>}
                    {task.status === 'DONE' && supervisor && <Button size="sm" icon={ShieldCheck} onClick={() => update.mutate({ id: task.id, body: { status: 'INSPECTED' } })}>{t('housekeeping.inspect')}</Button>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'board' && (board.isLoading ? <Spinner /> : (
        <Table head={[t('rooms.number'), t('rooms.floor'), t('rooms.occupancy'), t('rooms.housekeeping'), t('rooms.maintenance')]}>
          {board.data?.map((r) => (
            <tr key={r.id}>
              <Td><bdi className="font-semibold">{r.number}</bdi></Td>
              <Td>{r.floor.name}</Td>
              <Td><StatusBadge group="occupancy" value={r.occupancy} /></Td>
              <Td><StatusBadge group="housekeeping" value={r.housekeepingStatus} /> {r.doNotDisturb && <Badge tone="warning">{t('rooms.dnd')}</Badge>}</Td>
              <Td><StatusBadge group="maintenance" value={r.maintenanceStatus} /></Td>
            </tr>
          ))}
        </Table>
      ))}

      {tab === 'lostFound' && (lost.isLoading ? <Spinner /> : !lost.data?.length ? <EmptyState /> : (
        <Table head={[t('common.date'), t('common.room'), t('housekeeping.description'), t('housekeeping.storageLocation'), t('common.status'), '']}>
          {lost.data.map((i) => (
            <tr key={i.id}>
              <Td>{f.dateTime(i.createdAt)}</Td>
              <Td><bdi>{rooms.data?.find((r) => r.id === i.roomId)?.number ?? '—'}</bdi></Td>
              <Td>{i.description}</Td>
              <Td>{i.storageLocation}</Td>
              <Td><StatusBadge group="lostFound" value={i.status} /></Td>
              <Td>
                {i.status === 'STORED' && supervisor && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => closeItem.mutate({ id: i.id, status: 'RETURNED' })}>{t('housekeeping.returned')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => closeItem.mutate({ id: i.id, status: 'DISPOSED' })}>{t('housekeeping.disposed')}</Button>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      ))}

      <Dialog open={!!newTask} onClose={() => setNewTask(null)} title={t('housekeeping.newTask')} footer={<><Button variant="secondary" onClick={() => setNewTask(null)}>{t('common.cancel')}</Button><Button loading={create.isPending} disabled={!newTask?.roomId} onClick={() => create.mutate()}>{t('common.create')}</Button></>}>
        {newTask && (
          <div className="grid gap-3">
            <Field label={t('common.room')} htmlFor="nt-r"><Select id="nt-r" value={newTask.roomId} onChange={(e) => setNewTask({ ...newTask, roomId: e.target.value })}><option value="">—</option>{rooms.data?.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}</Select></Field>
            <Field label={t('folio.type')} htmlFor="nt-t"><Select id="nt-t" value={newTask.type} onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}>{HousekeepingTaskType.map((x) => <option key={x} value={x}>{t(`enum.taskType.${x}`)}</option>)}</Select></Field>
            <Field label={t('maintenance.priority')} htmlFor="nt-p"><Select id="nt-p" value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>{Priority.map((x) => <option key={x} value={x}>{t(`enum.priority.${x}`)}</option>)}</Select></Field>
            <Field label={t('housekeeping.assignTo')} htmlFor="nt-a"><Select id="nt-a" value={newTask.assignedToId} onChange={(e) => setNewTask({ ...newTask, assignedToId: e.target.value })}><option value="">{t('housekeeping.unassigned')}</option>{staff.data?.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</Select></Field>
          </div>
        )}
      </Dialog>
      <Dialog open={!!item} onClose={() => setItem(null)} title={t('housekeeping.logItem')} footer={<><Button variant="secondary" onClick={() => setItem(null)}>{t('common.cancel')}</Button><Button loading={addItem.isPending} disabled={!item || item.description.length < 2} onClick={() => addItem.mutate()}>{t('common.save')}</Button></>}>
        {item && (
          <div className="grid gap-3">
            <Field label={t('common.room')} htmlFor="lf-r"><Select id="lf-r" value={item.roomId} onChange={(e) => setItem({ ...item, roomId: e.target.value })}><option value="">—</option>{rooms.data?.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}</Select></Field>
            <Field label={t('housekeeping.description')} htmlFor="lf-d" required><Input id="lf-d" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></Field>
            <Field label={t('housekeeping.storageLocation')} htmlFor="lf-s"><Input id="lf-s" value={item.storageLocation} onChange={(e) => setItem({ ...item, storageLocation: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
