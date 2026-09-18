import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag
      suppressHydrationWarning
      className={cn(
        'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-sm)]',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  /** Nivel semantico del encabezado. Los titulos deben anidar sin saltos. */
  headingLevel = 2,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  headingLevel?: 2 | 3 | 4
}) {
  const Heading = `h${headingLevel}` as const
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <Heading className="text-sm font-semibold text-[var(--text-primary)]">{title}</Heading>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div suppressHydrationWarning className={cn('p-4 sm:p-5', className)}>{children}</div>
}
