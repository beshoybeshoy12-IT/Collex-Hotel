import { PrintShell } from '@/components/print-shell';

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <PrintShell>{children}</PrintShell>;
}
