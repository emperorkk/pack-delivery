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
  const base = 'rounded-xl px-4 py-3 font-medium text-center transition active:opacity-80 disabled:opacity-50';
  const variants: Record<Variant, string> = {
    primary: 'bg-accent text-accent-fg',
    secondary: 'bg-surface-2 text-fg border border-border',
    danger: 'bg-danger text-white',
    ghost: 'bg-transparent text-fg border border-border'
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? '…' : children}
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
        className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-fg placeholder:text-muted"
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
        className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-fg placeholder:text-muted min-h-[96px]"
        {...rest}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface-2 p-4 ${className}`}>{children}</div>;
}

export function Banner({
  kind,
  children
}: {
  kind: 'error' | 'warn' | 'success' | 'info';
  children: ReactNode;
}) {
  const colors: Record<typeof kind, string> = {
    error: 'bg-danger text-white',
    warn: 'bg-warn text-black',
    success: 'bg-success text-black',
    info: 'bg-surface-2 text-fg border border-border'
  };
  return <div className={`rounded-xl px-3 py-2 text-sm ${colors[kind]}`}>{children}</div>;
}

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface px-4 py-3 border-b border-border">
      <h1 className="text-lg font-semibold">{title}</h1>
      {right}
    </div>
  );
}

export function Spinner() {
  return <div className="text-muted">…</div>;
}
