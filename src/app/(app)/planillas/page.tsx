import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { loadAccountingContext } from '@/lib/accounting-context'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/charts/StatTile'
import { EmptyState } from '@/components/ui/Feedback'
import { ClientPeriodSelector } from '@/components/features/ClientPeriodSelector'
import { PayrollActions } from '@/components/features/PayrollActions'
import { NewEmployeeButton } from '@/components/features/NewEmployeeButton'
import { PayslipModal } from '@/components/features/PayslipModal'
import { PlameGeneratorButtons } from '@/components/features/PlameGeneratorButtons'
import { formatDate, periodLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Planillas' }
export const dynamic = 'force-dynamic'

const CONTRACT_LABELS: Record<string, string> = {
  INDEFINIDO: 'Indefinido',
  PLAZO_FIJO: 'Plazo fijo',
  TIEMPO_PARCIAL: 'Tiempo parcial',
  LOCACION: 'Locacion de servicios',
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const context = await loadAccountingContext(user, params)

  if (!context.clientId) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">Planillas</h1>
        <Card as="div">
          <EmptyState title="No hay empresas en su alcance" />
        </Card>
      </div>
    )
  }

  const container = getContainer()
  const [employees, run] = await Promise.all([
    container.payroll.listEmployees(user, context.clientId),
    container.payroll.getRun(user, context.clientId, context.period),
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Planillas</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {context.clientName} · {periodLabel(context.period)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewEmployeeButton clientId={context.clientId} />
          <PayrollActions
            clientId={context.clientId}
            period={context.period}
            runId={run?.id ?? null}
            status={run?.status ?? null}
            employeeCount={employees.length}
            canReopen={user.role === 'ADMIN'}
          />
        </div>
      </div>

      <Card as="div">
        <CardBody>
          <ClientPeriodSelector
            clients={context.clients}
            periods={context.periods}
            selectedClientId={context.clientId}
            selectedPeriod={context.period}
          />
        </CardBody>
      </Card>

      {run && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Trabajadores" value={run.employeeCount} tone="info" />
          <StatTile label="Total ingresos" value={run.totalGross.format()} tone="neutral" />
          <StatTile label="Total descuentos" value={run.totalDeductions.format()} tone="warning" />
          <StatTile label="Neto a pagar" value={run.totalNet.format()} tone="good" />
        </div>
      )}

      {run ? (
        <Card as="div">
          <CardHeader
            title="Boletas del periodo"
            subtitle={`Aportes del empleador: ${run.totalEmployer.format()}`}
            action={
              <Badge tone={run.status === 'CERRADA' ? 'neutral' : 'warning'}>
                {run.status === 'CERRADA' ? 'Planilla cerrada' : 'En borrador'}
              </Badge>
            }
          />
          <DataTable
            caption="Boletas de pago del periodo"
            className="min-w-[860px]"
            head={
              <tr>
                <Th>Trabajador</Th>
                <Th className="text-right">Dias</Th>
                <Th className="text-right">Ingresos</Th>
                <Th className="text-right">Pension</Th>
                <Th className="text-right">Renta 5ta</Th>
                <Th className="text-right">Descuentos</Th>
                <Th className="text-right">Neto</Th>
                <Th className="text-right">EsSalud</Th>
                <Th>Boleta</Th>
              </tr>
            }
          >
            {run.items.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <span className="block font-medium">{item.employeeName}</span>
                  <span className="block text-xs tabular-nums text-[var(--text-muted)]">
                    {item.employeeDocNumber}
                  </span>
                </Td>
                <Td className="text-right tabular-nums">{item.workedDays}</Td>
                <Td className="text-right tabular-nums">{item.grossPay.format()}</Td>
                <Td className="text-right tabular-nums">
                  {item.pensionContribution
                    .add(item.pensionCommission)
                    .add(item.pensionInsurance)
                    .format()}
                </Td>
                <Td className="text-right tabular-nums">{item.incomeTax5th.format()}</Td>
                <Td className="text-right tabular-nums">{item.totalDeductions.format()}</Td>
                <Td className="text-right font-semibold tabular-nums">{item.netPay.format()}</Td>
                <Td className="text-right tabular-nums text-[var(--text-secondary)]">
                  {item.employerEssalud.format()}
                </Td>
                <Td>
                  <PayslipModal
                    employeeName={item.employeeName}
                    period={context.period}
                    item={{
                      basicPay: item.basicPay.format(),
                      familyAllowance: item.familyAllowance.format(),
                      overtimePay: item.overtimePay.format(),
                      bonuses: item.bonuses.format(),
                      grossPay: item.grossPay.format(),
                      pensionContribution: item.pensionContribution.format(),
                      pensionCommission: item.pensionCommission.format(),
                      pensionInsurance: item.pensionInsurance.format(),
                      incomeTax5th: item.incomeTax5th.format(),
                      otherDeductions: item.otherDeductions.format(),
                      totalDeductions: item.totalDeductions.format(),
                      netPay: item.netPay.format(),
                      employerEssalud: item.employerEssalud.format(),
                      employerSctr: item.employerSctr.format(),
                      breakdown: item.breakdown ?? {},
                    }}
                  />
                </Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
      ) : (
        <Card as="div">
          <EmptyState
            title="Planilla no calculada"
            description={`No hay planilla calculada para ${periodLabel(context.period)}. Calculela a partir de los trabajadores vigentes.`}
          />
        </Card>
      )}

      <Card as="div">
        <CardHeader
          title="PDT PLAME"
          subtitle="Archivos de importacion de la planilla mensual electronica"
        />
        <CardBody>
          <PlameGeneratorButtons
            clientId={context.clientId}
            period={context.period}
            disabled={!run}
          />
        </CardBody>
      </Card>

      <Card as="div">
        <CardHeader title="Trabajadores" subtitle={`${employees.length} vigentes`} />
        {employees.length === 0 ? (
          <EmptyState
            title="Sin trabajadores"
            description="Registre trabajadores para poder calcular la planilla."
            action={<NewEmployeeButton clientId={context.clientId} />}
          />
        ) : (
          <DataTable
            caption="Trabajadores de la empresa"
            head={
              <tr>
                <Th>Trabajador</Th>
                <Th>Cargo</Th>
                <Th>Contrato</Th>
                <Th>Ingreso</Th>
                <Th className="text-right">Remuneracion</Th>
                <Th>Pension</Th>
                <Th>Condiciones</Th>
              </tr>
            }
          >
            {employees.map((employee) => (
              <Tr key={employee.id}>
                <Td>
                  <span className="block font-medium">{employee.fullName}</span>
                  <span className="block text-xs tabular-nums text-[var(--text-muted)]">
                    {employee.docNumber}
                  </span>
                </Td>
                <Td className="text-[var(--text-secondary)]">{employee.position ?? '-'}</Td>
                <Td className="text-[var(--text-secondary)]">
                  {CONTRACT_LABELS[employee.contractType] ?? employee.contractType}
                </Td>
                <Td className="tabular-nums text-[var(--text-secondary)]">
                  {formatDate(employee.hireDate)}
                </Td>
                <Td className="text-right tabular-nums">{employee.basicSalary.format()}</Td>
                <Td>
                  <Badge tone="neutral">
                    {employee.pensionSystem === 'ONP' ? 'ONP' : `AFP ${employee.afpCode ?? ''}`}
                  </Badge>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {employee.familyAllowance && <Badge tone="info">Asig. familiar</Badge>}
                    {employee.highRisk && <Badge tone="serious">Trabajo de riesgo</Badge>}
                  </span>
                </Td>
              </Tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  )
}
