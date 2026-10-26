'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Priority, WORK_ORDER_TRANSITIONS, type WorkOrderStatus } from '@collex/shared';
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, StatusBadge, Textarea } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

const CATS = ['PLUMBING', 'ELECTRICAL', 'HVAC', 'FURNITURE', 'APPLIANCE', 'IT', 'STRUCTURAL', 'OTHER'] as const;
const SEV = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const;
const BLOCKS = ['NONE', 'OUT_OF_ORDER', 'OUT_OF_SERVICE'] as const;

export default function MaintenancePage() {
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const [status, setStatus] = useState('');
  const list = useApi<any[]>(`/v1/maintenance/work-orders${status ? `?status=${status}` : ''}`, { refetchInterval: 30_000 });
  const rooms = useApi<any[]>('/v1/property/rooms');
  const staff = useApi<any[]>('/v1/admin/users');
  const empty = { roomId: '', title: '', description: '', category: 'OTHER', severity: 'MODERATE', priority: 'NORMAL', blockType: 'NONE', blockFrom: '', blockUntil: '', estimatedCost: '' };
  const [form, setForm] = useState<typeof empty | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<number | null>(null);
  const create = useApiMutation(
    () => ({ path: '/v1/maintenance/work-orders', body: { ...form, roomId: form!.roomId || null, blockFrom: form!.blockFrom || null, blockUntil: form!.blockUntil || null, estimatedCost: form!.estimatedCost || null } }),
    { onSuccess: (r: any) => { setForm(null); setConflicts(r.conflicts?.length || null); } },
  );
  const update = useApiMutation((v: { id: string; body: any }) => ({ path: `/v1/maintenance/work-orders/${v.id}`, method: 'PATCH', body: v.body }));
  const canBlock = s.can('maintenance.approve') || s.can('housekeeping.supervise');

  return (
    <>
      <PageHeader
        title={t('maintenance.title')}
        actions={<Button icon={Plus} onClick={() => setForm(empty)}>{t('maintenance.newWorkOrder')}</Button>}
      />
      {conflicts && <div className="mb-3"><Alert tone="warning">{t('maintenance.conflicts', { count: conflicts })}</Alert></div>}
      <div className="mb-4 max-w-xs">
        <Field label={t('common.status')} htmlFor="wo-st">
          <Select id="wo-st" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {Object.keys(WORK_ORDER_TRANSITIONS).map((x) => <option key={x} value={x}>{t(`status.workOrder.${x}` as any)}</option>)}
          </Select>
        </Field>
      </div>
      {list.isLoading ? <Spinner /> : !list.data?.length ? <EmptyState /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((w) => (
            <Card
              key={w.id}
              title={<span className="flex flex-wrap items-center gap-2">#{f.number(w.number)} {w.title} {w.room && <Badge>{t('common.room')} <bdi>{w.room.number}</bdi></Badge>}</span>}
              actions={<StatusBadge group="workOrder" value={w.status} />}
            >
              <div className="space-y-2 text-sm">
                <p className="flex flex-wrap gap-1">
                  <Badge>{t(`enum.woCategory.${w.category}` as any)}</Badge>
                  <Badge tone={['MAJOR', 'CRITICAL'].includes(w.severity) ? 'danger' : 'neutral'}>{t(`enum.severity.${w.severity}` as any)}</Badge>
                  <Badge>{t(`enum.priority.${w.priority}` as any)}</Badge>
                  {w.blockType !== 'NONE' && <Badge tone="danger">{t(`enum.blockType.${w.blockType}` as any)} {f.date(w.blockFrom)}{w.blockUntil ? ` – ${f.date(w.blockUntil)}` : ''}</Badge>}
                </p>
                {w.description && <p className="text-slate-700">{w.description}</p>}
                <Field label={t('maintenance.assignedTo')} htmlFor={`wo-a-${w.id}`}>
                  <Select id={`wo-a-${w.id}`} value={w.assignedToId ?? ''} disabled={!s.can('maintenance.work')} onChange={(e) => update.mutate({ id: w.id, body: { assignedToId: e.target.value || null } })}>
                    <option value="">{t('housekeeping.unassigned')}</option>
                    {staff.data?.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </Select>
                </Field>
                {w.notes.length > 0 && (
                  <ul className="space-y-1 rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {w.notes.map((n: any) => <li key={n.id}>{f.dateTime(n.createdAt)} — {n.body}</li>)}
                  </ul>
                )}
                {s.can('maintenance.work') && (
                  <div className="flex gap-2">
                    <Input aria-label={t('maintenance.addNote')} placeholder={t('maintenance.addNote')} value={notes[w.id] ?? ''} onChange={(e) => setNotes({ ...notes, [w.id]: e.target.value })} />
                    <Button size="sm" variant="secondary" disabled={!notes[w.id]} onClick={() => { update.mutate({ id: w.id, body: { note: notes[w.id] } }); setNotes({ ...notes, [w.id]: '' }); }}>{t('common.add')}</Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {s.can('maintenance.work') &&
                    WORK_ORDER_TRANSITIONS[w.status as WorkOrderStatus]
                      .filter((to) => !['CLOSED', 'CANCELLED'].includes(to) || s.can('maintenance.approve'))
                      .map((to) => (
                        <Button key={to} size="sm" variant={to === 'CLOSED' ? 'primary' : 'secondary'} onClick={() => update.mutate({ id: w.id, body: { status: to } })}>
                          {to === 'CLOSED' ? t('maintenance.approveClose') : t(`status.workOrder.${to}` as any)}
                        </Button>
                      ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={t('maintenance.newWorkOrder')} wide footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button><Button loading={create.isPending} disabled={!form || form.title.length < 2} onClick={() => create.mutate()}>{t('common.create')}</Button></>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('maintenance.titleField')} htmlFor="wo-t" required className="sm:col-span-2"><Input id="wo-t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label={t('common.room')} htmlFor="wo-r"><Select id="wo-r" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })}><option value="">—</option>{rooms.data?.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}</Select></Field>
            <Field label={t('maintenance.category')} htmlFor="wo-c"><Select id="wo-c" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((x) => <option key={x} value={x}>{t(`enum.woCategory.${x}`)}</option>)}</Select></Field>
            <Field label={t('maintenance.severity')} htmlFor="wo-s"><Select id="wo-s" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{SEV.map((x) => <option key={x} value={x}>{t(`enum.severity.${x}`)}</option>)}</Select></Field>
            <Field label={t('maintenance.priority')} htmlFor="wo-p"><Select id="wo-p" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{Priority.map((x) => <option key={x} value={x}>{t(`enum.priority.${x}`)}</option>)}</Select></Field>
            {canBlock && (
              <>
                <Field label={t('maintenance.block')} htmlFor="wo-b"><Select id="wo-b" value={form.blockType} onChange={(e) => setForm({ ...form, blockType: e.target.value })}>{BLOCKS.map((x) => <option key={x} value={x}>{t(`enum.blockType.${x}`)}</option>)}</Select></Field>
                {form.blockType !== 'NONE' && (
                  <>
                    <Field label={t('maintenance.blockFrom')} htmlFor="wo-bf"><Input id="wo-bf" type="date" value={form.blockFrom} onChange={(e) => setForm({ ...form, blockFrom: e.target.value })} /></Field>
                    <Field label={t('maintenance.blockUntil')} htmlFor="wo-bu"><Input id="wo-bu" type="date" value={form.blockUntil} onChange={(e) => setForm({ ...form, blockUntil: e.target.value })} /></Field>
                  </>
                )}
              </>
            )}
            <Field label={t('maintenance.estimatedCost')} htmlFor="wo-ec"><Input id="wo-ec" dir="ltr" inputMode="decimal" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label={t('maintenance.description')} htmlFor="wo-d" className="sm:col-span-2"><Textarea id="wo-d" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
