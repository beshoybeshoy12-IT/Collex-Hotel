'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequirePerm } from '@/components/staff-shell';
import { EmptyState, Field, Input, Ltr, PageHeader, Pagination, Spinner, Table, Td } from '@/components/ui';
import { qs } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function AuditPage() {
  const t = useTranslations();
  const f = useFormat();
  const [action, setAction] = useState('');
  const [entityType, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi<any>(`/v1/admin/audit${qs({ action, entityType, page, pageSize: 50 })}`);
  return (
    <RequirePerm perm="audit.read">
      <PageHeader title={t('audit.title')} />
      <div className="mb-4 grid max-w-xl grid-cols-2 gap-3">
        <Field label={t('audit.action')} htmlFor="au-a"><Input id="au-a" dir="ltr" placeholder="CHECK_IN" value={action} onChange={(e) => { setAction(e.target.value.toUpperCase()); setPage(1); }} /></Field>
        <Field label={t('audit.entity')} htmlFor="au-e"><Input id="au-e" dir="ltr" placeholder="Reservation" value={entityType} onChange={(e) => { setEntity(e.target.value); setPage(1); }} /></Field>
      </div>
      {list.isLoading ? <Spinner /> : !list.data?.items.length ? <EmptyState /> : (
        <>
          <Table head={[t('audit.time'), t('audit.actor'), t('audit.action'), t('audit.entity'), t('audit.details')]}>
            {list.data.items.map((e: any) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{f.dateTime(e.createdAt)}</Td>
                <Td>{e.actorName ?? <Ltr>{e.actorType}</Ltr>}</Td>
                <Td><Ltr>{e.action}</Ltr></Td>
                <Td><Ltr>{e.entityType}</Ltr></Td>
                <Td><Ltr className="block max-w-md whitespace-pre-wrap break-all text-xs text-slate-600">{JSON.stringify(e.details)}</Ltr></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pageSize={50} total={list.data.total} onPage={setPage} />
        </>
      )}
    </RequirePerm>
  );
}
