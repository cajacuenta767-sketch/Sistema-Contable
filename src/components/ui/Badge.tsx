import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { DerivedTaskState, TaskPriority } from '@/core/domain/types'

/**
 * Etiquetas de estado.
 *
 * Regla: el color NUNCA es el unico portador del significado. Cada badge lleva
 * siempre su texto, y los estados criticos ademas un punto/simbolo. Un usuario
 * con daltonismo, una impresion en blanco y negro o el modo de alto contraste
 * de Windows tienen que poder leer el estado igual.
 */

type Tone = 'neutral' | 'good' | 'warning' | 'serious' | 'critical' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border-strong)]',
  good: 'bg-[color-mix(in_srgb,var(--status-good)_14%,transparent)] text-[var(--status-good)] border-[color-mix(in_srgb,var(--status-good)_40%,transparent)]',
  warning:
    'bg-[color-mix(in_srgb,var(--status-warning)_18%,transparent)] text-[color-mix(in_srgb,var(--status-warning)_75%,var(--text-primary))] border-[color-mix(in_srgb,var(--status-warning)_45%,transparent)]',
  serious:
    'bg-[color-mix(in_srgb,var(--status-serious)_16%,transparent)] text-[color-mix(in_srgb,var(--status-serious)_80%,var(--text-primary))] border-[color-mix(in_srgb,var(--status-serious)_45%,transparent)]',
  critical:
    'bg-[color-mix(in_srgb,var(--status-critical)_14%,transparent)] text-[var(--status-critical)] border-[color-mix(in_srgb,var(--status-critical)_40%,transparent)]',
  info: 'bg-[var(--brand-soft)] text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]',
}

export function Badge({
  tone = 'neutral',
  children,
  dot,
  className,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const TASK_STATE: Record<DerivedTaskState, { label: string; tone: Tone; dot: boolean }> = {
  PENDIENTE: { label: 'Pendiente', tone: 'warning', dot: false },
  EN_PROCESO: { label: 'En proceso', tone: 'info', dot: false },
  EN_REVISION: { label: 'En revision', tone: 'serious', dot: false },
  TERMINADA: { label: 'Terminada', tone: 'good', dot: false },
  ATRASADA: { label: 'Atrasada', tone: 'critical', dot: true },
}

export function TaskStateBadge({ state }: { state: DerivedTaskState }) {
  const config = TASK_STATE[state]
  return (
    <Badge tone={config.tone} dot={config.dot}>
      {config.label}
    </Badge>
  )
}

const PRIORITY: Record<TaskPriority, { label: string; tone: Tone }> = {
  BAJA: { label: 'Baja', tone: 'neutral' },
  MEDIA: { label: 'Media', tone: 'info' },
  ALTA: { label: 'Alta', tone: 'serious' },
  URGENTE: { label: 'Urgente', tone: 'critical' },
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const config = PRIORITY[priority]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
