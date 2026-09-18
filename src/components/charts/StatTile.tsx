import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Indicador numerico de cabecera.
 *
 * Cuando el dato es UN numero, un numero grande comunica mejor que cualquier
 * grafico: no hay nada que comparar, asi que no hay nada que graficar.
 *
 * El acento de color es una barra lateral, no el color del numero: el texto
 * siempre usa tokens de texto para conservar el contraste.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: number | string
  hint?: string
  tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'info'
  icon?: ReactNode
}) {
  const accent = {
    neutral: 'var(--border-strong)',
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
    info: 'var(--accent)',
  }[tone]

  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-sm)]">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {label}
          </p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums text-[var(--text-primary)]')}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{hint}</p>}
        </div>
        {icon && (
          <span aria-hidden="true" className="shrink-0 text-[var(--text-muted)]">
            {icon}
          </span>
        )}
      </div>
    </div>
  )
}
