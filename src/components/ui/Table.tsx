import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Tabla de datos.
 *
 * `caption` es obligatorio: es lo que un lector de pantalla anuncia al entrar
 * en la tabla. En pantallas chicas la tabla se desplaza horizontalmente dentro
 * de un contenedor con `tabindex=0`, para que tambien se pueda recorrer con
 * teclado y no solo arrastrando con el dedo.
 */
export function DataTable({
  caption,
  head,
  children,
  className,
}: {
  caption: string
  head: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className="w-full overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className={cn('w-full min-w-[640px] border-collapse text-sm', className)}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-[var(--surface-2)] text-left">{head}</thead>
        <tbody className="divide-y divide-[var(--border)]">{children}</tbody>
      </table>
    </div>
  )
}

export function Th({
  children,
  className,
  scope = 'col',
  sortDirection,
}: {
  children: ReactNode
  className?: string
  scope?: 'col' | 'row'
  /** Se refleja en aria-sort para anunciar el orden activo. */
  sortDirection?: 'asc' | 'desc'
}) {
  return (
    <th
      scope={scope}
      aria-sort={
        sortDirection ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined
      }
      className={cn(
        'px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle text-[var(--text-primary)]', className)}>{children}</td>
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('transition-colors hover:bg-[var(--surface-2)]', className)}>{children}</tr>
}
