import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { contextQuery, loadAccountingContext } from '@/lib/accounting-context'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StatTile } from '@/components/charts/StatTile'
import { EmptyState } from '@/components/ui/Feedback'
import { ClientPeriodSelector } from '@/components/features/ClientPeriodSelector'
import { PeriodActions } from '@/components/features/PeriodActions'
import { ComputeTaxReturnButton } from '@/components/features/ComputeTaxReturnButton'
import { periodLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Contabilidad' }
export const dynamic = 'force-dynamic'

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; period?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const context = await loadAccountingContext(user, params)
  const container = getContainer()

  if (!context.clientId) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">Contabilidad</h1>
        <Card as="div">
          <EmptyState
            title="No hay empresas en su alcance"
            description="Registre un cliente para empezar a llevar su contabilidad."
          />
        </Card>
      </div>
    )
  }

  const query = contextQuery(context)

  // Las cuatro consultas son independientes: en serie se sentiria lento.
  const [sales, purchases, entries, taxReturn] = await Promise.all([
    container.accounting.listDocuments(
      user,
      { clientId: context.clientId, period: context.period, kind: 'VENTA' },
      { page: 1, pageSize: 1 },
    ),
    container.accounting.listDocuments(
      user,
      { clientId: context.clientId, period: context.period, kind: 'COMPRA' },
      { page: 1, pageSize: 1 },
    ),
    container.accounting.listEntries(
      user,
      { clientId: context.clientId, period: context.period },
      { page: 1, pageSize: 1 },
    ),
    container.accountingReports
      .listTaxReturns(user, context.clientId)
      .then((list) => list.find((r) => r.period === context.period) ?? null),
  ])

  const drafts = await container.accounting.listEntries(
    user,
    { clientId: context.clientId, period: context.period, status: 'BORRADOR' },
    { page: 1, pageSize: 1 },
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contabilidad</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {context.clientName} · {periodLabel(context.period)}
          </p>
        </div>
        <Badge tone={context.periodStatus === 'CERRADO' ? 'neutral' : 'good'}>
          Periodo {context.periodStatus === 'CERRADO' ? 'cerrado' : 'abierto'}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Comprobantes de venta" value={sales.total} tone="info" />
        <StatTile label="Comprobantes de compra" value={purchases.total} tone="info" />
        <StatTile label="Asientos" value={entries.total} tone="neutral" />
        <StatTile
          label="Asientos en borrador"
          value={drafts.total}
          tone={drafts.total > 0 ? 'warning' : 'good'}
          hint={drafts.total > 0 ? 'Confirmelos antes de cerrar' : 'Todo confirmado'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Determinacion mensual" subtitle="Base para la declaracion de IGV y Renta" />
          <CardBody>
            {taxReturn ? (
              <>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Figure label="Debito fiscal (ventas)" value={taxReturn.salesIgv.format()} />
                  <Figure label="Credito fiscal (compras)" value={taxReturn.purchasesIgv.format()} />
                  <Figure label="Saldo del mes anterior" value={taxReturn.previousCredit.format()} />
                  <Figure label="IGV a pagar" value={taxReturn.igvToPay.format()} strong />
                  <Figure label="Saldo a favor" value={taxReturn.carryForward.format()} />
                  <Figure
                    label={`Pago a cuenta de renta (${taxReturn.incomeTaxRate})`}
                    value={taxReturn.incomeTax.format()}
                  />
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      Total a pagar
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {taxReturn.totalToPay.format()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {taxReturn.status === 'PRESENTADO' ? (
                      <Badge tone="good">Presentada · orden {taxReturn.orderNumber}</Badge>
                    ) : (
                      <Badge tone="warning">Pendiente de presentar</Badge>
                    )}
                    <ComputeTaxReturnButton
                      clientId={context.clientId}
                      period={context.period}
                      alreadyPresented={taxReturn.status === 'PRESENTADO'}
                    />
                  </div>
                </div>

                {/* Se repite en cada pantalla a proposito: es la limitacion mas
                    importante del sistema y no debe quedar en letra chica. */}
                <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  Este calculo es la base para declarar. La presentacion se realiza en SUNAT
                  Operaciones en Linea: el sistema no presenta declaraciones ante SUNAT.
                </p>
              </>
            ) : (
              <EmptyState
                title="Sin determinacion calculada"
                description="Calcule la determinacion del periodo a partir de los comprobantes registrados."
                action={
                  <ComputeTaxReturnButton
                    clientId={context.clientId}
                    period={context.period}
                    alreadyPresented={false}
                  />
                }
              />
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Accesos" />
            <CardBody className="space-y-2">
              <NavCard href={`/contabilidad/comprobantes?${query}`} title="Comprobantes" description="Registro de ventas y compras" />
              <NavCard href={`/contabilidad/asientos?${query}`} title="Asientos" description="Libro diario y confirmacion" />
              <NavCard href={`/contabilidad/reportes?${query}`} title="Reportes" description="Balance de comprobacion y EEFF" />
              <NavCard href={`/contabilidad/libros?${query}`} title="Libros electronicos" description="Generacion de archivos PLE" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Cierre del periodo" />
            <CardBody>
              <PeriodActions
                clientId={context.clientId}
                period={context.period}
                status={context.periodStatus}
                draftCount={drafts.total}
                canReopen={user.role === 'ADMIN'}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd
        className={
          strong
            ? 'mt-1 text-lg font-semibold tabular-nums text-[var(--text-primary)]'
            : 'mt-1 text-sm tabular-nums text-[var(--text-primary)]'
        }
      >
        {value}
      </dd>
    </div>
  )
}

function NavCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-[var(--border)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
    >
      <span className="block text-sm font-medium text-[var(--text-primary)]">{title}</span>
      <span className="block text-xs text-[var(--text-muted)]">{description}</span>
    </Link>
  )
}
