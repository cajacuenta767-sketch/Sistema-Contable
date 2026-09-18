'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { DataTable, Td, Th, Tr } from '@/components/ui/Table'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'
import { formatDate } from '@/lib/format'

interface EntryView {
  id: string
  number: number
  date: string
  glossa: string
  source: string
  status: string
  totalDebit: string
  totalCredit: string
  balanced: boolean
  lines: {
    accountCode: string
    accountName: string
    debit: string | null
    credit: string | null
    counterpartyDocNumber: string | null
    reference: string | null
  }[]
}

const SOURCE_LABELS: Record<string, string> = {
  AUTOMATICO: 'Automatico',
  MANUAL: 'Manual',
  AJUSTE: 'Ajuste',
  APERTURA: 'Apertura',
  CIERRE: 'Cierre',
}

/**
 * Un asiento con sus lineas.
 *
 * Se muestra la partida completa siempre, no un resumen que haya que
 * desplegar: un contador revisa el asiento leyendo las cuentas, y esconderlas
 * detras de un clic convierte la revision de veinte asientos en veinte clics.
 */
export function EntryCard({ entry, periodClosed }: { entry: EntryView; periodClosed: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reason, setReason] = useState('')

  async function confirm() {
    setLoading(true)
    try {
      await api.post(`/api/accounting/entries/${entry.id}/confirm`)
      toast.push(`Asiento ${entry.number} confirmado`, 'success')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo confirmar', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function reverse() {
    setLoading(true)
    try {
      await api.post(`/api/accounting/entries/${entry.id}/reverse`, { reason })
      toast.push('Asiento extornado', 'success')
      setReverseOpen(false)
      setReason('')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo extornar', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="tabular-nums">Asiento {String(entry.number).padStart(4, '0')}</span>
            <Badge
              tone={
                entry.status === 'CONFIRMADO'
                  ? 'good'
                  : entry.status === 'EXTORNADO'
                    ? 'neutral'
                    : 'warning'
              }
            >
              {entry.status === 'CONFIRMADO'
                ? 'Confirmado'
                : entry.status === 'EXTORNADO'
                  ? 'Extornado'
                  : 'Borrador'}
            </Badge>
            <Badge tone="neutral">{SOURCE_LABELS[entry.source] ?? entry.source}</Badge>
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {formatDate(entry.date)} · {entry.glossa}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!entry.balanced && <Badge tone="critical" dot>No cuadra</Badge>}
          {entry.status === 'BORRADOR' && !periodClosed && (
            <Button size="sm" loading={loading} onClick={confirm}>
              Confirmar
            </Button>
          )}
          {entry.status === 'CONFIRMADO' && !periodClosed && (
            <Button size="sm" variant="secondary" onClick={() => setReverseOpen(true)}>
              Extornar
            </Button>
          )}
        </div>
      </div>

      <DataTable
        caption={`Detalle del asiento ${entry.number}`}
        className="min-w-[560px]"
        head={
          <tr>
            <Th>Cuenta</Th>
            <Th>Referencia</Th>
            <Th className="text-right">Debe</Th>
            <Th className="text-right">Haber</Th>
          </tr>
        }
      >
        {entry.lines.map((line, index) => (
          <Tr key={`${line.accountCode}-${index}`}>
            <Td>
              <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                {line.accountCode}
              </span>
              <span className="ml-2">{line.accountName}</span>
            </Td>
            <Td className="text-xs text-[var(--text-muted)]">
              {line.reference}
              {line.counterpartyDocNumber && (
                <span className="ml-1 tabular-nums">· {line.counterpartyDocNumber}</span>
              )}
            </Td>
            <Td className="text-right tabular-nums">{line.debit ?? ''}</Td>
            <Td className="text-right tabular-nums">{line.credit ?? ''}</Td>
          </Tr>
        ))}
        <tr className="bg-[var(--surface-2)] font-semibold">
          <Td className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Totales</Td>
          <Td>{''}</Td>
          <Td className="text-right tabular-nums">{entry.totalDebit}</Td>
          <Td className="text-right tabular-nums">{entry.totalCredit}</Td>
        </tr>
      </DataTable>

      <Modal
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        title={`Extornar asiento ${entry.number}`}
        description="Se creara el asiento inverso. El original NO se borra: ambos quedan en el libro."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReverseOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="danger" loading={loading} disabled={!reason.trim()} onClick={reverse}>
              Extornar
            </Button>
          </>
        }
      >
        <Input
          label="Motivo del extorno"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          hint="Queda registrado en la glosa del asiento inverso y en la auditoria."
        />
      </Modal>
    </Card>
  )
}
