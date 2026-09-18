import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatTile } from '@/components/charts/StatTile'
import { StatusDonut } from '@/components/charts/StatusDonut'
import { ProgressBar } from '@/components/charts/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { formatDate, relativeDueLabel, roleLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Inicio' }
export const dynamic = 'force-dynamic'

/**
 * Dashboard.
 *
 * Es un Server Component y llama al caso de uso DIRECTAMENTE, sin pasar por
 * fetch a su propia API. Hacer que el servidor se llame a si mismo por HTTP
 * agrega un viaje de red, una serializacion y una deserializacion para no
 * ganar nada. La API REST existe para el cliente y para integraciones, no para
 * el renderizado del servidor.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const data = await getContainer().dashboard.getOverview(user)
  const { metrics } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">
          Hola, {user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {data.scope === 'all'
            ? 'Resumen general del estudio'
            : 'Resumen de su cartera y tareas asignadas'}
        </p>
      </div>

      {/* KPIs. Un numero solo no necesita grafico: necesita ser grande. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Clientes" value={metrics.clients} tone="info" />
        <StatTile label="Tareas totales" value={metrics.totalTasks} tone="neutral" />
        <StatTile
          label="Terminadas"
          value={metrics.completedTasks}
          tone="good"
          hint={
            metrics.totalTasks > 0
              ? `${Math.round((metrics.completedTasks / metrics.totalTasks) * 100)}% del total`
              : undefined
          }
        />
        <StatTile
          label="Atrasadas"
          value={metrics.overdueTasks}
          tone={metrics.overdueTasks > 0 ? 'critical' : 'neutral'}
          hint={metrics.overdueTasks > 0 ? 'Requieren atencion inmediata' : 'Sin atrasos'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Tareas por estado" subtitle="Distribucion actual" />
          <CardBody>
            <StatusDonut slices={data.statusBreakdown} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Avance del personal"
            subtitle="Tareas cerradas hoy sobre las asignadas"
            action={
              <Link href="/reportes" className="text-xs font-medium text-[var(--accent)] hover:underline">
                Ver reporte completo
              </Link>
            }
          />
          <CardBody className="space-y-4">
            {data.staff.length === 0 ? (
              <EmptyState
                title="Sin datos de personal"
                description={
                  data.scope === 'own'
                    ? 'Solo un supervisor o administrador ve el avance de todo el equipo.'
                    : 'Registre trabajadores para ver su avance diario aqui.'
                }
              />
            ) : (
              data.staff.map((person) => (
                <div key={person.userId} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                      {person.fullName}
                      <span className="text-xs font-normal text-[var(--text-muted)]">
                        {roleLabel(person.role)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {/* El nivel de carga se dice con TEXTO, no con el color de
                          la barra: el color no puede ser el unico portador. */}
                      {person.overdue > 0 && (
                        <Badge tone="critical" dot>
                          {person.overdue} atrasada{person.overdue === 1 ? '' : 's'}
                        </Badge>
                      )}
                      {person.overdue === 0 && person.level === 'alto' && (
                        <Badge tone="warning">Carga alta</Badge>
                      )}
                      {/* Un 100% sobre cero tareas asignadas seria enganioso:
                          se dice explicitamente que no tiene carga. */}
                      <span className="tabular-nums text-sm font-semibold text-[var(--text-primary)]">
                        {person.assigned === 0 ? 'Sin carga' : `${person.progressPct}%`}
                      </span>
                    </span>
                  </div>
                  <ProgressBar
                    value={person.assigned === 0 ? 0 : person.progressPct}
                    label={`Avance de ${person.fullName}: ${person.progressPct} por ciento, ${person.completed} de ${person.assigned} tareas`}
                  />
                  <p className="text-xs text-[var(--text-muted)]">
                    {person.assigned === 0
                      ? 'Sin tareas asignadas en el periodo'
                      : `${person.completed} de ${person.assigned} tareas`}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Proximos vencimientos"
          subtitle="Tareas abiertas que vencen en los proximos 7 dias"
          action={
            <Link href="/tareas" className="text-xs font-medium text-[var(--accent)] hover:underline">
              Ver todas
            </Link>
          }
        />
        {data.upcoming.length === 0 ? (
          <EmptyState
            title="Nada vence esta semana"
            description="No hay tareas abiertas con vencimiento en los proximos 7 dias."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {data.upcoming.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tareas/${task.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)] sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                      {task.title}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-secondary)]">
                      {task.clientName}
                      {task.assigneeName && ` · ${task.assigneeName}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Badge tone={task.daysRemaining <= 2 ? 'critical' : task.daysRemaining <= 4 ? 'warning' : 'neutral'}>
                      {relativeDueLabel(task.dueDate)}
                    </Badge>
                    <time dateTime={task.dueDate} className="hidden text-xs text-[var(--text-muted)] sm:block">
                      {formatDate(task.dueDate)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
