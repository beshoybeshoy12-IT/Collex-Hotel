'use client';

import { Camera, FileUp, RotateCw, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, getPropertyId } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { Alert, Button, Field, Input, LtrInput, Select } from './ui';
import { CountrySelect } from './country-select';

const MAX_MB = 10;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';
const TYPES = ['PASSPORT', 'NATIONAL_ID', 'RESIDENCE_PERMIT'] as const;

interface Pending {
  id: string;
  file: File;
  side: 'FRONT' | 'BACK' | 'PAGE';
  preview: string | null;
  rotation: number;
}

/** Uploads with XMLHttpRequest to report progress; the API validates the real content type server-side. */
function uploadWithProgress(url: string, form: FormData, propertyId: string | null, onProgress: (p: number) => void) {
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${url}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('x-collex-csrf', '1');
    if (propertyId) xhr.setRequestHeader('x-property-id', propertyId);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(xhr.status, body?.error?.code ?? 'INTERNAL_ERROR', body?.error?.details, body?.correlationId));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK'));
    xhr.send(form);
  });
}

export function DocumentUploader({
  guestId,
  reservationId,
  mode,
  onUploaded,
}: {
  guestId: string;
  reservationId?: string | null;
  /** staff: full metadata form; guest: guest portal (metadata optional, staff completes it in review). */
  mode: 'staff' | 'guest';
  onUploaded?: () => void;
}) {
  const t = useTranslations();
  const err = useErrorMessage();
  const uid = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [typeCode, setTypeCode] = useState<(typeof TYPES)[number]>('PASSPORT');
  const [meta, setMeta] = useState({ issuingCountry: '', documentNumber: '', holderName: '', issueDate: '', expiryDate: '' });
  const [files, setFiles] = useState<Pending[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), [files]);

  const add = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    setDone(false);
    const next: Pending[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(t('errors.FILE_TOO_LARGE'));
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${Math.random()}`,
        file,
        side: files.length + next.length === 0 ? 'FRONT' : typeCode === 'PASSPORT' ? 'PAGE' : 'BACK',
        preview: file.type.startsWith('image/') && file.type !== 'image/heic' ? URL.createObjectURL(file) : null,
        rotation: 0,
      });
    }
    setFiles((xs) => [...xs, ...next].slice(0, 10));
  };

  const submit = async () => {
    setError(null);
    const form = new FormData();
    const clean = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v.trim() ? v.trim() : null]));
    form.append('meta', JSON.stringify({ guestId, reservationId: reservationId ?? null, typeCode, ...clean }));
    form.append('sides', JSON.stringify(files.map((f) => f.side)));
    files.forEach((f) => form.append('files', f.file, f.file.name));
    setProgress(0);
    try {
      await uploadWithProgress(mode === 'guest' ? '/v1/public/guest/documents' : '/v1/documents', form, mode === 'guest' ? null : getPropertyId(), setProgress);
      setFiles([]);
      setMeta({ issuingCountry: '', documentNumber: '', holderName: '', issueDate: '', expiryDate: '' });
      setDone(true);
      onUploaded?.();
    } catch (e) {
      setError(err(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t('documents.why')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('documents.type')} htmlFor={`${uid}-type`} required>
          <Select id={`${uid}-type`} value={typeCode} onChange={(e) => setTypeCode(e.target.value as any)}>
            {TYPES.map((x) => (
              <option key={x} value={x}>{t(`enum.documentType.${x}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('documents.issuingCountry')} htmlFor={`${uid}-ic`}>
          <CountrySelect id={`${uid}-ic`} value={meta.issuingCountry} onChange={(c) => setMeta({ ...meta, issuingCountry: c })} />
        </Field>
        {mode === 'staff' && (
          <>
            <Field label={t('documents.number')} htmlFor={`${uid}-no`}>
              <LtrInput id={`${uid}-no`} autoComplete="off" value={meta.documentNumber} onChange={(e) => setMeta({ ...meta, documentNumber: e.target.value })} />
            </Field>
            <Field label={t('documents.holderName')} htmlFor={`${uid}-hn`}>
              <Input id={`${uid}-hn`} value={meta.holderName} onChange={(e) => setMeta({ ...meta, holderName: e.target.value })} />
            </Field>
            <Field label={t('documents.issueDate')} htmlFor={`${uid}-id`}>
              <Input id={`${uid}-id`} type="date" value={meta.issueDate} onChange={(e) => setMeta({ ...meta, issueDate: e.target.value })} />
            </Field>
          </>
        )}
        <Field label={t('documents.expiryDate')} htmlFor={`${uid}-ed`}>
          <Input id={`${uid}-ed`} type="date" value={meta.expiryDate} onChange={(e) => setMeta({ ...meta, expiryDate: e.target.value })} />
        </Field>
      </div>
      {mode === 'staff' && <p className="text-xs text-slate-500">{t('documents.ocrNote')}</p>}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-5 text-center ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'}`}
      >
        <FileUp className="mx-auto h-7 w-7 text-slate-400" aria-hidden />
        <p className="mt-2 text-sm text-slate-700">{t('documents.dropHere')}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" icon={Upload} onClick={() => fileInput.current?.click()}>
            {t('documents.chooseFiles')}
          </Button>
          <Button type="button" variant="secondary" size="sm" icon={Camera} onClick={() => cameraInput.current?.click()}>
            {t('documents.takePhoto')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('documents.formats', { mb: MAX_MB })}</p>
        <input ref={fileInput} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => add(e.target.files)} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => add(e.target.files)} />
      </div>

      {files.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {files.map((f) => (
            <li key={f.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                {f.preview ? (
                  // Local preview before upload; orientation can be reviewed with the rotate control.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.preview} alt="" className="max-h-full max-w-full object-contain transition-transform" style={{ transform: `rotate(${f.rotation}deg)` }} />
                ) : (
                  <span className="text-xs text-slate-500">PDF</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-xs text-slate-600" dir="ltr">{f.file.name}</p>
                <Select aria-label={t('documents.side')} value={f.side} onChange={(e) => setFiles((xs) => xs.map((x) => (x.id === f.id ? { ...x, side: e.target.value as any } : x)))}>
                  {(['FRONT', 'BACK', 'PAGE'] as const).map((s) => (
                    <option key={s} value={s}>{t(`enum.side.${s}`)}</option>
                  ))}
                </Select>
                <div className="flex gap-1">
                  {f.preview && (
                    <Button type="button" size="sm" variant="ghost" icon={RotateCw} onClick={() => setFiles((xs) => xs.map((x) => (x.id === f.id ? { ...x, rotation: (x.rotation + 90) % 360 } : x)))}>
                      {t('documents.rotate')}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" icon={Trash2} onClick={() => setFiles((xs) => xs.filter((x) => x.id !== f.id))}>
                    {t('common.remove')}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {progress !== null && (
        <div>
          <p className="mb-1 text-sm text-slate-700">{t('documents.uploading')} {progress}%</p>
          <div className="h-2 overflow-hidden rounded bg-slate-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && (
        <Alert tone="danger" title={t('documents.uploadFailed')}>
          {error}
        </Alert>
      )}
      {done && <Alert tone="success">{t('documents.uploaded')}</Alert>}
      <Button type="button" icon={Upload} onClick={submit} disabled={!files.length || progress !== null} loading={progress !== null}>
        {error && files.length ? t('common.retry') : t('documents.upload')}
      </Button>
    </div>
  );
}
