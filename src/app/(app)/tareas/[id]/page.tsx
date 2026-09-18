import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { isDomainError } from '@/core/domain/errors'
import { TaskStatusService } from '@/core/domain/services/task-status'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { PriorityBadge, TaskStateBadge } from '@/components/ui/Badge'
import { TaskActions } from '@/components/features/TaskActions'
import { CommentForm } from '@/components/features/CommentForm'
import { categoryLabel, formatDate, formatDateTime, periodLabel, relativeDueLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Detalle de tarea' }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  EN_REVISION: 'En revision',
  TERMINADA: 'Terminada',
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const container = getContainer()

  let task
  try {
    task = await container.tasks.getDetail(user, id)
  } catch (error) {
    // Una tarea fuera del alcance del usuario devuelve NotFound a proposito:
    // un 403 confirmaria que la tarea existe.
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const now = container.clock.now()
  const state = TaskStatusService.derive(task.status, task.dueDate, now)

  return (
    <div className="space-y-5">
      <nav aria-label="Ruta de navegacion" className="text-sm">
        <Link href="/tareas" className="text-[var(--accent)] hover:underline">
          Tareas
        </Link>
        <span aria-hidden="true" className="mx-2 text-[var(--text-muted)]">
          /
        </span>
        <span className="text-[var(--text-secondary)]">{task.title}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold">{task.title}</h1>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    <Link href={`/clientes/${task.clientId}`} className="text-[var(--accent)] hover:underline">
                      {task.clientName}
                    </Link>
                    <span className="mx-1.5 text-[var(--text-muted)]">·</span>
                    <span className="tabular-nums">{task.clientRuc}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <PriorityBadge priority={task.priority} />
                  <TaskStateBadge state={state} />
                </div>
              </div>

              {task.description && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                  {task.description}
                </p>
              )}

              <dl className="grid grid-cols-2 gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
                <Detail label="Tipo" value={categoryLabel(task.category)} />
                <Detail label="Periodo" value={periodLabel(task.period)} />
                <Detail
                  label="Vencimiento"
                  value={formatDate(task.dueDate)}
                  hint={state !== 'TERMINADA' ? relativeDueLabel(task.dueDate, now) : undefined}
                  hintTone={state === 'ATRASADA' ? 'critical' : 'muted'}
                />
                <Detail label="Responsable" value={task.assigneeName ?? 'Sin asignar'} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Comentarios" subtitle={`${task.comments.length} registrados`} />
            <CardBody className="space-y-4">
              <CommentForm taskId={task.id} />

              {task.comments.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                  Todavia no hay comentarios en esta tarea.
                </p>
              ) : (
                <ul className="space-y-3">
                  {task.comments.map((comment) => (
                    <li key={comment.id} className="rounded-lg bg-[var(--surface-2)] p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">
                          {comment.authorName ?? 'Usuario eliminado'}
                        </span>
                        <time
                          dateTime={comment.createdAt.toISOString()}
                          className="text-xs text-[var(--text-muted)]"
                        >
                          {formatDateTime(comment.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                        {comment.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Cambiar estado" headingLevel={2} />
            <CardBody>
              <TaskActions
                taskId={task.id}
                currentStatus={task.status}
                allowedTransitions={[...task.allowedTransitions]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Historial" subtitle="Bitacora de cambios de estado" />
            <CardBody>
              <ol className="space-y-4">
                {task.history.length === 0 && (
                  <li className="text-sm text-[var(--text-muted)]">
                    Sin cambios de estado desde su creacion.
                  </li>
                )}
                {task.history.map((entry) => (
                  <li key={entry.id} className="relative pl-5">
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 size-2 rounded-full bg-[var(--accent)]"
                    />
                    <p className="text-sm text-[var(--text-primary)]">
                      {entry.from
                        ? `${STATUS_LABEL[entry.from] ?? entry.from} → ${STATUS_LABEL[entry.to] ?? entry.to}`
                        : STATUS_LABEL[entry.to] ?? entry.to}
                    </p>
                    {entry.note && (
                      <p className="mt-0.5 text-xs italic text-[var(--text-secondary)]">{entry.note}</p>
                    )}
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {entry.userName ?? 'Sistema'} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}

                {/* Hito de creacion: se compone desde la tarea, no desde la
                    bitacora, para que las tareas generadas por el job mensual
                    muestren exactamente el mismo historial que las manuales. */}
                <li className="relative pl-5">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 size-2 rounded-full bg-[var(--border-strong)]"
                  />
                  <p className="text-sm text-[var(--text-primary)]">
                    {task.templateId ? 'Generada automaticamente' : 'Creada manualmente'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {task.createdByName ?? 'Sistema'} · {formatDateTime(task.createdAt)}
                  </p>
                </li>
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Detail({
  label,
  value,
  hint,
  hintTone = 'muted',
}: {
  label: string
  value: string
  hint?: string
  hintTone?: 'muted' | 'critical'
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 text-sm text-[var(--text-primary)]">
        {value}
        {hint && (
          <span
            className={
              hintTone === 'critical'
                ? 'mt-0.5 block text-xs font-medium text-[var(--status-critical)]'
                : 'mt-0.5 block text-xs text-[var(--text-muted)]'
            }
          >
            {hint}
          </span>
        )}
      </dd>
    </div>
  )
}
