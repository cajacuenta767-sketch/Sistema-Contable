import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { reportRangeSchema } from '@/lib/validation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { StatTile } from '@/components/charts/StatTile'
import { EmptyState } from '@/components/ui/Feedback'
import { cn } from '@/lib/cn'
import { formatDate, roleLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Reportes' }
export const dynamic = 'force-dynamic'

const RANGES = [
  { value: 'daily', label: 'Hoy' },
  { value: 'weekly', label: 'Ultimos 7 dias' },
  { value: 'monthly', label: 'Este mes' },
] as const

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const raw = await searchParams
  const parsed = reportRangeSchema.safeParse(raw)
  const range = parsed.success ? parsed.data.range : 'daily'

  const report = await getContainer().dashboard.getProductivityReport(user, range)
  const maxTrend = Math.max(1, ...report.trend.map((t) => t.count))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Reportes de productividad</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {formatDate(report.from)} al {formatDate(report.to)}
        </p>
      </div>

      {/* Selector de rango como enlaces: el reporte queda en la URL y se puede
          compartir o imprimir tal cual. */}
      <nav aria-label="Rango del reporte" className="flex flex-wrap gap-2">
        {RANGES.map((option) => (
          <Link
            key={option.value}
            href={`/reportes?range=${option.value}`}
            aria-current={range === option.value ? 'page' : undefined}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              range === option.value
                ? 'border-transparent bg-[var(--brand)] text-white'
                : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]',
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Asignadas" value={report.totals.assigned} />
        <StatTile label="Terminadas" value={report.totals.completed} tone="good" />
        <StatTile
          label="Atrasadas"
          value={report.totals.overdue}
          tone={report.totals.overdue > 0 ? 'critical' : 'neutral'}
        />
        <StatTile label="Cumplimiento" value={`${report.totals.progressPct}%`} tone="info" />
      </div>

      <Card as="div">
        {/* Una sola serie, asi que no lleva leyenda: el titulo ya la nombra. */}
        <CardHeader title="Tareas cerradas por dia" />
        <CardBody>
          {report.trend.length === 0 ? (
            <EmptyState
              title="Sin cierres en el periodo"
              description="No se termino ninguna tarea en el rango seleccionado."
            />
          ) : report.trend.length === 1 ? (
            /* Un unico dato no es un grafico: una barra sola no se compara con
               nada y, estirada al ancho de la tarjeta, parece un error de
               maquetacion. Se muestra como numero. */
            <div className="py-6 text-center">
              <p className="text-4xl font-semibold tabular-nums text-[var(--text-primary)]">
                {report.trend[0]?.count ?? 0}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                tareas cerradas el {formatDate(report.trend[0]?.date ?? report.to)}
              </p>
            </div>
          ) : (
            <>
              {/* Barras verticales simples. Cada barra lleva su valor encima:
                  con pocos dias, etiquetar directo es mas legible que un eje. */}
              {/* Las barras se topan en 56px: con pocos dias, estirarlas al
                  ancho completo exagera visualmente la diferencia. */}
              <ol className="flex h-40 items-end justify-start gap-3" aria-hidden="true">
                {report.trend.map((point) => (
                  <li
                    key={point.date}
                    className="flex w-full max-w-14 flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span className="text-xs tabular-nums text-[var(--text-secondary)]">{point.count}</span>
                    <div
                      className="w-full rounded-t-[4px] bg-[var(--accent)]"
                      style={{ height: `${(point.count / maxTrend) * 100}%`, minHeight: 3 }}
                    />
                    <span className="text-[10px] text-[var(--text-muted)]">{point.date.slice(8)}</span>
                  </li>
                ))}
              </ol>

              {/* Equivalente accesible del grafico. */}
              <table className="sr-only">
                <caption>Tareas cerradas por dia</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Tareas cerradas</th>
                  </tr>
                </thead>
                <tbody>
                  {report.trend.map((point) => (
                    <tr key={point.date}>
                      <th scope="row">{point.date}</th>
                      <td>{point.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </CardBody>
      </Card>

      <Card as="div">
        <CardHeader title="Detalle por trabajador" />
        {report.rows.length === 0 ? (
          <EmptyState title="Sin datos" description="No hay actividad registrada en el periodo." />
        ) : (
          <DataTable
            caption="Productividad por trabajador en el periodo seleccionado"
            head={
              <tr>
                <Th>Trabajador</Th>
                <Th>Rol</Th>
                <Th className="text-right">Asignadas</Th>
                <Th className="text-right">Terminadas</Th>
                <Th className="text-right">Atrasadas</Th>
                <Th className="text-right">Cumplimiento</Th>
              </tr>
            }
          >
            {report.rows.map((row) => (
              <Tr key={row.userId}>
                <Td className="font-medium">{row.fullName}</Td>
                <Td className="text-[var(--text-secondary)]">{roleLabel(row.role)}</Td>
                <Td className="text-right tabular-nums">{row.assigned}</Td>
                <Td className="text-right tabular-nums">{row.completed}</Td>
                <Td className="text-right tabular-nums">{row.overdue}</Td>
                {/* Sin tareas asignadas no hay cumplimiento que medir: un 100%
                    ahi compara a quien no tuvo carga con quien cerro todo. */}
                <Td className="text-right font-semibold tabular-nums">
                  {row.assigned === 0 ? (
                    <span className="font-normal text-[var(--text-muted)]">Sin carga</span>
                  ) : (
                    `${row.progressPct}%`
                  )}
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  )
}
