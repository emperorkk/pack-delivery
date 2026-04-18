import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  variant = 'primary',
  loading,
  children,
  className = '',
  disabled,
  ...rest
}: { variant?: Variant; loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'pd-press inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 font-medium text-center disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<Variant, string> = {
    primary: 'pd-accent-gradient text-accent-fg',
    secondary: 'bg-surface-2 text-fg border border-border hover:bg-[color-mix(in_srgb,var(--surface-2)_90%,var(--fg)_10%)]',
    danger:
      'bg-danger text-white shadow-[0_8px_18px_-8px_color-mix(in_srgb,var(--danger)_70%,transparent),0_2px_6px_-1px_color-mix(in_srgb,#000_30%,transparent)]',
    ghost: 'bg-transparent text-fg border border-border hover:bg-surface-2'
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="pd-spinner" aria-label="loading" /> : children}
    </button>
  );
}

export function TextInput({
  label,
  hint,
  error,
  ...rest
}: { label?: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-sm text-muted">{label}</span>}
      <input
        className="rounded-2xl border border-border bg-surface-2 px-3 py-3 text-fg placeholder:text-muted transition focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_30%,transparent)]"
        {...rest}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  error,
  ...rest
}: { label?: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-sm text-muted">{label}</span>}
      <textarea
        className="rounded-2xl border border-border bg-surface-2 px-3 py-3 text-fg placeholder:text-muted transition focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_30%,transparent)] min-h-[96px]"
        {...rest}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`pd-card pd-elevate pd-rise rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Banner({
  kind,
  children
}: {
  kind: 'error' | 'warn' | 'success' | 'info';
  children: ReactNode;
}) {
  const colors: Record<typeof kind, string> = {
    error: 'bg-danger text-white border-l-4 border-white/60',
    warn: 'bg-warn text-black border-l-4 border-black/30',
    success: 'bg-success text-black border-l-4 border-black/30',
    info: 'bg-surface-2 text-fg border border-border border-l-4 border-l-accent'
  };
  return <div className={`rounded-2xl px-3 py-2 text-sm pd-elevate ${colors[kind]}`}>{children}</div>;
}

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="pd-glass sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <h1 className="pd-title text-lg font-semibold tracking-tight">{title}</h1>
      {right}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-6">
      <span className="pd-spinner" aria-label="loading" />
    </div>
  );
}
