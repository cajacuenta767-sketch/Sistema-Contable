'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Paginacion.
 *
 * Va dentro de <nav aria-label>: es navegacion, no decoracion. La pagina
 * actual se marca con aria-current="page" para que el lector de pantalla diga
 * donde esta parado.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) {
    return (
      <p className="px-4 py-3 text-xs text-[var(--text-muted)]">
        {total} {total === 1 ? 'registro' : 'registros'}
      </p>
    )
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <nav
      aria-label="Paginacion de resultados"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3"
    >
      <p className="text-xs text-[var(--text-muted)]">
        Mostrando <strong className="text-[var(--text-secondary)]">{from}-{to}</strong> de{' '}
        <strong className="text-[var(--text-secondary)]">{total}</strong>
      </p>

      <div className="flex items-center gap-1">
        <PageButton disabled={page <= 1} onClick={() => onChange(page - 1)} label="Pagina anterior">
          Anterior
        </PageButton>

        {buildPageList(page, totalPages).map((entry, index) =>
          entry === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-[var(--text-muted)]">
              &hellip;
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onChange(entry)}
              aria-current={entry === page ? 'page' : undefined}
              aria-label={`Ir a la pagina ${entry}`}
              className={cn(
                'h-9 min-w-9 rounded-lg px-2 text-sm font-medium transition-colors',
                entry === page
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]',
              )}
            >
              {entry}
            </button>
          ),
        )}

        <PageButton
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          label="Pagina siguiente"
        >
          Siguiente
        </PageButton>
      </div>
    </nav>
  )
}

function PageButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="h-9 rounded-lg px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  )
}

/**
 * Ventana de paginas con elipsis. Con 200 clientes y pageSize 25 son 8
 * paginas; con 5000 tareas serian 200 botones si no se acota.
 */
function buildPageList(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)

  const out: (number | 'gap')[] = []
  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push('gap')
    out.push(page)
    previous = page
  }
  return out
}
