import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/charts/ProgressBar'
import { EmptyState } from '@/components/ui/Feedback'
import { roleLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Personal' }
export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const container = getContainer()
  // getProductivityReport ya verifica el permiso y recorta las filas al alcance
  // del usuario. No se repite el chequeo aqui para no tener dos reglas.
  const report = await container.dashboard.getProductivityReport(user, 'weekly')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Personal</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Carga y avance del equipo en los ultimos 7 dias
        </p>
      </div>

      <Card as="div">
        <CardHeader
          title="Avance por trabajador"
          subtitle={`${report.totals.completed} de ${report.totals.assigned} tareas cerradas (${report.totals.progressPct}%)`}
        />

        {report.rows.length === 0 ? (
          <EmptyState
            title="Sin personal registrado"
            description="Registre trabajadores para asignarles clientes y tareas."
          />
        ) : (
          <DataTable
            caption="Avance y carga del personal"
            head={
              <tr>
                <Th>Trabajador</Th>
                <Th>Rol</Th>
                <Th className="text-right">Asignadas</Th>
                <Th className="text-right">Terminadas</Th>
                <Th className="text-right">Atrasadas</Th>
                <Th className="min-w-[180px]">Avance</Th>
                <Th>Carga</Th>
              </tr>
            }
          >
            {report.rows.map((person) => (
              <Tr key={person.userId}>
                <Td className="font-medium">{person.fullName}</Td>
                <Td className="text-[var(--text-secondary)]">{roleLabel(person.role)}</Td>
                <Td className="text-right tabular-nums">{person.assigned}</Td>
                <Td className="text-right tabular-nums">{person.completed}</Td>
                <Td className="text-right tabular-nums">
                  {person.overdue > 0 ? (
                    <span className="font-semibold text-[var(--status-critical)]">{person.overdue}</span>
                  ) : (
                    person.overdue
                  )}
                </Td>
                <Td>
                  {person.assigned === 0 ? (
                    // Un avance de 100% sobre cero tareas no dice nada util.
                    <span className="text-xs text-[var(--text-muted)]">Sin carga asignada</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={person.progressPct}
                        size="sm"
                        label={`Avance de ${person.fullName}: ${person.progressPct} por ciento`}
                      />
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                        {person.progressPct}%
                      </span>
                    </div>
                  )}
                </Td>
                <Td>
                  {/* El nivel se comunica con texto; el color solo refuerza. */}
                  <Badge
                    tone={
                      person.level === 'sobrecargado'
                        ? 'critical'
                        : person.level === 'alto'
                          ? 'warning'
                          : 'good'
                    }
                    dot={person.level === 'sobrecargado'}
                  >
                    {person.level === 'sobrecargado'
                      ? 'Sobrecargado'
                      : person.level === 'alto'
                        ? 'Carga alta'
                        : 'Normal'}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  )
}
