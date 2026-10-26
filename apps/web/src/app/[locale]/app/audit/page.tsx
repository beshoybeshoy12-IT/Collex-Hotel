'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequirePerm } from '@/components/staff-shell';
import { EmptyState, Field, Ltr, PageHeader, Pagination, Select, Spinner, Table, Td } from '@/components/ui';
import { qs } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import en from '../../../../../messages/en.json';

const ACTIONS = Object.keys(en.audit.actions);
const ENTITIES = Object.keys(en.audit.entities);
/** Detail values that are status/enum codes, mapped to their translation group. */
const VALUE_GROUPS: Record<string, string> = {
  housekeepingStatus: 'status.housekeeping',
  status: 'status.reservation',
  source: 'enum.source',
  method: 'enum.paymentMethod',
  typeCode: 'enum.documentType',
  side: 'enum.side',
  priority: 'enum.priority',
  blockType: 'enum.blockType',
  category: 'enum.serviceCategory',
  type: 'enum.entryType',
};

/** Renders audit details as translated "label: value" lines instead of raw JSON. */
function Details({ details, refs }: { details: Record<string, unknown>; refs: Record<string, string> }) {
  const t = useTranslations();
  const f = useFormat();
  const entries = Object.entries(details ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!entries.length) return <span className="text-slate-400">{t('audit.noDetails')}</span>;
  const label = (k: string) => (t.has(`audit.fields.${k}` as any) ? t(`audit.fields.${k}` as any) : k);
  const value = (k: string, v: unknown): React.ReactNode => {
    if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
    if (typeof v === 'string' && refs[v]) return <Ltr className="font-sans">{refs[v]}</Ltr>;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return f.date(v);
    if (typeof v === 'string' && VALUE_GROUPS[k]) {
      for (const g of [VALUE_GROUPS[k], 'status.reservation', 'status.housekeeping', 'status.document', 'status.payment', 'enum.entryType']) {
        if (t.has(`${g}.${v}` as any)) return t(`${g}.${v}` as any);
      }
    }
    if (typeof v === 'string' && t.has(`audit.fields.${v}` as any)) return t(`audit.fields.${v}` as any);
    if (Array.isArray(v)) return v.map((x, i) => <span key={i}>{i > 0 && '، '}{value(k, x)}</span>);
    if (v && typeof v === 'object') return <Details details={v as Record<string, unknown>} refs={refs} />;
    return String(v);
  };
  return (
    <dl className="space-y-0.5 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-1">
          <dt className="font-medium text-slate-500">{label(k)}:</dt>
          <dd className="text-slate-800">{value(k, v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AuditPage() {
  const t = useTranslations();
  const f = useFormat();
  const [action, setAction] = useState('');
  const [entityType, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi<any>(`/v1/admin/audit${qs({ action, entityType, page, pageSize: 50 })}`);
  const tr = (group: string, key: string) => (t.has(`audit.${group}.${key}` as any) ? t(`audit.${group}.${key}` as any) : key);
  return (
    <RequirePerm perm="audit.read">
      <PageHeader title={t('audit.title')} />
      <div className="mb-4 grid max-w-xl grid-cols-2 gap-3">
        <Field label={t('audit.action')} htmlFor="au-a">
          <Select id="au-a" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">{t('audit.allActions')}</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{tr('actions', a)}</option>)}
          </Select>
        </Field>
        <Field label={t('audit.entity')} htmlFor="au-e">
          <Select id="au-e" value={entityType} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            <option value="">{t('audit.allEntities')}</option>
            {ENTITIES.map((a) => <option key={a} value={a}>{tr('entities', a)}</option>)}
          </Select>
        </Field>
      </div>
      {list.isLoading ? <Spinner /> : !list.data?.items.length ? <EmptyState /> : (
        <>
          <Table head={[t('audit.time'), t('audit.actor'), t('audit.action'), t('audit.entity'), t('audit.details')]}>
            {list.data.items.map((e: any) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{f.dateTime(e.createdAt)}</Td>
                <Td>{e.actorName ?? tr('actors', e.actorType)}</Td>
                <Td className="font-medium">{tr('actions', e.action)}</Td>
                <Td>
                  {tr('entities', e.entityType)}
                  {e.entityLabel && <span className="ms-1 text-slate-500">(<Ltr className="font-sans">{e.entityLabel}</Ltr>)</span>}
                </Td>
                <Td><Details details={e.details} refs={list.data.refs ?? {}} /></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pageSize={50} total={list.data.total} onPage={setPage} />
        </>
      )}
    </RequirePerm>
  );
}
