import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { contextQuery, loadAccountingContext } from '@/lib/accounting-context'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/Feedback'
import { ClientPeriodSelector } from '@/components/features/ClientPeriodSelector'
import { FilterBar, FilterSelect } from '@/components/features/FilterBar'
import { TablePagination } from '@/components/features/TablePagination'
import { EntryCard } from '@/components/features/EntryCard'
import { periodLabel } from '@/lib/format'
import { paginationSchema } from '@/lib/validation'

export const metadata: Metadata = { title: 'Asientos' }
export const dynamic = 'force-dynamic'

const STATUSES = ['BORRADOR', 'CONFIRMADO', 'EXTORNADO'] as const

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const context = await loadAccountingContext(user, params)
  if (!context.clientId) redirect('/contabilidad')

  const parsed = paginationSchema.safeParse(params)
  const { page, pageSize } = parsed.success ? parsed.data : { page: 1, pageSize: 25 }

  const status = STATUSES.find((s) => s === params.status)

  const result = await getContainer().accounting.listEntries(
    user,
    { clientId: context.clientId, period: context.period, status },
    { page, pageSize: Math.min(pageSize, 20) },
  )

  const query = contextQuery(context)

  return (
    <div className="space-y-5">
      <nav aria-label="Ruta de navegacion" className="text-sm">
        <Link href={`/contabilidad?${query}`} className="text-[var(--accent)] hover:underline">
          Contabilidad
        </Link>
        <span aria-hidden="true" className="mx-2 text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)]">Asientos</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold">Libro Diario</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {context.clientName} · {periodLabel(context.period)} · {result.total} asientos
        </p>
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
        <FilterBar>
          <FilterSelect
            name="status"
            label="Estado"
            options={[
              { value: 'BORRADOR', label: 'En borrador' },
              { value: 'CONFIRMADO', label: 'Confirmados' },
              { value: 'EXTORNADO', label: 'Extornados' },
            ]}
          />
        </FilterBar>
      </Card>

      {result.items.length === 0 ? (
        <Card as="div">
          <EmptyState
            title="Sin asientos"
            description={`No hay asientos en ${periodLabel(context.period)}. Registre comprobantes para generarlos automaticamente.`}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {result.items.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={{
                id: entry.id,
                number: entry.number,
                date: entry.date.toISOString(),
                glossa: entry.glossa,
                source: entry.source,
                status: entry.status,
                totalDebit: entry.totalDebit.format(),
                totalCredit: entry.totalCredit.format(),
                balanced: entry.totalDebit.equals(entry.totalCredit),
                lines: entry.lines.map((line) => ({
                  accountCode: line.accountCode,
                  accountName: line.accountName,
                  debit: line.debit.isZero() ? null : line.debit.format(),
                  credit: line.credit.isZero() ? null : line.credit.format(),
                  counterpartyDocNumber: line.counterpartyDocNumber,
                  reference:
                    line.serie && line.docNumber ? `${line.serie}-${line.docNumber}` : null,
                })),
              }}
              periodClosed={context.periodStatus === 'CERRADO'}
            />
          ))}

          <Card as="div">
            <TablePagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              pageSize={result.pageSize}
            />
          </Card>
        </div>
      )}
    </div>
  )
}
