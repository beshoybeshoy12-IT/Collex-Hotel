'use client';

import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

// ---------------------------------------------------------------- Buttons & inputs

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:opacity-50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: 'sm' | 'md'; icon?: LucideIcon }>(
  function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, icon: Icon, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed',
          size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
          variants[variant],
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);

const fieldBase =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-100 aria-[invalid=true]:border-red-600';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(fieldBase, className)} {...rest} />;
});

/** Input for left-to-right identifiers (emails, phone numbers, document numbers) inside RTL forms. */
export const LtrInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function LtrInput({ className, ...rest }, ref) {
  return <input ref={ref} dir="ltr" className={clsx(fieldBase, 'text-start rtl:text-end', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(fieldBase, 'pe-8', className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(fieldBase, 'min-h-[80px]', className)} {...rest} />;
});

export function Field({ label, error, hint, children, required, htmlFor, className }: { label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; required?: boolean; htmlFor?: string; className?: string }) {
  const t = useTranslations('common');
  return (
    <div className={clsx('space-y-1', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-red-700" aria-label={t('required')}>
            {' '}*
          </span>
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-700" role="alert">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...rest} />
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- Layout

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, icon: Icon, hint }: { label: ReactNode; value: ReactNode; icon?: LucideIcon; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{label}</span>
        {Icon && <Icon className="h-5 w-5 text-brand-600" aria-hidden />}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Isolates left-to-right identifiers inside RTL text (Unicode bidi isolation). */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={clsx('font-mono tabular-nums', className)}>
      {children}
    </bdi>
  );
}

// ---------------------------------------------------------------- Status badges (icon + text, never colour alone)

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'progress';
const toneStyle: Record<Tone, { cls: string; icon: LucideIcon }> = {
  success: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', icon: CheckCircle2 },
  warning: { cls: 'bg-amber-50 text-amber-900 ring-amber-600/30', icon: AlertTriangle },
  danger: { cls: 'bg-red-50 text-red-800 ring-red-600/20', icon: XCircle },
  info: { cls: 'bg-sky-50 text-sky-800 ring-sky-600/20', icon: Info },
  progress: { cls: 'bg-violet-50 text-violet-800 ring-violet-600/20', icon: Clock },
  neutral: { cls: 'bg-slate-100 text-slate-700 ring-slate-500/20', icon: Circle },
};

const STATUS_TONE: Record<string, Tone> = {
  CONFIRMED: 'success', CHECKED_IN: 'info', CHECKED_OUT: 'neutral', CANCELLED: 'danger', NO_SHOW: 'danger', EXPIRED: 'neutral', PENDING: 'warning', AWAITING_PAYMENT: 'warning', INQUIRY: 'neutral',
  DIRTY: 'danger', CLEANING: 'progress', CLEAN: 'info', AWAITING_INSPECTION: 'warning', INSPECTED: 'success',
  OPERATIONAL: 'success', MAINTENANCE_REQUESTED: 'warning', UNDER_MAINTENANCE: 'progress', OUT_OF_ORDER: 'danger', OUT_OF_SERVICE: 'danger',
  OCCUPIED: 'info', VACANT: 'neutral', IN_HOUSE: 'info', ARRIVING_TODAY: 'warning', ASSIGNED_FUTURE: 'neutral', UNASSIGNED: 'neutral',
  VERIFIED: 'success', SATISFIED: 'success', REJECTED: 'danger', MISSING: 'danger', AWAITING_REVIEW: 'warning', UPLOADED: 'warning', REUPLOAD_REQUESTED: 'warning', NOT_REQUIRED: 'neutral', REQUIRED: 'warning', AWAITING_UPLOAD: 'warning',
  IN_PROGRESS: 'progress', DONE: 'info', OPEN: 'warning', ASSIGNED: 'info', ON_HOLD: 'neutral', RESOLVED: 'info', CLOSED: 'neutral', COMPLETED: 'success',
  SUCCEEDED: 'success', FAILED: 'danger', REFUNDED: 'neutral', PARTIALLY_REFUNDED: 'info', DISPUTED: 'danger',
  SENT: 'success', LOGGED: 'info', QUEUED: 'neutral', SENDING: 'progress', STORED: 'info', RETURNED: 'success', DISPOSED: 'neutral',
  PLANNED: 'neutral', ACTIVE: 'info', MOVED: 'neutral',
};

export function Badge({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: LucideIcon | null }) {
  const s = toneStyle[tone];
  const Icon = icon === null ? null : icon ?? s.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', s.cls)}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

type StatusGroup = 'reservation' | 'housekeeping' | 'maintenance' | 'occupancy' | 'assignment' | 'document' | 'requirement' | 'task' | 'workOrder' | 'service' | 'payment' | 'notification' | 'lostFound' | 'folio';

export function StatusBadge({ group, value }: { group: StatusGroup; value: string }) {
  const t = useTranslations('status');
  const key = `${group}.${value}` as any;
  return <Badge tone={STATUS_TONE[value] ?? 'neutral'}>{t.has(key) ? t(key) : value}</Badge>;
}

// ---------------------------------------------------------------- Feedback

export function Spinner({ label }: { label?: string }) {
  const t = useTranslations('common');
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-600" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label ?? t('loading')}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title?: ReactNode; body?: ReactNode; action?: ReactNode }) {
  const t = useTranslations('common');
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
      <Info className="h-6 w-6 text-slate-400" aria-hidden />
      <p className="font-medium text-slate-800">{title ?? t('emptyTitle')}</p>
      <p className="text-sm text-slate-500">{body ?? t('emptyBody')}</p>
      {action}
    </div>
  );
}

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  const s = toneStyle[tone];
  const Icon = s.icon;
  return (
    <div className={clsx('flex gap-3 rounded-lg p-3 text-sm ring-1 ring-inset', s.cls)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Dialog

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose(): void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useTranslations('common');
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={clsx('w-[calc(100%-2rem)] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/50', wide ? 'max-w-4xl' : 'max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t('close')}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Button that asks for confirmation before destructive or financially significant actions. */
export function ConfirmButton({ children, message, onConfirm, variant = 'danger', size, loading, icon }: { children: ReactNode; message: ReactNode; onConfirm(): void | Promise<void>; variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: LucideIcon }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('common');
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} loading={loading} icon={icon}>
        {children}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={children}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant={variant}
              onClick={async () => {
                setOpen(false);
                await onConfirm();
              }}
            >
              {t('confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">{message}</p>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- Tabs

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange(v: T): void }) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
            value === tab.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900',
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ms-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-700">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Table

export function Table({ head, children, caption }: { head: ReactNode[]; children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 text-start font-semibold text-slate-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={clsx('px-3 py-2 align-top text-slate-800', className)}>{children}</td>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage(p: number): void }) {
  const t = useTranslations('common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="mt-3 flex items-center justify-between text-sm text-slate-600" aria-label="pagination">
      <span>{t('page', { page, pages })}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t('previous')}
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t('next')}
        </Button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------- Toasts

interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}
const ToastContext = createContext<(tone: Tone, text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: Tone, text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-50 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="pointer-events-auto shadow-lg">
            <Alert tone={i.tone}>{i.text}</Alert>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
