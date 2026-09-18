import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { contextQuery, loadAccountingContext } from '@/lib/accounting-context'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/Feedback'
import { ClientPeriodSelector } from '@/components/features/ClientPeriodSelector'
import { PleBookGenerator } from '@/components/features/PleBookGenerator'
import { formatDateTime, periodLabel } from '@/lib/format'

export const metadata: Metadata = { title: 'Libros electronicos' }
export const dynamic = 'force-dynamic'

export default async function PleBooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const context = await loadAccountingContext(user, params)
  if (!context.clientId) redirect('/contabilidad')

  const exports_ = await getContainer().accountingReports.listPleExports(
    user,
    context.clientId,
    context.period,
  )

  const query = contextQuery(context)

  return (
    <div className="space-y-5">
      <nav aria-label="Ruta de navegacion" className="text-sm">
        <Link href={`/contabilidad?${query}`} className="text-[var(--accent)] hover:underline">
          Contabilidad
        </Link>
        <span aria-hidden="true" className="mx-2 text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)]">Libros electronicos</span>
      </nav>

      <div>
        <h1 className="text-xl font-semibold">Libros electronicos (PLE)</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {context.clientName} · {periodLabel(context.period)}
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

      {/* Esta advertencia es la mas importante de todo el modulo y por eso va
          arriba, no al pie: presentar un libro con una estructura desactualizada
          termina en un archivo rechazado. */}
      <div className="rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--status-warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Verifique la estructura antes de presentar
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Las estructuras de los libros electronicos las fija SUNAT por resolucion y cambian.
          Antes de presentar, pase el archivo por el validador del PLE y confirme que la
          estructura corresponde a la resolucion vigente. Cada archivo generado registra con
          que version de estructura se emitio.
        </p>
      </div>

      <Card as="div">
        <CardHeader title="Generar libro" subtitle="El archivo se descarga en codificacion Latin-1, como lo espera el validador" />
        <CardBody>
          <PleBookGenerator clientId={context.clientId} period={context.period} />
        </CardBody>
      </Card>

      <Card as="div">
        <CardHeader
          title="Historial de generaciones"
          subtitle="Constancia de que se genero, con que estructura y con que totales"
        />
        {exports_.length === 0 ? (
          <EmptyState
            title="Sin generaciones"
            description="Todavia no se genero ningun libro para este periodo."
          />
        ) : (
          <DataTable
            caption="Libros generados"
            head={
              <tr>
                <Th>Libro</Th>
                <Th>Archivo</Th>
                <Th className="text-right">Lineas</Th>
                <Th className="text-right">Debe</Th>
                <Th className="text-right">Haber</Th>
                <Th>Estructura</Th>
                <Th>Generado</Th>
              </tr>
            }
          >
            {exports_.map((item) => (
              <Tr key={item.id}>
                <Td className="font-medium">{item.bookName}</Td>
                <Td className="font-mono text-xs">{item.fileName}</Td>
                <Td className="text-right tabular-nums">{item.lineCount}</Td>
                <Td className="text-right tabular-nums">{item.totalDebit?.format() ?? '-'}</Td>
                <Td className="text-right tabular-nums">{item.totalCredit?.format() ?? '-'}</Td>
                <Td className="text-xs text-[var(--text-secondary)]">{item.layoutVersion}</Td>
                <Td className="text-xs text-[var(--text-muted)]">
                  {formatDateTime(item.generatedAt)}
                  {item.checksum && (
                    <span className="block font-mono">{item.checksum.slice(0, 12)}...</span>
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
