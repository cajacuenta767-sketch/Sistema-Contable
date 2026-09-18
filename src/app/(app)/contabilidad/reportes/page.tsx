import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { contextQuery, loadAccountingContext } from '@/lib/accounting-context'
import { isDomainError } from '@/core/domain/errors'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'
import { ClientPeriodSelector } from '@/components/features/ClientPeriodSelector'
import { periodLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Reportes contables' }
export const dynamic = 'force-dynamic'

export default async function AccountingReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const context = await loadAccountingContext(user, params)
  if (!context.clientId) redirect('/contabilidad')

  const container = getContainer()
  const query = contextQuery(context)

  const trialBalance = await container.accountingReports.trialBalance(
    user,
    context.clientId,
    context.period,
    { cumulative: true, level: 4 },
  )

  // Los estados financieros solo se emiten sobre un balance cuadrado. Si no
  // cuadra se muestra el motivo en vez de un reporte con cifras falsas.
  let statements = null
  let statementsError: string | null = null
  try {
    const result = await container.accountingReports.financialStatements(
      user,
      context.clientId,
      context.period,
    )
    statements = result
  } catch (error) {
    statementsError = isDomainError(error) ? error.message : 'No se pudieron emitir los estados financieros'
  }

  return (
    <div className="space-y-5">
      <nav aria-label="Ruta de navegacion" className="text-sm">
        <Link href={`/contabilidad?${query}`} className="text-[var(--accent)] hover:underline">
          Contabilidad
        </Link>
        <span aria-hidden="true" className="mx-2 text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)]">Reportes</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reportes contables</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {context.clientName} · acumulado al cierre de {periodLabel(context.period)}
          </p>
        </div>
        <Badge tone={trialBalance.balanced ? 'good' : 'critical'} dot={!trialBalance.balanced}>
          {trialBalance.balanced ? 'Balance cuadrado' : 'Balance descuadrado'}
        </Badge>
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

      <Card as="div">
        <CardHeader
          title="Balance de comprobacion"
          subtitle={`${trialBalance.rows.length} cuentas · resultado del ejercicio ${trialBalance.netIncome.format()}`}
        />
        {trialBalance.rows.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="No hay asientos confirmados en el periodo."
          />
        ) : (
          <DataTable
            caption="Balance de comprobacion del periodo"
            className="min-w-[900px]"
            head={
              <tr>
                <Th>Cuenta</Th>
                <Th className="text-right">Debe</Th>
                <Th className="text-right">Haber</Th>
                <Th className="text-right">Saldo deudor</Th>
                <Th className="text-right">Saldo acreedor</Th>
                <Th className="text-right">Activo</Th>
                <Th className="text-right">Pasivo</Th>
                <Th className="text-right">Perdida</Th>
                <Th className="text-right">Ganancia</Th>
              </tr>
            }
          >
            {trialBalance.rows.map((row) => (
              <Tr key={row.accountCode}>
                <Td>
                  <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                    {row.accountCode}
                  </span>
                  <span className="ml-2">{row.accountName}</span>
                </Td>
                <Amount value={row.debit.format()} />
                <Amount value={row.credit.format()} />
                <Amount value={row.debitBalance.format()} />
                <Amount value={row.creditBalance.format()} />
                <Amount value={row.assetBalance.format()} />
                <Amount value={row.liabilityBalance.format()} />
                <Amount value={row.lossBalance.format()} />
                <Amount value={row.gainBalance.format()} />
              </Tr>
            ))}
            <tr className="bg-[var(--surface-2)] font-semibold">
              <Td className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Totales</Td>
              <Amount value={trialBalance.totals.debit.format()} />
              <Amount value={trialBalance.totals.credit.format()} />
              <Amount value={trialBalance.totals.debitBalance.format()} />
              <Amount value={trialBalance.totals.creditBalance.format()} />
              <Amount value={trialBalance.totals.assetBalance.format()} />
              <Amount value={trialBalance.totals.liabilityBalance.format()} />
              <Amount value={trialBalance.totals.lossBalance.format()} />
              <Amount value={trialBalance.totals.gainBalance.format()} />
            </tr>
          </DataTable>
        )}
      </Card>

      {statementsError ? (
        <Card as="div">
          <ErrorState title="Estados financieros no disponibles" description={statementsError} />
        </Card>
      ) : statements ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card as="div">
            <CardHeader
              title="Estado de Situacion Financiera"
              subtitle={`Al cierre de ${periodLabel(context.period)}`}
            />
            <CardBody className="space-y-4">
              {statements.balanceSheet.groups.map((group) => (
                <div key={group.group}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {group.label}
                  </h3>
                  <dl className="space-y-1">
                    {group.lines.map((line) => (
                      <div key={line.key} className="flex justify-between gap-4 text-sm">
                        <dt className="text-[var(--text-secondary)]">{line.label}</dt>
                        <dd className="shrink-0 tabular-nums">{line.amount.format()}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-1 text-sm font-semibold">
                      <dt>Total {group.label.toLowerCase()}</dt>
                      <dd className="shrink-0 tabular-nums">{group.total.format()}</dd>
                    </div>
                  </dl>
                </div>
              ))}

              <div className="space-y-1 rounded-lg bg-[var(--surface-2)] p-3 text-sm">
                <Row label="Total activo" value={statements.balanceSheet.totalAssets.format()} />
                <Row label="Total pasivo" value={statements.balanceSheet.totalLiabilities.format()} />
                <Row label="Patrimonio" value={statements.balanceSheet.totalEquity.format()} />
                <Row label="Resultado del ejercicio" value={statements.balanceSheet.netIncome.format()} />
              </div>

              {statements.balanceSheet.warnings.map((warning, index) => (
                <p key={index} className="text-xs text-[var(--text-muted)]">
                  {warning}
                </p>
              ))}
            </CardBody>
          </Card>

          <Card as="div">
            <CardHeader
              title="Estado de Resultados"
              subtitle="Por naturaleza (elementos 6 y 7 del PCGE)"
            />
            <CardBody className="space-y-4">
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Ingresos
                </h3>
                <dl className="space-y-1">
                  {statements.incomeStatement.revenue.map((line) => (
                    <div key={line.key} className="flex justify-between gap-4 text-sm">
                      <dt className="text-[var(--text-secondary)]">
                        <span className="font-mono text-xs">{line.key}</span> {line.label}
                      </dt>
                      <dd className="shrink-0 tabular-nums">{line.amount.format()}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Gastos
                </h3>
                <dl className="space-y-1">
                  {statements.incomeStatement.expenses.map((line) => (
                    <div key={line.key} className="flex justify-between gap-4 text-sm">
                      <dt className="text-[var(--text-secondary)]">
                        <span className="font-mono text-xs">{line.key}</span> {line.label}
                      </dt>
                      <dd className="shrink-0 tabular-nums">{line.amount.format()}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="space-y-1 rounded-lg bg-[var(--surface-2)] p-3 text-sm">
                <Row label="Total ingresos" value={statements.incomeStatement.totalRevenue.format()} />
                <Row label="Total gastos" value={statements.incomeStatement.totalExpenses.format()} />
                <Row label="Resultado del ejercicio" value={statements.incomeStatement.netIncome.format()} strong />
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

function Amount({ value }: { value: string }) {
  // Los importes en cero se atenuan: una tabla llena de "S/ 0.00" en negro
  // hace perder de vista las cifras que si tienen contenido.
  const isZero = value.endsWith('0.00')
  return (
    <Td className={isZero ? 'text-right tabular-nums text-[var(--text-muted)]' : 'text-right tabular-nums'}>
      {value}
    </Td>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
