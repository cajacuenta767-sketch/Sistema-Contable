import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { FilterBar, FilterSelect, SearchInput } from '@/components/features/FilterBar'
import { TablePagination } from '@/components/features/TablePagination'
import { NewClientButton } from '@/components/features/NewClientButton'
import { clientFiltersSchema } from '@/lib/validation'
import { Permissions } from '@/core/domain/services/permissions'
import { regimeLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Clientes' }
export const dynamic = 'force-dynamic'

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const raw = await searchParams
  // Los parametros de URL son entrada del usuario como cualquier otra: se
  // validan con el mismo esquema que usa la API.
  const parsed = clientFiltersSchema.safeParse(flatten(raw))
  const { page, pageSize, ...filters } = parsed.success
    ? parsed.data
    : { page: 1, pageSize: 25 }

  const result = await getContainer().clients.list(user, filters, { page, pageSize })
  const canCreate = Permissions.has(user.role, 'client:write')
  const hasFilters = Boolean(filters.search || filters.status || filters.taxRegime)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Clientes</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {result.total} {result.total === 1 ? 'cliente' : 'clientes'} en su alcance
          </p>
        </div>
        {canCreate && <NewClientButton />}
      </div>

      <Card as="div">
        <FilterBar>
          <SearchInput placeholder="Buscar por razon social o RUC..." />
          <FilterSelect
            name="status"
            label="Estado"
            options={[
              { value: 'ACTIVE', label: 'Activo' },
              { value: 'SUSPENDED', label: 'Suspendido' },
              { value: 'ARCHIVED', label: 'Archivado' },
            ]}
          />
          <FilterSelect
            name="taxRegime"
            label="Regimen"
            options={[
              { value: 'NRUS', label: 'NRUS' },
              { value: 'RER', label: 'RER' },
              { value: 'MYPE', label: 'MYPE Tributario' },
              { value: 'GENERAL', label: 'Regimen General' },
            ]}
          />
        </FilterBar>

        {result.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Sin resultados' : 'Aun no hay clientes'}
            description={
              hasFilters
                ? 'Ningun cliente coincide con los filtros aplicados. Pruebe ampliando la busqueda.'
                : 'Registre su primer cliente para empezar a generar tareas y controlar vencimientos.'
            }
            action={!hasFilters && canCreate ? <NewClientButton /> : undefined}
          />
        ) : (
          <>
            <DataTable
              caption="Listado de clientes del estudio"
              head={
                <tr>
                  <Th>Razon social</Th>
                  <Th>RUC</Th>
                  <Th>Regimen</Th>
                  <Th>Contador</Th>
                  <Th className="text-right">Tareas abiertas</Th>
                  <Th>Estado</Th>
                </tr>
              }
            >
              {result.items.map((client) => (
                <Tr key={client.id}>
                  <Td>
                    <Link
                      href={`/clientes/${client.id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {client.businessName}
                    </Link>
                  </Td>
                  <Td className="tabular-nums text-[var(--text-secondary)]">{client.ruc}</Td>
                  <Td className="text-[var(--text-secondary)]">{regimeLabel(client.taxRegime)}</Td>
                  <Td className="text-[var(--text-secondary)]">
                    {client.accountantName ?? (
                      <span className="text-[var(--text-muted)]">Sin asignar</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="tabular-nums">{client.openTasks}</span>
                      {client.overdueTasks > 0 && (
                        <Badge tone="critical" dot>
                          {client.overdueTasks} atrasada{client.overdueTasks === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </span>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        client.status === 'ACTIVE'
                          ? 'good'
                          : client.status === 'SUSPENDED'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {client.status === 'ACTIVE'
                        ? 'Activo'
                        : client.status === 'SUSPENDED'
                          ? 'Suspendido'
                          : 'Archivado'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
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

/** Next puede entregar un mismo parametro repetido; se toma el primero. */
function flatten(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const v = Array.isArray(value) ? value[0] : value
    if (v) out[key] = v
  }
  return out
}
