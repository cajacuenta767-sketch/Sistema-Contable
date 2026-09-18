import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { Card } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { PriorityBadge, TaskStateBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { FilterBar, FilterSelect, SearchInput } from '@/components/features/FilterBar'
import { TablePagination } from '@/components/features/TablePagination'
import { TaskStatusService } from '@/core/domain/services/task-status'
import { taskFiltersSchema } from '@/lib/validation'
import { categoryLabel, formatDate, periodLabel, relativeDueLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Tareas' }
export const dynamic = 'force-dynamic'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const raw = await searchParams
  const parsed = taskFiltersSchema.safeParse(flatten(raw))
  const { page, pageSize, sort, ...filters } = parsed.success
    ? parsed.data
    : { page: 1, pageSize: 25, sort: 'dueDate' as const }

  const container = getContainer()
  const result = await container.tasks.list(user, filters, { page, pageSize }, sort)
  const now = container.clock.now()
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Tareas</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {result.total} {result.total === 1 ? 'tarea' : 'tareas'}
          {filters.overdueOnly && ' atrasadas'}
        </p>
      </div>

      <Card as="div">
        <FilterBar>
          <SearchInput placeholder="Buscar por tarea, cliente o RUC..." />
          <FilterSelect
            name="status"
            label="Estado"
            options={[
              { value: 'PENDIENTE', label: 'Pendiente' },
              { value: 'EN_PROCESO', label: 'En proceso' },
              { value: 'EN_REVISION', label: 'En revision' },
              { value: 'TERMINADA', label: 'Terminada' },
            ]}
          />
          <FilterSelect
            name="category"
            label="Tipo"
            options={[
              { value: 'DECLARACION', label: 'Declaracion' },
              { value: 'LIBRO', label: 'Libros' },
              { value: 'PLANILLA', label: 'Planillas' },
              { value: 'TRAMITE', label: 'Tramite' },
              { value: 'REPORTE', label: 'Reporte' },
              { value: 'OTRO', label: 'Otro' },
            ]}
          />
          <FilterSelect
            name="overdueOnly"
            label="Atraso"
            allLabel="Todas"
            options={[{ value: 'true', label: 'Solo atrasadas' }]}
          />
          <FilterSelect
            name="sort"
            label="Ordenar por"
            allLabel="Vencimiento"
            options={[
              { value: 'priority', label: 'Prioridad' },
              { value: 'createdAt', label: 'Mas recientes' },
            ]}
          />
        </FilterBar>

        {result.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Sin resultados' : 'No hay tareas registradas'}
            description={
              hasFilters
                ? 'Ninguna tarea coincide con los filtros aplicados.'
                : 'Las tareas periodicas se generan automaticamente cada mes a partir de las plantillas configuradas.'
            }
          />
        ) : (
          <>
            <DataTable
              caption="Listado de tareas"
              head={
                <tr>
                  <Th>Tarea</Th>
                  <Th>Cliente</Th>
                  <Th>Periodo</Th>
                  <Th>Responsable</Th>
                  <Th>Vencimiento</Th>
                  <Th>Prioridad</Th>
                  <Th>Estado</Th>
                </tr>
              }
            >
              {result.items.map((task) => {
                // El estado mostrado se deriva del reloj: "ATRASADA" no existe
                // en la base, es status abierto + fecha pasada.
                const state = TaskStatusService.derive(task.status, task.dueDate, now)
                return (
                  <Tr key={task.id}>
                    <Td>
                      <Link
                        href={`/tareas/${task.id}`}
                        className="font-medium text-[var(--accent)] hover:underline"
                      >
                        {task.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        {categoryLabel(task.category)}
                      </span>
                    </Td>
                    <Td className="text-[var(--text-secondary)]">
                      <span className="block max-w-[200px] truncate">{task.clientName}</span>
                      <span className="block text-xs tabular-nums text-[var(--text-muted)]">
                        {task.clientRuc}
                      </span>
                    </Td>
                    <Td className="text-[var(--text-secondary)]">{periodLabel(task.period)}</Td>
                    <Td className="text-[var(--text-secondary)]">
                      {task.assigneeName ?? <span className="text-[var(--text-muted)]">Sin asignar</span>}
                    </Td>
                    <Td>
                      <time dateTime={task.dueDate.toISOString()} className="block tabular-nums">
                        {formatDate(task.dueDate)}
                      </time>
                      {state !== 'TERMINADA' && (
                        <span
                          className={
                            state === 'ATRASADA'
                              ? 'block text-xs font-medium text-[var(--status-critical)]'
                              : 'block text-xs text-[var(--text-muted)]'
                          }
                        >
                          {relativeDueLabel(task.dueDate, now)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <PriorityBadge priority={task.priority} />
                    </Td>
                    <Td>
                      <TaskStateBadge state={state} />
                    </Td>
                  </Tr>
                )
              })}
            </DataTable>

            <TablePagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </>
        )}
      </Card>
    </div>
  )
}

function flatten(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value
    if (v) out[key] = v
  }
  return out
}
