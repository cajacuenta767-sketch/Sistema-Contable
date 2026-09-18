import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { contextQuery, loadAccountingContext } from '@/lib/accounting-context'
import { Card, CardBody } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { ClientPeriodSelector } from '@/components/features/ClientPeriodSelector'
import { FilterBar, FilterSelect, SearchInput } from '@/components/features/FilterBar'
import { TablePagination } from '@/components/features/TablePagination'
import { NewDocumentButton } from '@/components/features/NewDocumentButton'
import { formatDate, periodLabel } from '@/lib/format'
import { DOCUMENT_TYPES } from '@/lib/catalogs'
import { paginationSchema } from '@/lib/validation'

export const metadata: Metadata = { title: 'Comprobantes' }
export const dynamic = 'force-dynamic'

export default async function DocumentsPage({
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

  const kind = params.kind === 'VENTA' || params.kind === 'COMPRA' ? params.kind : undefined

  const result = await getContainer().accounting.listDocuments(
    user,
    {
      clientId: context.clientId,
      period: context.period,
      kind,
      search: params.search,
    },
    { page, pageSize },
  )

  const query = contextQuery(context)

  return (
    <div className="space-y-5">
      <nav aria-label="Ruta de navegacion" className="text-sm">
        <Link href={`/contabilidad?${query}`} className="text-[var(--accent)] hover:underline">
          Contabilidad
        </Link>
        <span aria-hidden="true" className="mx-2 text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)]">Comprobantes</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comprobantes</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {context.clientName} · {periodLabel(context.period)} · {result.total} registrados
          </p>
        </div>
        {context.periodStatus !== 'CERRADO' && (
          <NewDocumentButton clientId={context.clientId} period={context.period} />
        )}
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
          <SearchInput placeholder="Buscar por razon social, RUC, serie o numero..." />
          <FilterSelect
            name="kind"
            label="Tipo"
            allLabel="Ventas y compras"
            options={[
              { value: 'VENTA', label: 'Ventas' },
              { value: 'COMPRA', label: 'Compras' },
            ]}
          />
        </FilterBar>

        {result.items.length === 0 ? (
          <EmptyState
            title="Sin comprobantes"
            description={`No hay comprobantes registrados en ${periodLabel(context.period)}.`}
          />
        ) : (
          <>
            <DataTable
              caption="Comprobantes del periodo"
              head={
                <tr>
                  <Th>Tipo</Th>
                  <Th>Comprobante</Th>
                  <Th>Fecha</Th>
                  <Th>Contraparte</Th>
                  <Th className="text-right">Base imponible</Th>
                  <Th className="text-right">IGV</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Asiento</Th>
                </tr>
              }
            >
              {result.items.map((document) => (
                <Tr key={document.id}>
                  <Td>
                    <Badge tone={document.kind === 'VENTA' ? 'info' : 'neutral'}>
                      {document.kind === 'VENTA' ? 'Venta' : 'Compra'}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="block font-medium tabular-nums">
                      {document.serie}-{document.number}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {DOCUMENT_TYPES[document.docType] ?? `Tipo ${document.docType}`}
                    </span>
                  </Td>
                  <Td className="tabular-nums text-[var(--text-secondary)]">
                    {formatDate(document.issueDate)}
                  </Td>
                  <Td>
                    <span className="block max-w-[220px] truncate">{document.counterpartyName}</span>
                    <span className="block text-xs tabular-nums text-[var(--text-muted)]">
                      {document.counterpartyDocNumber}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{document.taxableBase.format()}</Td>
                  <Td className="text-right tabular-nums">{document.igv.format()}</Td>
                  <Td className="text-right font-medium tabular-nums">{document.total.format()}</Td>
                  <Td>
                    {document.status === 'ANULADO' ? (
                      <Badge tone="critical" dot>Anulado</Badge>
                    ) : document.entryId ? (
                      <Badge tone="good">Asentado</Badge>
                    ) : (
                      <Badge tone="warning">Sin asiento</Badge>
                    )}
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
