'use client';

import { useTranslations } from 'next-intl';
import { RequirePerm } from '@/components/staff-shell';
import { Badge, EmptyState, Ltr, PageHeader, Spinner, StatusBadge, Table, Td } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function DocumentsQueuePage() {
  const t = useTranslations();
  const f = useFormat();
  const q = useApi<any[]>('/v1/documents/review-queue', { refetchInterval: 30_000 });
  return (
    <RequirePerm perm="documents.view">
      <PageHeader title={t('documents.title')} subtitle={t('documents.queue')} />
      {q.isLoading ? <Spinner /> : !q.data?.length ? <EmptyState /> : (
        <Table head={[t('reservations.guestName'), t('documents.type'), t('documents.masked'), t('documents.files'), t('audit.time'), t('common.status'), '']}>
          {q.data.map((d) => (
            <tr key={d.id}>
              <Td>{d.guest.firstName} {d.guest.lastName}</Td>
              <Td>{t(`enum.documentType.${d.typeCode}` as any)} {d.uploadedByGuest && <Badge>{t('services.fromGuest')}</Badge>}</Td>
              <Td><Ltr>{d.documentNumberMasked || '—'}</Ltr></Td>
              <Td>{f.number(d.files.filter((x: any) => !x.superseded).length)}</Td>
              <Td>{f.dateTime(d.createdAt)}</Td>
              <Td><StatusBadge group="document" value={d.status} /></Td>
              <Td><Link href={`/app/documents/${d.id}`} className="font-medium text-brand-700 hover:underline">{t('documents.review')}</Link></Td>
            </tr>
          ))}
        </Table>
      )}
    </RequirePerm>
  );
}
