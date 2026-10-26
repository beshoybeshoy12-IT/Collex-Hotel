'use client';

import { Plus, RefreshCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { DocumentScope } from '@collex/shared';
import { Alert, Badge, Button, Card, Checkbox, ConfirmButton, Dialog, Field, Input, Ltr, LtrInput, PageHeader, Select, Spinner, StatusBadge, Table, Tabs, Td, Textarea } from '@/components/ui';
import { useFormat, useLocalName } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

type Tab = 'property' | 'policy' | 'categories' | 'rooms' | 'rates' | 'users' | 'notifications' | 'security';

function PropertyTab() {
  const t = useTranslations();
  const s = useRequiredSession();
  const p = useApi<any>('/v1/property');
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    if (p.data && !v) setV({ ...p.data, taxPercent: String(p.data.taxPercent), serviceChargePercent: String(p.data.serviceChargePercent) });
  }, [p.data, v]);
  const save = useApiMutation(() => ({
    path: '/v1/property',
    method: 'PATCH',
    body: { name: v.name, nameAr: v.nameAr, timezone: v.timezone, currency: v.currency, checkInTime: v.checkInTime, checkOutTime: v.checkOutTime, taxPercent: v.taxPercent, serviceChargePercent: v.serviceChargePercent, overbookingEnabled: v.overbookingEnabled, arabicNumerals: v.arabicNumerals, descriptionEn: v.descriptionEn, descriptionAr: v.descriptionAr, policiesEn: v.policiesEn, policiesAr: v.policiesAr, phone: v.phone, address: v.address },
  }));
  if (!v) return <Spinner />;
  const ro = !s.can('property.manage');
  const set = (k: string, val: unknown) => setV({ ...v, [k]: val });
  return (
    <Card actions={!ro && <Button loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>}>
      <fieldset disabled={ro} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('settings.name')} htmlFor="p-n"><Input id="p-n" value={v.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label={t('settings.nameAr')} htmlFor="p-na"><Input id="p-na" dir="rtl" value={v.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></Field>
        <Field label={t('settings.timezone')} htmlFor="p-tz"><LtrInput id="p-tz" value={v.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
        <Field label={t('settings.currency')} htmlFor="p-c"><LtrInput id="p-c" maxLength={3} value={v.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} /></Field>
        <Field label={t('settings.checkInTime')} htmlFor="p-ci"><Input id="p-ci" type="time" value={v.checkInTime} onChange={(e) => set('checkInTime', e.target.value)} /></Field>
        <Field label={t('settings.checkOutTime')} htmlFor="p-co"><Input id="p-co" type="time" value={v.checkOutTime} onChange={(e) => set('checkOutTime', e.target.value)} /></Field>
        <Field label={t('settings.taxPercent')} htmlFor="p-tx"><LtrInput id="p-tx" value={v.taxPercent} onChange={(e) => set('taxPercent', e.target.value)} /></Field>
        <Field label={t('settings.serviceChargePercent')} htmlFor="p-sc"><LtrInput id="p-sc" value={v.serviceChargePercent} onChange={(e) => set('serviceChargePercent', e.target.value)} /></Field>
        <Field label={t('guests.phone')} htmlFor="p-ph"><LtrInput id="p-ph" value={v.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label={t('guests.address')} htmlFor="p-ad" className="sm:col-span-2"><Input id="p-ad" value={v.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          <Checkbox label={t('settings.arabicNumerals')} checked={v.arabicNumerals} onChange={(e) => set('arabicNumerals', e.target.checked)} />
          <Checkbox label={t('settings.overbooking')} checked={v.overbookingEnabled} onChange={(e) => set('overbookingEnabled', e.target.checked)} />
        </div>
        <Field label={t('settings.descriptionAr')} htmlFor="p-da"><Textarea id="p-da" dir="rtl" value={v.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} /></Field>
        <Field label={t('settings.descriptionEn')} htmlFor="p-de"><Textarea id="p-de" dir="ltr" value={v.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} /></Field>
        <Field label={t('settings.policiesAr')} htmlFor="p-pa"><Textarea id="p-pa" dir="rtl" value={v.policiesAr} onChange={(e) => set('policiesAr', e.target.value)} /></Field>
        <Field label={t('settings.policiesEn')} htmlFor="p-pe"><Textarea id="p-pe" dir="ltr" value={v.policiesEn} onChange={(e) => set('policiesEn', e.target.value)} /></Field>
      </fieldset>
    </Card>
  );
}

function PolicyTab() {
  const t = useTranslations();
  const s = useRequiredSession();
  const p = useApi<any>('/v1/property/check-in-policy');
  const [v, setV] = useState<any>(null);
  useEffect(() => {
    if (p.data && !v) setV(p.data);
  }, [p.data, v]);
  const save = useApiMutation(() => ({
    path: '/v1/property/check-in-policy',
    method: 'PUT',
    body: { documentScope: v.documentScope, acceptedTypes: v.acceptedTypes, requireVerification: v.requireVerification, allowExceptions: v.allowExceptions, homeCountry: v.homeCountry || null, requireDepositBeforeCheckIn: v.requireDepositBeforeCheckIn, requireInspectedRoom: v.requireInspectedRoom, documentRetentionDays: Number(v.documentRetentionDays) },
  }));
  if (!v) return <Spinner />;
  const ro = !s.can('property.manage');
  return (
    <Card actions={!ro && <Button loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>}>
      <Alert tone="info">{t('settings.legalNote')}</Alert>
      <fieldset disabled={ro} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.documentScope')} htmlFor="po-s">
          <Select id="po-s" value={v.documentScope} onChange={(e) => setV({ ...v, documentScope: e.target.value })}>
            {DocumentScope.map((x) => <option key={x} value={x}>{t(`enum.documentScope.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('settings.homeCountry')} htmlFor="po-h"><LtrInput id="po-h" maxLength={2} value={v.homeCountry ?? ''} onChange={(e) => setV({ ...v, homeCountry: e.target.value.toUpperCase() })} /></Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">{t('settings.acceptedTypes')}</legend>
          {['PASSPORT', 'NATIONAL_ID', 'RESIDENCE_PERMIT', 'DRIVING_LICENSE', 'OTHER'].map((x) => (
            <Checkbox key={x} label={t(`enum.documentType.${x}` as any)} checked={v.acceptedTypes.includes(x)} onChange={(e) => setV({ ...v, acceptedTypes: e.target.checked ? [...v.acceptedTypes, x] : v.acceptedTypes.filter((y: string) => y !== x) })} />
          ))}
        </fieldset>
        <div className="space-y-2">
          <Checkbox label={t('settings.requireVerification')} checked={v.requireVerification} onChange={(e) => setV({ ...v, requireVerification: e.target.checked })} />
          <Checkbox label={t('settings.allowExceptions')} checked={v.allowExceptions} onChange={(e) => setV({ ...v, allowExceptions: e.target.checked })} />
          <Checkbox label={t('settings.requireDeposit')} checked={v.requireDepositBeforeCheckIn} onChange={(e) => setV({ ...v, requireDepositBeforeCheckIn: e.target.checked })} />
          <Checkbox label={t('settings.requireInspected')} checked={v.requireInspectedRoom} onChange={(e) => setV({ ...v, requireInspectedRoom: e.target.checked })} />
        </div>
        <Field label={t('settings.retentionDays')} htmlFor="po-r"><Input id="po-r" type="number" min={1} max={3650} value={v.documentRetentionDays} onChange={(e) => setV({ ...v, documentRetentionDays: e.target.value })} /></Field>
      </fieldset>
    </Card>
  );
}

function CategoriesTab() {
  const t = useTranslations();
  const locale = useLocale();
  const s = useRequiredSession();
  const cats = useApi<any[]>('/v1/property/categories');
  const empty = { code: '', nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, baseOccupancy: 2, bedConfig: 'QUEEN', amenities: [] as string[], images: [] as string[], rank: 1 };
  const [edit, setEdit] = useState<null | { id?: string; v: typeof empty }>(null);
  const save = useApiMutation(() => ({ path: edit!.id ? `/v1/property/categories/${edit!.id}` : '/v1/property/categories', method: edit!.id ? 'PUT' : 'POST', body: edit!.v }), { onSuccess: () => setEdit(null) });
  if (cats.isLoading) return <Spinner />;
  const n = (k: keyof typeof empty) => (e: any) => setEdit({ ...edit!, v: { ...edit!.v, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value } });
  return (
    <Card actions={s.can('rooms.manage') && <Button size="sm" icon={Plus} onClick={() => setEdit({ v: empty })}>{t('settings.newCategory')}</Button>}>
      <Table head={[t('settings.code'), t('reservations.category'), t('settings.maxOccupancy'), t('settings.rank'), t('common.rooms'), '']}>
        {cats.data?.map((c) => (
          <tr key={c.id}>
            <Td><Ltr>{c.code}</Ltr></Td>
            <Td>{locale === 'ar' ? c.nameAr : c.nameEn}</Td>
            <Td>{c.maxAdults}+{c.maxChildren} / {c.maxOccupancy}</Td>
            <Td>{c.rank}</Td>
            <Td>{c._count.rooms}</Td>
            <Td>{s.can('rooms.manage') && <Button size="sm" variant="ghost" onClick={() => setEdit({ id: c.id, v: { code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, descriptionEn: c.descriptionEn, descriptionAr: c.descriptionAr, maxAdults: c.maxAdults, maxChildren: c.maxChildren, maxOccupancy: c.maxOccupancy, baseOccupancy: c.baseOccupancy, bedConfig: c.bedConfig, amenities: c.amenities, images: c.images, rank: c.rank } })}>{t('common.edit')}</Button>}</Td>
          </tr>
        ))}
      </Table>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={t('settings.newCategory')} wide footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('settings.code')} htmlFor="ct-c"><LtrInput id="ct-c" value={edit.v.code} onChange={n('code')} /></Field>
            <Field label={t('settings.name')} htmlFor="ct-n"><Input id="ct-n" value={edit.v.nameEn} onChange={n('nameEn')} /></Field>
            <Field label={t('settings.nameAr')} htmlFor="ct-na"><Input id="ct-na" dir="rtl" value={edit.v.nameAr} onChange={n('nameAr')} /></Field>
            <Field label={t('settings.maxAdults')} htmlFor="ct-ma"><Input id="ct-ma" type="number" value={edit.v.maxAdults} onChange={n('maxAdults')} /></Field>
            <Field label={t('settings.maxChildren')} htmlFor="ct-mc"><Input id="ct-mc" type="number" value={edit.v.maxChildren} onChange={n('maxChildren')} /></Field>
            <Field label={t('settings.maxOccupancy')} htmlFor="ct-mo"><Input id="ct-mo" type="number" value={edit.v.maxOccupancy} onChange={n('maxOccupancy')} /></Field>
            <Field label={t('settings.baseOccupancy')} htmlFor="ct-bo"><Input id="ct-bo" type="number" value={edit.v.baseOccupancy} onChange={n('baseOccupancy')} /></Field>
            <Field label={t('settings.bedConfig')} htmlFor="ct-bc"><LtrInput id="ct-bc" value={edit.v.bedConfig} onChange={n('bedConfig')} /></Field>
            <Field label={t('settings.rank')} htmlFor="ct-r"><Input id="ct-r" type="number" value={edit.v.rank} onChange={n('rank')} /></Field>
            <Field label={t('settings.descriptionAr')} htmlFor="ct-da" className="sm:col-span-3"><Textarea id="ct-da" dir="rtl" value={edit.v.descriptionAr} onChange={n('descriptionAr')} /></Field>
            <Field label={t('settings.descriptionEn')} htmlFor="ct-de" className="sm:col-span-3"><Textarea id="ct-de" dir="ltr" value={edit.v.descriptionEn} onChange={n('descriptionEn')} /></Field>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

function RoomsTab() {
  const t = useTranslations();
  const locale = useLocale();
  const s = useRequiredSession();
  const buildings = useApi<any[]>('/v1/property/buildings');
  const cats = useApi<any[]>('/v1/property/categories');
  const rooms = useApi<any[]>('/v1/property/rooms');
  const ln = useLocalName();
  const [building, setBuilding] = useState({ name: '', nameAr: '' });
  const [floor, setFloor] = useState({ buildingId: '', name: '', nameAr: '', level: 1 });
  const empty = { number: '', floorId: '', categoryId: '', accessible: false, bedType: '', features: '', active: true };
  const [edit, setEdit] = useState<null | { id?: string; v: typeof empty }>(null);
  const addBuilding = useApiMutation(() => ({ path: '/v1/property/buildings', body: building }), { onSuccess: () => setBuilding({ name: '', nameAr: '' }) });
  const addFloor = useApiMutation(() => ({ path: '/v1/property/floors', body: floor }));
  const save = useApiMutation(() => ({ path: edit!.id ? `/v1/property/rooms/${edit!.id}` : '/v1/property/rooms', method: edit!.id ? 'PUT' : 'POST', body: { ...edit!.v, bedType: edit!.v.bedType || null, features: edit!.v.features.split(',').map((x) => x.trim()).filter(Boolean) } }), { onSuccess: () => setEdit(null) });
  if (buildings.isLoading || rooms.isLoading) return <Spinner />;
  const floors = buildings.data?.flatMap((b) => b.floors.map((f: any) => ({ ...f, building: ln(b) }))) ?? [];
  const manage = s.can('rooms.manage');
  return (
    <div className="space-y-5">
      {manage && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={`${t('settings.building')} — ${t('settings.name')}`} htmlFor="b-n"><Input id="b-n" dir="ltr" value={building.name} onChange={(e) => setBuilding({ ...building, name: e.target.value })} /></Field>
            <Field label={`${t('settings.building')} — ${t('settings.nameAr')}`} htmlFor="b-na"><Input id="b-na" dir="rtl" value={building.nameAr} onChange={(e) => setBuilding({ ...building, nameAr: e.target.value })} /></Field>
            <div className="flex items-end"><Button variant="secondary" disabled={!building.name} onClick={() => addBuilding.mutate()}>{t('settings.addBuilding')}</Button></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t('settings.building')} htmlFor="f-b"><Select id="f-b" value={floor.buildingId} onChange={(e) => setFloor({ ...floor, buildingId: e.target.value })}><option value="">—</option>{buildings.data?.map((b) => <option key={b.id} value={b.id}>{ln(b)}</option>)}</Select></Field>
            <Field label={`${t('rooms.floor')} — ${t('settings.name')}`} htmlFor="f-n"><Input id="f-n" dir="ltr" value={floor.name} onChange={(e) => setFloor({ ...floor, name: e.target.value })} /></Field>
            <Field label={`${t('rooms.floor')} — ${t('settings.nameAr')}`} htmlFor="f-na"><Input id="f-na" dir="rtl" value={floor.nameAr} onChange={(e) => setFloor({ ...floor, nameAr: e.target.value })} /></Field>
            <div className="flex items-end gap-2 lg:col-span-2">
              <Input aria-label={t('settings.level')} type="number" value={floor.level} onChange={(e) => setFloor({ ...floor, level: Number(e.target.value) })} />
              <Button variant="secondary" disabled={!floor.buildingId || !floor.name} onClick={() => addFloor.mutate()}>{t('settings.addFloor')}</Button>
            </div>
          </div>
        </Card>
      )}
      <Card actions={manage && <Button size="sm" icon={Plus} onClick={() => setEdit({ v: { ...empty, floorId: floors[0]?.id ?? '', categoryId: cats.data?.[0]?.id ?? '' } })}>{t('settings.newRoom')}</Button>}>
        <Table head={[t('rooms.number'), t('rooms.floor'), t('rooms.category'), t('settings.active'), '']}>
          {rooms.data?.map((r) => (
            <tr key={r.id}>
              <Td><bdi className="font-semibold">{r.number}</bdi> {r.accessible && <Badge tone="info">{t('rooms.accessible')}</Badge>}</Td>
              <Td>{ln(r.floor)}</Td>
              <Td>{locale === 'ar' ? r.category.nameAr : r.category.nameEn}</Td>
              <Td>{r.active ? t('common.yes') : t('common.no')}</Td>
              <Td>{manage && <Button size="sm" variant="ghost" onClick={() => setEdit({ id: r.id, v: { number: r.number, floorId: r.floor.id, categoryId: r.category.id, accessible: r.accessible, bedType: r.bedType ?? '', features: r.features.join(', '), active: r.active } })}>{t('common.edit')}</Button>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={t('settings.newRoom')} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button loading={save.isPending} disabled={!edit?.v.number || !edit?.v.floorId || !edit?.v.categoryId} onClick={() => save.mutate()}>{t('common.save')}</Button></>}>
        {edit && (
          <div className="grid gap-3">
            <Field label={t('rooms.number')} htmlFor="r-n"><LtrInput id="r-n" value={edit.v.number} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, number: e.target.value } })} /></Field>
            <Field label={t('rooms.floor')} htmlFor="r-f"><Select id="r-f" value={edit.v.floorId} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, floorId: e.target.value } })}>{floors.map((f) => <option key={f.id} value={f.id}>{f.building} · {ln(f)}</option>)}</Select></Field>
            <Field label={t('rooms.category')} htmlFor="r-c"><Select id="r-c" value={edit.v.categoryId} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, categoryId: e.target.value } })}>{cats.data?.map((c) => <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameAr : c.nameEn}</option>)}</Select></Field>
            <Field label={t('settings.bedType')} htmlFor="r-b"><LtrInput id="r-b" value={edit.v.bedType} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, bedType: e.target.value } })} /></Field>
            <Field label={t('settings.features')} htmlFor="r-ft"><LtrInput id="r-ft" value={edit.v.features} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, features: e.target.value } })} /></Field>
            <Checkbox label={t('rooms.accessible')} checked={edit.v.accessible} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, accessible: e.target.checked } })} />
            <Checkbox label={t('settings.active')} checked={edit.v.active} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, active: e.target.checked } })} />
          </div>
        )}
      </Dialog>
    </div>
  );
}

function RatesTab() {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const s = useRequiredSession();
  const plans = useApi<any[]>('/v1/rates/plans');
  const cats = useApi<any[]>('/v1/property/categories');
  const emptyPlan = { code: '', nameEn: '', nameAr: '', refundable: true, freeCancellationHours: 24, penaltyNights: 1, depositPercent: '0', minStay: 1, maxStay: 30, promoCode: '', discountPercent: '0', corporateAccount: '', public: true, active: true };
  const [plan, setPlan] = useState<null | { id?: string; v: typeof emptyPlan }>(null);
  const [price, setPrice] = useState<null | { planId: string; categoryId: string; startDate: string; endDate: string; weekdays: number[]; amount: string; extraAdultAmount: string; extraChildAmount: string; priority: number }>(null);
  const savePlan = useApiMutation(() => ({ path: plan!.id ? `/v1/rates/plans/${plan!.id}` : '/v1/rates/plans', method: plan!.id ? 'PUT' : 'POST', body: { ...plan!.v, promoCode: plan!.v.promoCode || null, corporateAccount: plan!.v.corporateAccount || null } }), { onSuccess: () => setPlan(null) });
  const savePrice = useApiMutation(() => { const { planId, ...body } = price!; return { path: `/v1/rates/plans/${planId}/prices`, body }; }, { onSuccess: () => setPrice(null) });
  const removePrice = useApiMutation((v: { planId: string; id: string }) => ({ path: `/v1/rates/plans/${v.planId}/prices/${v.id}`, method: 'DELETE' }));
  if (plans.isLoading) return <Spinner />;
  const manage = s.can('rates.manage');
  const cat = (id: string) => cats.data?.find((c) => c.id === id);
  const pv = (k: keyof typeof emptyPlan) => (e: any) => setPlan({ ...plan!, v: { ...plan!.v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value } });
  return (
    <div className="space-y-4">
      {manage && <Button size="sm" icon={Plus} onClick={() => setPlan({ v: emptyPlan })}>{t('settings.newPlan')}</Button>}
      {plans.data?.map((p) => (
        <Card
          key={p.id}
          title={<span className="flex flex-wrap items-center gap-2"><Ltr>{p.code}</Ltr> {locale === 'ar' ? p.nameAr : p.nameEn} {!p.public && <Badge>{t('enum.source.CORPORATE')}</Badge>} {p.promoCode && <Badge tone="info"><Ltr>{p.promoCode}</Ltr></Badge>} {!p.active && <Badge tone="danger">{t('settings.active')}: {t('common.no')}</Badge>}</span>}
          actions={manage && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setPlan({ id: p.id, v: { code: p.code, nameEn: p.nameEn, nameAr: p.nameAr, refundable: p.refundable, freeCancellationHours: p.freeCancellationHours, penaltyNights: p.penaltyNights, depositPercent: String(p.depositPercent), minStay: p.minStay, maxStay: p.maxStay, promoCode: p.promoCode ?? '', discountPercent: String(p.discountPercent), corporateAccount: p.corporateAccount ?? '', public: p.public, active: p.active } })}>{t('common.edit')}</Button>
              <Button size="sm" icon={Plus} onClick={() => setPrice({ planId: p.id, categoryId: cats.data?.[0]?.id ?? '', startDate: '', endDate: '', weekdays: [], amount: '', extraAdultAmount: '0', extraChildAmount: '0', priority: 0 })}>{t('settings.addPrice')}</Button>
            </>
          )}
        >
          <p className="mb-2 text-xs text-slate-600">
            {p.refundable ? t('public.refundable', { hours: p.freeCancellationHours }) : t('public.nonRefundable')} · {t('settings.depositPercent')} {Number(p.depositPercent)} · {t('settings.discountPercent')} {Number(p.discountPercent)} · {t('settings.minStay')} {p.minStay}
          </p>
          <Table head={[t('reservations.category'), t('common.from'), t('common.to'), t('settings.weekdays'), t('common.amount'), t('settings.priorityField'), '']}>
            {p.prices.map((x: any) => (
              <tr key={x.id}>
                <Td>{locale === 'ar' ? cat(x.categoryId)?.nameAr : cat(x.categoryId)?.nameEn}</Td>
                <Td>{f.date(x.startDate)}</Td>
                <Td>{f.date(x.endDate)}</Td>
                <Td><Ltr>{x.weekdays.join(',') || '*'}</Ltr></Td>
                <Td>{f.money(x.amount)}</Td>
                <Td>{x.priority}</Td>
                <Td>{manage && <ConfirmButton size="sm" variant="ghost" message={t('common.remove')} onConfirm={() => removePrice.mutate({ planId: p.id, id: x.id })}>{t('common.remove')}</ConfirmButton>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
      <Dialog open={!!plan} onClose={() => setPlan(null)} title={t('settings.newPlan')} wide footer={<><Button variant="secondary" onClick={() => setPlan(null)}>{t('common.cancel')}</Button><Button loading={savePlan.isPending} onClick={() => savePlan.mutate()}>{t('common.save')}</Button></>}>
        {plan && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('settings.code')} htmlFor="rp-c"><LtrInput id="rp-c" value={plan.v.code} onChange={pv('code')} /></Field>
            <Field label={t('settings.name')} htmlFor="rp-n"><Input id="rp-n" value={plan.v.nameEn} onChange={pv('nameEn')} /></Field>
            <Field label={t('settings.nameAr')} htmlFor="rp-na"><Input id="rp-na" dir="rtl" value={plan.v.nameAr} onChange={pv('nameAr')} /></Field>
            <Field label={t('settings.freeCancelHours')} htmlFor="rp-fc"><Input id="rp-fc" type="number" value={plan.v.freeCancellationHours} onChange={pv('freeCancellationHours')} /></Field>
            <Field label={t('settings.penaltyNights')} htmlFor="rp-pn"><Input id="rp-pn" type="number" value={plan.v.penaltyNights} onChange={pv('penaltyNights')} /></Field>
            <Field label={t('settings.depositPercent')} htmlFor="rp-dp"><LtrInput id="rp-dp" value={plan.v.depositPercent} onChange={pv('depositPercent')} /></Field>
            <Field label={t('settings.discountPercent')} htmlFor="rp-di"><LtrInput id="rp-di" value={plan.v.discountPercent} onChange={pv('discountPercent')} /></Field>
            <Field label={t('settings.minStay')} htmlFor="rp-mi"><Input id="rp-mi" type="number" value={plan.v.minStay} onChange={pv('minStay')} /></Field>
            <Field label={t('settings.maxStay')} htmlFor="rp-mx"><Input id="rp-mx" type="number" value={plan.v.maxStay} onChange={pv('maxStay')} /></Field>
            <Field label={t('public.promoCode')} htmlFor="rp-pc"><LtrInput id="rp-pc" value={plan.v.promoCode} onChange={pv('promoCode')} /></Field>
            <Field label={t('reservations.companyName')} htmlFor="rp-co"><Input id="rp-co" value={plan.v.corporateAccount} onChange={pv('corporateAccount')} /></Field>
            <div className="flex flex-col gap-2">
              <Checkbox label={t('public.refundable', { hours: plan.v.freeCancellationHours })} checked={plan.v.refundable} onChange={pv('refundable')} />
              <Checkbox label={t('settings.public')} checked={plan.v.public} onChange={pv('public')} />
              <Checkbox label={t('settings.active')} checked={plan.v.active} onChange={pv('active')} />
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={!!price} onClose={() => setPrice(null)} title={t('settings.addPrice')} footer={<><Button variant="secondary" onClick={() => setPrice(null)}>{t('common.cancel')}</Button><Button loading={savePrice.isPending} disabled={!price?.amount || !price.startDate || !price.endDate} onClick={() => savePrice.mutate()}>{t('common.save')}</Button></>}>
        {price && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('reservations.category')} htmlFor="pr-c" className="sm:col-span-2"><Select id="pr-c" value={price.categoryId} onChange={(e) => setPrice({ ...price, categoryId: e.target.value })}>{cats.data?.map((c) => <option key={c.id} value={c.id}>{locale === 'ar' ? c.nameAr : c.nameEn}</option>)}</Select></Field>
            <Field label={t('common.from')} htmlFor="pr-s"><Input id="pr-s" type="date" value={price.startDate} onChange={(e) => setPrice({ ...price, startDate: e.target.value })} /></Field>
            <Field label={t('common.to')} htmlFor="pr-e"><Input id="pr-e" type="date" value={price.endDate} onChange={(e) => setPrice({ ...price, endDate: e.target.value })} /></Field>
            <Field label={t('common.amount')} htmlFor="pr-a"><LtrInput id="pr-a" value={price.amount} onChange={(e) => setPrice({ ...price, amount: e.target.value })} /></Field>
            <Field label={t('settings.priorityField')} htmlFor="pr-p"><Input id="pr-p" type="number" value={price.priority} onChange={(e) => setPrice({ ...price, priority: Number(e.target.value) })} /></Field>
            <Field label={t('settings.extraAdult')} htmlFor="pr-ea"><LtrInput id="pr-ea" value={price.extraAdultAmount} onChange={(e) => setPrice({ ...price, extraAdultAmount: e.target.value })} /></Field>
            <Field label={t('settings.extraChild')} htmlFor="pr-ec"><LtrInput id="pr-ec" value={price.extraChildAmount} onChange={(e) => setPrice({ ...price, extraChildAmount: e.target.value })} /></Field>
            <Field label={t('settings.weekdays')} htmlFor="pr-w" hint="1-7" className="sm:col-span-2"><LtrInput id="pr-w" placeholder="5,6" value={price.weekdays.join(',')} onChange={(e) => setPrice({ ...price, weekdays: e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 7) })} /></Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function UsersTab() {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const s = useRequiredSession();
  const users = useApi<any[]>('/v1/admin/users');
  const roles = useApi<any[]>(s.can('users.manage') ? '/v1/admin/roles' : null);
  const [form, setForm] = useState<null | { email: string; fullName: string; password: string; roleCode: string; locale: 'ar' | 'en' }>(null);
  const create = useApiMutation(() => ({ path: '/v1/admin/users', body: form }), { onSuccess: () => setForm(null) });
  const deactivate = useApiMutation((id: string) => ({ path: `/v1/admin/users/${id}/deactivate` }));
  if (users.isLoading) return <Spinner />;
  return (
    <Card actions={s.can('users.manage') && <Button size="sm" icon={Plus} onClick={() => setForm({ email: '', fullName: '', password: '', roleCode: 'RECEPTIONIST', locale: 'ar' })}>{t('settings.newUser')}</Button>}>
      <Table head={[t('settings.fullName'), t('auth.email'), t('settings.role'), t('settings.mfa'), t('settings.lastLogin'), '']}>
        {users.data?.map((u) => (
          <tr key={u.id}>
            <Td>{u.fullName} {!u.active && <Badge tone="danger">{t('settings.deactivate')}</Badge>}</Td>
            <Td><Ltr>{u.email ?? '—'}</Ltr></Td>
            <Td>{u.roles.map((r: any) => <Badge key={r.id}>{locale === 'ar' ? r.nameAr : r.nameEn}</Badge>)}</Td>
            <Td>{u.mfaEnabled ? t('common.yes') : t('common.no')}</Td>
            <Td>{f.dateTime(u.lastLoginAt)}</Td>
            <Td>{s.can('users.manage') && u.id !== s.me?.id && u.roles.some((r: any) => r.scope === 'PROPERTY') && <ConfirmButton size="sm" variant="ghost" message={t('settings.deactivate')} onConfirm={() => deactivate.mutate(u.id)}>{t('settings.deactivate')}</ConfirmButton>}</Td>
          </tr>
        ))}
      </Table>
      <Dialog open={!!form} onClose={() => setForm(null)} title={t('settings.newUser')} footer={<><Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button><Button loading={create.isPending} onClick={() => create.mutate()}>{t('common.create')}</Button></>}>
        {form && (
          <div className="grid gap-3">
            <Field label={t('settings.fullName')} htmlFor="u-n"><Input id="u-n" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
            <Field label={t('auth.email')} htmlFor="u-e"><LtrInput id="u-e" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('auth.password')} htmlFor="u-p" hint={t('validation.password_too_short')}><LtrInput id="u-p" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <Field label={t('settings.role')} htmlFor="u-r"><Select id="u-r" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>{roles.data?.filter((r) => !['PLATFORM_ADMIN', 'GROUP_ADMIN'].includes(r.code)).map((r) => <option key={r.id} value={r.code}>{locale === 'ar' ? r.nameAr : r.nameEn}</option>)}</Select></Field>
            <Field label={t('guests.preferredLanguage')} htmlFor="u-l"><Select id="u-l" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as 'ar' | 'en' })}><option value="ar">{t('enum.locale.ar')}</option><option value="en">{t('enum.locale.en')}</option></Select></Field>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

function NotificationsTab() {
  const t = useTranslations();
  const f = useFormat();
  const list = useApi<any[]>('/v1/admin/notifications');
  const retry = useApiMutation((id: string) => ({ path: `/v1/admin/notifications/${id}/retry` }));
  if (list.isLoading) return <Spinner />;
  return (
    <Table head={[t('audit.time'), t('settings.channel'), t('settings.template'), t('common.language'), t('common.status'), t('settings.attempts'), '']}>
      {list.data?.map((n) => (
        <tr key={n.id}>
          <Td>{f.dateTime(n.createdAt)}</Td>
          <Td>{n.channel}</Td>
          <Td><Ltr>{n.template}</Ltr></Td>
          <Td>{t(`enum.locale.${n.locale}` as any)}</Td>
          <Td><StatusBadge group="notification" value={n.status} />{n.lastError && <span className="block text-xs text-red-700">{n.lastError}</span>}</Td>
          <Td>{n.attempts}</Td>
          <Td>{n.status === 'FAILED' && <Button size="sm" variant="ghost" icon={RefreshCcw} onClick={() => retry.mutate(n.id)}>{t('common.retry')}</Button>}</Td>
        </tr>
      ))}
    </Table>
  );
}

function SecurityTab() {
  const t = useTranslations();
  const s = useRequiredSession();
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState({ current: '', next: '' });
  const setup = useApiMutation(() => ({ path: '/v1/auth/mfa/setup', propertyId: null }), { onSuccess: (r: any) => setSecret(r.secret) });
  const enable = useApiMutation(() => ({ path: '/v1/auth/mfa/enable', propertyId: null, body: { code } }), { success: t('settings.mfaEnabled'), onSuccess: () => setSecret(null) });
  const change = useApiMutation(() => ({ path: '/v1/auth/password', propertyId: null, body: pw }), { onSuccess: () => setPw({ current: '', next: '' }) });
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card title={t('settings.enableMfa')}>
        {s.me?.mfaEnabled ? (
          <Alert tone="success">{t('settings.mfaEnabled')}</Alert>
        ) : secret ? (
          <div className="space-y-3">
            <p className="text-sm">{t('settings.mfaSecret')}</p>
            <Ltr className="block break-all rounded bg-slate-100 p-2 text-sm">{secret}</Ltr>
            <Field label={t('auth.mfaCode')} htmlFor="mfa-c"><LtrInput id="mfa-c" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button loading={enable.isPending} disabled={code.length !== 6} onClick={() => enable.mutate()}>{t('common.confirm')}</Button>
          </div>
        ) : (
          <Button onClick={() => setup.mutate()} loading={setup.isPending}>{t('settings.enableMfa')}</Button>
        )}
      </Card>
      <Card title={t('settings.changePassword')}>
        <div className="space-y-3">
          <Field label={t('settings.currentPassword')} htmlFor="cp-c"><LtrInput id="cp-c" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label={t('auth.newPassword')} htmlFor="cp-n" hint={t('validation.password_too_short')}><LtrInput id="cp-n" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Button loading={change.isPending} disabled={!pw.current || pw.next.length < 10} onClick={() => change.mutate()}>{t('common.save')}</Button>
        </div>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations();
  const s = useRequiredSession();
  const [tab, setTab] = useState<Tab>('property');
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'property', label: t('settings.property'), show: true },
    { id: 'policy', label: t('settings.policy'), show: true },
    { id: 'categories', label: t('settings.categories'), show: s.can('rooms.read') },
    { id: 'rooms', label: t('settings.roomsSetup'), show: s.can('rooms.read') },
    { id: 'rates', label: t('settings.rates'), show: s.can('rates.read') },
    { id: 'users', label: t('settings.users'), show: true },
    { id: 'notifications', label: t('settings.notifications'), show: s.can('property.manage') },
    { id: 'security', label: t('settings.security'), show: true },
  ];
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs.filter((x) => x.show)} />
      {tab === 'property' && <PropertyTab />}
      {tab === 'policy' && <PolicyTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'rooms' && <RoomsTab />}
      {tab === 'rates' && <RatesTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'security' && <SecurityTab />}
    </>
  );
}
