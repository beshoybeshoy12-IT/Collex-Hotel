'use client';

import { CheckCircle2, Play, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Priority, ServiceCategory } from '@collex/shared';
import { Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, StatusBadge, Table, Td, Textarea } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

const DEPTS = ['FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'FOOD_BEVERAGE', 'CONCIERGE'] as const;

export default function ServicesPage() {
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const [status, setStatus] = useState('');
  const [dept, setDept] = useState('');
  const q = new URLSearchParams({ ...(status ? { status } : {}), ...(dept ? { department: dept } : {}) }).toString();
  const list = useApi<any[]>(`/v1/services/requests${q ? `?${q}` : ''}`, { refetchInterval: 20_000 });
  const rooms = useApi<any[]>('/v1/property/rooms');
  const dash = useApi<any>('/v1/front-desk/dashboard');
  const empty = { stayId: '', category: 'AMENITIES', description: '', priority: 'NORMAL', department: 'HOUSEKEEPING', chargeAmount: '' };
  const [form, setForm] = useState<typeof empty | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const create = useApiMutation(() => ({ path: '/v1/services/requests', body: { ...form, stayId: form!.stayId || null, chargeAmount: form!.chargeAmount || null } }), { onSuccess: () => setForm(null) });
  const update = useApiMutation((v: { id: string; body: any }) => ({ path: `/v1/services/requests/${v.id}`, method: 'PATCH', body: v.body }));
  const roomNo = (id: string | null) => rooms.data?.find((r) => r.id === id)?.number ?? '—';

  return (
    <>
      <PageHeader title={t('services.title')} actions={s.can('services.write') && <Button icon={Plus} onClick={() => setForm(empty)}>{t('services.new')}</Button>} />
      <div className="mb-4 grid max-w-xl grid-cols-2 gap-3">
        <Field label={t('common.status')} htmlFor="sv-st">
          <Select id="sv-st" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((x) => <option key={x} value={x}>{t(`status.service.${x}` as any)}</option>)}
          </Select>
        </Field>
        <Field label={t('services.department')} htmlFor="sv-d">
          <Select id="sv-d" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {DEPTS.map((x) => <option key={x} value={x}>{t(`enum.department.${x}`)}</option>)}
          </Select>
        </Field>
      </div>
      {list.isLoading ? <Spinner /> : !list.data?.length ? <EmptyState /> : (
        <Table head={[t('audit.time'), t('common.room'), t('services.category'), t('services.description'), t('services.department'), t('common.status'), t('common.actions')]}>
          {list.data.map((r) => (
            <tr key={r.id}>
              <Td>{f.dateTime(r.createdAt)}</Td>
              <Td><bdi>{roomNo(r.roomId)}</bdi></Td>
              <Td>{t(`enum.serviceCategory.${r.category}` as any)} {r.createdByGuest && <Badge>{t('services.fromGuest')}</Badge>}</Td>
              <Td className="max-w-xs">{r.description}{r.chargeAmount && <span className="block text-xs text-slate-500">{t('services.charge')}: {f.money(r.chargeAmount)}</span>}</Td>
              <Td>{t(`enum.department.${r.department}` as any)}</Td>
              <Td><StatusBadge group="service" value={r.status} /></Td>
              <Td>
                {s.can('services.write') && (
                  <div className="flex flex-col gap-1">
                    {r.status === 'OPEN' && <Button size="sm" variant="secondary" icon={Play} onClick={() => update.mutate({ id: r.id, body: { status: 'IN_PROGRESS' } })}>{t('services.start')}</Button>}
                    {['OPEN', 'IN_PROGRESS'].includes(r.status) && (
                      <div className="flex gap-1">
                        <Input aria-label={t('services.resolution')} placeholder={t('services.resolution')} value={resolution[r.id] ?? ''} onChange={(e) => setResolution({ ...resolution, [r.id]: e.target.value })} />
                        <Button size="sm" icon={CheckCircle2} onClick={() => update.mutate({ id: r.id, body: { status: 'COMPLETED', resolution: resolution[r.id] ?? '' } })}>{t('services.complete')}</Button>
                      </div>
                    )}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog open={!!form} onClose={() => setForm(null)} title={t('services.new')} footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button><Button loading={create.isPending} disabled={!form || form.description.length < 2} onClick={() => create.mutate()}>{t('common.create')}</Button></>}>
        {form && (
          <div className="grid gap-3">
            <Field label={t('dashboard.inHouse')} htmlFor="sr-st">
              <Select id="sr-st" value={form.stayId} onChange={(e) => setForm({ ...form, stayId: e.target.value })}>
                <option value="">—</option>
                {dash.data?.inHouse.map((st: any) => <option key={st.stayId} value={st.stayId}>{st.room} — {st.guestName}</option>)}
              </Select>
            </Field>
            <Field label={t('services.category')} htmlFor="sr-c"><Select id="sr-c" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{ServiceCategory.map((x) => <option key={x} value={x}>{t(`enum.serviceCategory.${x}`)}</option>)}</Select></Field>
            <Field label={t('services.department')} htmlFor="sr-d"><Select id="sr-d" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>{DEPTS.map((x) => <option key={x} value={x}>{t(`enum.department.${x}`)}</option>)}</Select></Field>
            <Field label={t('maintenance.priority')} htmlFor="sr-p"><Select id="sr-p" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{Priority.map((x) => <option key={x} value={x}>{t(`enum.priority.${x}`)}</option>)}</Select></Field>
            <Field label={t('services.description')} htmlFor="sr-desc" required><Textarea id="sr-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label={t('services.charge')} htmlFor="sr-ch"><Input id="sr-ch" dir="ltr" inputMode="decimal" value={form.chargeAmount} onChange={(e) => setForm({ ...form, chargeAmount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          </div>
        )}
      </Dialog>
    </>
  );
}
