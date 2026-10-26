'use client';

import { Printer, Receipt, Undo2, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { idempotencyKey } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';
import { Link } from '@/i18n/navigation';
import { Alert, Badge, Button, Card, Checkbox, ConfirmButton, Dialog, Field, Input, Select, Spinner, StatusBadge, Table, Td } from './ui';

const CHARGE_TYPES = ['SERVICE', 'MINIBAR', 'LAUNDRY', 'RESTAURANT', 'ROOM', 'DISCOUNT', 'ADJUSTMENT'] as const;
const METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CITY_LEDGER', 'ONLINE'] as const;

export function FolioPanel({ reservationId, companyName }: { reservationId: string; companyName?: string | null }) {
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const folios = useApi<any[]>(`/v1/finance/reservations/${reservationId}/folios`);
  const [dialog, setDialog] = useState<null | { kind: 'charge' | 'payment' | 'refund'; folioId: string; paymentId?: string }>(null);
  const [form, setForm] = useState({ type: 'SERVICE', description: '', amount: '', method: 'CASH', isDeposit: false, reference: '', reason: '' });
  // A fresh idempotency key per dialog opening: double clicks and retries never double-post.
  const [key, setKey] = useState(idempotencyKey());
  const open = (d: typeof dialog) => {
    setKey(idempotencyKey());
    setForm({ type: 'SERVICE', description: '', amount: '', method: 'CASH', isDeposit: false, reference: '', reason: '' });
    setDialog(d);
  };
  const close = () => setDialog(null);
  const charge = useApiMutation(() => ({ path: `/v1/finance/folios/${dialog!.folioId}/charges`, body: { type: form.type, description: form.description, amount: form.amount, idempotencyKey: key } }), { success: t('folio.posted'), onSuccess: close });
  const pay = useApiMutation(() => ({ path: '/v1/finance/payments', body: { folioId: dialog!.folioId, amount: form.amount, method: form.method, isDeposit: form.isDeposit, reference: form.reference || undefined, idempotencyKey: key } }), { success: t('folio.paymentRecorded'), onSuccess: close });
  const refund = useApiMutation(() => ({ path: '/v1/finance/refunds', body: { paymentId: dialog!.paymentId, amount: form.amount, reason: form.reason, idempotencyKey: key } }), { onSuccess: close });
  const reverse = useApiMutation((entryId: string) => ({ path: `/v1/finance/entries/${entryId}/reverse`, body: { reason: 'Correction', idempotencyKey: idempotencyKey() } }));
  const invoice = useApiMutation((v: { folioId: string; kind: 'INVOICE' | 'RECEIPT' }) => ({ path: `/v1/finance/folios/${v.folioId}/invoices`, body: { kind: v.kind } }));
  const addFolio = useApiMutation(() => ({ path: '/v1/finance/folios', body: { reservationId, payer: 'COMPANY', payerName: companyName || t('enum.payer.COMPANY') } }));

  if (folios.isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      {folios.data?.map((fo) => (
        <Card
          key={fo.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t('folio.number', { number: fo.number })} · {fo.payerName} <StatusBadge group="folio" value={fo.status} />
            </span>
          }
          actions={
            <>
              <span className="text-sm font-semibold">{t('folio.balance')}: {f.money(fo.balance, fo.currency)}</span>
              {s.can('folio.post') && <Button size="sm" variant="secondary" onClick={() => open({ kind: 'charge', folioId: fo.id })}>{t('folio.postCharge')}</Button>}
              {s.can('payments.take') && <Button size="sm" icon={Wallet} onClick={() => open({ kind: 'payment', folioId: fo.id })}>{t('folio.takePayment')}</Button>}
              {s.can('folio.post') && <Button size="sm" variant="ghost" icon={Receipt} onClick={() => invoice.mutate({ folioId: fo.id, kind: 'RECEIPT' })}>{t('folio.issueReceipt')}</Button>}
              {s.can('folio.post') && <Button size="sm" variant="ghost" onClick={() => invoice.mutate({ folioId: fo.id, kind: 'INVOICE' })}>{t('folio.issueInvoice')}</Button>}
              <Link href={`/print/folio/${fo.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-brand-700 hover:bg-slate-100">
                <Printer className="h-4 w-4" aria-hidden /> {t('folio.printFolio')}
              </Link>
            </>
          }
        >
          <Table head={[t('common.date'), t('folio.type'), t('folio.description'), t('common.amount'), '']}>
            {fo.entries.map((e: any) => (
              <tr key={e.id} className={e.reversalOfId ? 'text-slate-500' : ''}>
                <Td>{f.date(e.businessDate)}</Td>
                <Td>{t(`enum.entryType.${e.type}` as any)}</Td>
                <Td>{e.description}</Td>
                <Td className="tabular-nums">{f.money(e.amount, fo.currency)}</Td>
                <Td>
                  {s.can('folio.adjust') && !['PAYMENT', 'REFUND'].includes(e.type) && !e.reversalOfId && (
                    <ConfirmButton size="sm" variant="ghost" icon={Undo2} message={t('folio.reverse')} onConfirm={() => reverse.mutate(e.id)}>
                      {t('folio.reverse')}
                    </ConfirmButton>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          {fo.payments.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">{t('folio.payments')}</h3>
              <ul className="space-y-1 text-sm">
                {fo.payments.map((p: any) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    {f.dateTime(p.createdAt)} · {t(`enum.paymentMethod.${p.method}` as any)} · {f.money(p.amount, p.currency)}
                    <StatusBadge group="payment" value={p.status} />
                    {p.isDeposit && <Badge>{t('folio.isDeposit')}</Badge>}
                    {p.status === 'PENDING' && <span className="text-xs text-slate-500">{t('folio.onlinePending')}</span>}
                    {s.can('payments.refund') && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status) && (
                      <Button size="sm" variant="ghost" onClick={() => open({ kind: 'refund', folioId: fo.id, paymentId: p.id })}>{t('folio.refund')}</Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fo.invoices.length > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              {fo.invoices.map((i: any) => `${t(i.kind === 'RECEIPT' ? 'folio.receipt' : 'folio.invoice')} #${i.number}`).join(' · ')}
            </p>
          )}
        </Card>
      ))}
      {s.can('folio.adjust') && (
        <Button size="sm" variant="secondary" onClick={() => addFolio.mutate()}>{t('folio.addFolio')}</Button>
      )}

      <Dialog
        open={!!dialog}
        onClose={close}
        title={dialog?.kind === 'charge' ? t('folio.postCharge') : dialog?.kind === 'payment' ? t('folio.takePayment') : t('folio.refund')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>
            <Button
              loading={charge.isPending || pay.isPending || refund.isPending}
              disabled={!form.amount || (dialog?.kind === 'charge' && !form.description) || (dialog?.kind === 'refund' && form.reason.length < 3)}
              onClick={() => (dialog?.kind === 'charge' ? charge.mutate() : dialog?.kind === 'payment' ? pay.mutate() : refund.mutate())}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {dialog?.kind === 'charge' && (
            <>
              <Field label={t('folio.type')} htmlFor="fc-type">
                <Select id="fc-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {CHARGE_TYPES.filter((x) => s.can('folio.adjust') || !['DISCOUNT', 'ADJUSTMENT'].includes(x)).map((x) => (
                    <option key={x} value={x}>{t(`enum.entryType.${x}`)}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('folio.description')} htmlFor="fc-desc" required>
                <Input id="fc-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </>
          )}
          {dialog?.kind === 'payment' && (
            <>
              <Field label={t('folio.method')} htmlFor="fp-m">
                <Select id="fp-m" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  {METHODS.map((m) => <option key={m} value={m}>{t(`enum.paymentMethod.${m}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('folio.reference')} htmlFor="fp-ref">
                <Input id="fp-ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} dir="ltr" />
              </Field>
              <Checkbox label={t('folio.isDeposit')} checked={form.isDeposit} onChange={(e) => setForm({ ...form, isDeposit: e.target.checked })} />
              {form.method === 'ONLINE' && <Alert tone="info">{t('folio.onlinePending')}</Alert>}
            </>
          )}
          {dialog?.kind === 'refund' && (
            <Field label={t('common.reason')} htmlFor="fr-r" required>
              <Input id="fr-r" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
          )}
          <Field label={t('common.amount')} htmlFor="f-amt" required>
            <Input id="f-amt" inputMode="decimal" dir="ltr" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.-]/g, '') })} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
