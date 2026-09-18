import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { isDomainError } from '@/core/domain/errors'
import { TaskStatusService } from '@/core/domain/services/task-status'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge, TaskStateBadge } from '@/components/ui/Badge'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/Feedback'
import { formatDate, formatMoney, periodLabel, regimeLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Detalle de cliente' }
export const dynamic = 'force-dynamic'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const container = getContainer()

  let client
  try {
    client = await container.clients.getById(user, id)
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  // Las ultimas tareas del cliente. Paginado en servidor como todo lo demas:
  // un cliente con tres anios de historia tiene cientos de tareas.
  const tasks = await container.tasks.list(user, { clientId: id }, { page: 1, pageSize: 15 })
  const now = container.clock.now()

  return (
    <div className="space-y-5">
      <nav aria-label="Ruta de navegacion" className="text-sm">
        <Link href="/clientes" className="text-[var(--accent)] hover:underline">
          Clientes
        </Link>
        <span aria-hidden="true" className="mx-2 text-[var(--text-muted)]">
          /
        </span>
        <span className="text-[var(--text-secondary)]">{client.businessName}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{client.businessName}</h1>
          <p className="mt-1 text-sm tabular-nums text-[var(--text-secondary)]">
            RUC {client.ruc}
            {client.tradeName && <span className="ml-2 not-italic">· {client.tradeName}</span>}
          </p>
        </div>
        <Badge tone={client.status === 'ACTIVE' ? 'good' : client.status === 'SUSPENDED' ? 'warning' : 'neutral'}>
          {client.status === 'ACTIVE' ? 'Activo' : client.status === 'SUSPENDED' ? 'Suspendido' : 'Archivado'}
        </Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Datos del cliente" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Row label="Regimen tributario" value={regimeLabel(client.taxRegime)} />
              <Row label="Ultimo digito RUC" value={String(client.rucLastDigit)} hint="Define el cronograma SUNAT" />
              <Row label="Contador asignado" value={client.accountantName ?? 'Sin asignar'} />
              <Row label="Honorario mensual" value={formatMoney(client.monthlyFee)} />
              <Row
                label="Inicio del servicio"
                value={client.serviceStart ? formatDate(client.serviceStart) : '-'}
              />
              <Row label="Contacto" value={client.contactName ?? '-'} />
              <Row label="Telefono" value={client.contactPhone ?? '-'} />
              <Row label="Correo" value={client.contactEmail ?? '-'} />
            </dl>

            {client.notes && (
              <div className="mt-4 rounded-lg bg-[var(--surface-2)] p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Observaciones
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                  {client.notes}
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Tareas del cliente"
            subtitle="Ultimas 15, ordenadas por vencimiento"
            action={
              <Link
                href={`/tareas?clientId=${client.id}`}
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Ver todas
              </Link>
            }
          />
          {tasks.items.length === 0 ? (
            <EmptyState
              title="Sin tareas registradas"
              description="Las tareas periodicas de este cliente se crearan en la proxima generacion mensual."
            />
          ) : (
            <DataTable
              caption={`Tareas de ${client.businessName}`}
              head={
                <tr>
                  <Th>Tarea</Th>
                  <Th>Periodo</Th>
                  <Th>Vencimiento</Th>
                  <Th>Estado</Th>
                </tr>
              }
            >
              {tasks.items.map((task) => (
                <Tr key={task.id}>
                  <Td>
                    <Link href={`/tareas/${task.id}`} className="font-medium text-[var(--accent)] hover:underline">
                      {task.title}
                    </Link>
                  </Td>
                  <Td className="text-[var(--text-secondary)]">{periodLabel(task.period)}</Td>
                  <Td className="tabular-nums text-[var(--text-secondary)]">{formatDate(task.dueDate)}</Td>
                  <Td>
                    <TaskStateBadge state={TaskStatusService.derive(task.status, task.dueDate, now)} />
                  </Td>
                </Tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--text-primary)]">
        {value}
        {hint && <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">{hint}</span>}
      </dd>
    </div>
  )
}
