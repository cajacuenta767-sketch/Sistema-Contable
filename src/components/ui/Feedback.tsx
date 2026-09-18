import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Los tres estados que toda vista de datos necesita y que casi siempre se
 * olvidan: cargando, vacio y con error. Que existan como componentes obliga a
 * pensarlos en cada pantalla.
 */

/** Placeholder de carga. aria-hidden: no hay nada que leer todavia. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-md bg-[var(--surface-2)]',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-black/5 after:to-transparent',
        className,
      )}
    />
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4" role="status" aria-live="polite">
      <span className="sr-only">Cargando datos</span>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn('h-5 flex-1', c === 0 && 'max-w-[38%]')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Estado vacio. Distingue "no hay nada todavia" de "tu busqueda no encontro
 * nada": son problemas distintos y la salida tambien (crear vs. limpiar
 * filtros).
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && (
        <div aria-hidden="true" className="mb-1 text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/** Error recuperable. role="alert" para que se anuncie al aparecer. */
export function ErrorState({
  title = 'No se pudieron cargar los datos',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-[var(--status-critical)]">{title}</p>
      {description && <p className="max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}
