import { describe, expect, it } from 'vitest';
import ar from '../messages/ar.json';
import en from '../messages/en.json';
import { defaultLocale, dirOf, locales } from '../src/i18n/config';
import * as fs from 'node:fs';
import * as path from 'node:path';

function keys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
}
function get(obj: any, key: string) {
  return key.split('.').reduce((o, k) => o?.[k], obj);
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort();

describe('internationalisation', () => {
  it('uses Arabic as the default locale with RTL direction', () => {
    expect(defaultLocale).toBe('ar');
    expect(locales).toEqual(['ar', 'en']);
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });

  it('has exactly the same keys in Arabic and English', () => {
    const a = keys(ar).sort();
    const e = keys(en).sort();
    expect(a.filter((k) => !e.includes(k))).toEqual([]);
    expect(e.filter((k) => !a.includes(k))).toEqual([]);
  });

  it('has no empty translations and keeps ICU placeholders consistent', () => {
    for (const k of keys(en)) {
      const a = get(ar, k) as string;
      const e = get(en, k) as string;
      expect(a.trim().length, k).toBeGreaterThan(0);
      expect(e.trim().length, k).toBeGreaterThan(0);
      expect(placeholders(a), k).toEqual(placeholders(e));
    }
  });

  it('Arabic strings are actually Arabic (no untranslated English left behind)', () => {
    const allowed = /^(enum\.locale\.en|common\.switchTo)$/;
    const untranslated = keys(ar).filter((k) => {
      const v = get(ar, k) as string;
      return !allowed.test(k) && !/[؀-ۿ]/.test(v);
    });
    expect(untranslated).toEqual([]);
  });

  it('covers every error code the API can return for critical workflows', () => {
    const critical = ['DOCUMENTS_INCOMPLETE', 'ROOM_ALREADY_ALLOCATED', 'ROOM_NOT_ELIGIBLE', 'NO_AVAILABILITY', 'BALANCE_OUTSTANDING', 'FILE_TYPE_NOT_ALLOWED', 'PERMISSION_DENIED', 'PROPERTY_ACCESS_DENIED', 'INVALID_CREDENTIALS', 'DEPOSIT_REQUIRED'];
    for (const c of critical) {
      expect((ar as any).errors[c], c).toBeTruthy();
      expect((en as any).errors[c], c).toBeTruthy();
    }
  });

  it('every translation key referenced literally in source exists', () => {
    const root = path.resolve(__dirname, '../src');
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : /\.tsx?$/.test(x.name) && files.push(path.join(d, x.name))));
    walk(root);
    const missing: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const ns = src.match(/useTranslations\('(\w+)'\)/)?.[1] ?? src.match(/namespace: '(\w+)'/)?.[1];
      for (const m of src.matchAll(/\bt\('([\w.]+)'/g)) {
        const key = m[1];
        if (get(en, key) === undefined && !(ns && get(en, `${ns}.${key}`) !== undefined)) missing.push(`${path.basename(file)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
