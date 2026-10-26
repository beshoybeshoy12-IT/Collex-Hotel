'use client';

import { ChevronDown, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ISO_COUNTRIES } from '@collex/shared';

/** Localised country names from the browser's CLDR data (Intl.DisplayNames), ISO 3166-1 alpha-2 codes. */
export function useCountryNames() {
  const locale = useLocale();
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale === 'ar' ? 'ar' : 'en'], { type: 'region' });
    const list = ISO_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code }));
    list.sort((a, b) => a.name.localeCompare(b.name, locale));
    return { list, nameOf: (code?: string | null) => (code ? names.of(code.toUpperCase()) ?? code : '') };
  }, [locale]);
}

const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
// Arabic-script and Latin names are both searchable; diacritics and letter-form variants are normalised.
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

/** Searchable combobox for nationality / issuing country. Search by name in Arabic or English, or by ISO code. */
export function CountrySelect({ id, value, onChange, required, invalid }: { id?: string; value: string; onChange(code: string): void; required?: boolean; invalid?: boolean }) {
  const t = useTranslations('common');
  const { list, nameOf } = useCountryNames();
  const enNames = useMemo(() => new Intl.DisplayNames(['en'], { type: 'region' }), []);
  const arNames = useMemo(() => new Intl.DisplayNames(['ar'], { type: 'region' }), []);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return list;
    return list.filter((c) => c.code.toLowerCase() === q || norm(c.name).includes(q) || norm(enNames.of(c.code) ?? '').includes(q) || norm(arNames.of(c.code) ?? '').includes(q));
  }, [query, list, enNames, arNames]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (code: string) => {
    onChange(code);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-required={required}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className="block w-full rounded-lg border border-slate-300 bg-white py-2 pe-16 ps-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 aria-[invalid=true]:border-red-600"
        placeholder={value ? `${flag(value)}  ${nameOf(value)} (${value})` : t('search')}
        value={open ? query : value ? `${flag(value)}  ${nameOf(value)} (${value})` : ''}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && results[active]) {
            e.preventDefault();
            choose(results[active].code);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      <div className="pointer-events-none absolute inset-y-0 end-2 flex items-center gap-1">
        {value && !required && (
          <button type="button" className="pointer-events-auto rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label={t('remove')} onClick={() => onChange('')}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-slate-500">{t('noResults')}</li>}
          {results.map((c, i) => (
            <li
              key={c.code}
              role="option"
              aria-selected={c.code === value}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ${i === active ? 'bg-brand-50' : ''} ${c.code === value ? 'font-semibold' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c.code);
              }}
            >
              <span>
                <span aria-hidden>{flag(c.code)} </span>
                {c.name}
              </span>
              <bdi dir="ltr" className="font-mono text-xs text-slate-500">{c.code}</bdi>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
