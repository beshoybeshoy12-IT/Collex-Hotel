'use client';

import { Camera, FileUp, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

/** Collects one document side locally (camera, file or drag-and-drop) before it is uploaded. */
export function ScanSlot({ label, file, onChange, required, error }: { label: string; file: File | null; onChange(f: File | null): void; required?: boolean; error?: string }) {
  const t = useTranslations();
  const fileInput = useRef<HTMLInputElement>(null);
  const camInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith('image/') || file.type === 'image/heic') return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const take = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) return setLocalError(t('errors.FILE_TOO_LARGE'));
    setLocalError(null);
    onChange(f);
  };
  const msg = localError ?? error;
  return (
    <div
      className={`rounded-lg border-2 border-dashed p-3 ${msg ? 'border-red-400' : 'border-slate-300'}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files);
      }}
    >
      <p className="mb-2 text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </p>
      {file ? (
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-500">PDF</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-600" dir="ltr">{file.name}</p>
            <Button type="button" size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(null)}>{t('common.remove')}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" icon={Camera} onClick={() => camInput.current?.click()}>{t('walkIn.camera')}</Button>
          <Button type="button" size="sm" variant="secondary" icon={FileUp} onClick={() => fileInput.current?.click()}>{t('walkIn.file')}</Button>
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-red-700" role="alert">{msg}</p>}
      <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => take(e.target.files)} />
      <input ref={camInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => take(e.target.files)} />
    </div>
  );
}
