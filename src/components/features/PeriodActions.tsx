'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'

/**
 * Cierre y reapertura del periodo contable.
 *
 * Cerrar es la accion que protege la integridad de lo declarado: a partir de
 * ahi no entran asientos nuevos. Reabrir es excepcional, exige rol de
 * administrador y queda en la auditoria con nombre y hora.
 */
export function PeriodActions({
  clientId,
  period,
  status,
  draftCount,
  canReopen,
}: {
  clientId: string
  period: string
  status: 'ABIERTO' | 'CERRADO' | null
  draftCount: number
  canReopen: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function run(action: 'close' | 'reopen') {
    setLoading(true)
    try {
      await api.post(`/api/accounting/periods/${action}`, { clientId, period })
      toast.push(action === 'close' ? 'Periodo cerrado' : 'Periodo reabierto', 'success')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo completar', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'CERRADO') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">
          El periodo esta cerrado. No admite asientos ni comprobantes nuevos.
        </p>
        {canReopen ? (
          <Button variant="secondary" fullWidth loading={loading} onClick={() => run('reopen')}>
            Reabrir periodo
          </Button>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Solo un administrador puede reabrirlo.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">
        Al cerrar, el periodo deja de admitir asientos y comprobantes. Es lo que mantiene los
        libros alineados con lo declarado.
      </p>
      {draftCount > 0 && (
        <p className="rounded-lg bg-[color-mix(in_srgb,var(--status-warning)_16%,transparent)] px-3 py-2 text-xs text-[var(--text-primary)]">
          Hay {draftCount} asiento(s) en borrador. Confirmelos antes de cerrar.
        </p>
      )}
      <Button
        fullWidth
        loading={loading}
        loadingLabel="Cerrando periodo"
        disabled={draftCount > 0}
        onClick={() => run('close')}
      >
        Cerrar periodo
      </Button>
    </div>
  )
}
