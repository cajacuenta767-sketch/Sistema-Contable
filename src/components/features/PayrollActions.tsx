'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'

/**
 * Calculo y cierre de la planilla del periodo.
 *
 * Recalcular reemplaza el detalle completo. Cerrar la congela: a partir de ahi
 * no se recalcula, que es lo que protege las boletas ya entregadas y los
 * aportes ya declarados.
 */
export function PayrollActions({
  clientId,
  period,
  runId,
  status,
  employeeCount,
  canReopen,
}: {
  clientId: string
  period: string
  runId: string | null
  status: 'BORRADOR' | 'CERRADA' | null
  employeeCount: number
  canReopen: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function compute() {
    setLoading(true)
    try {
      const result = await api.post<{ warnings: string[] }>('/api/payroll/runs', {
        clientId,
        period,
      })
      toast.push('Planilla calculada', 'success')
      // Los avisos del calculo importan: un trabajador que quedo fuera por
      // falta de tasas de AFP no puede pasar desapercibido.
      for (const warning of result.warnings ?? []) toast.push(warning, 'info')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo calcular', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function close() {
    if (!runId) return
    setLoading(true)
    try {
      const result = await api.post<{ entry: { number: number } | null; warnings: string[] }>(
        `/api/payroll/runs/${runId}/close`,
      )
      toast.push(
        result.entry
          ? `Planilla cerrada. Asiento de provision ${result.entry.number} generado en borrador.`
          : 'Planilla cerrada',
        'success',
      )
      for (const warning of result.warnings ?? []) toast.push(warning, 'error')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo cerrar', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function reopen() {
    if (!runId) return
    setLoading(true)
    try {
      await api.post(`/api/payroll/runs/${runId}/reopen`)
      toast.push('Planilla reabierta', 'success')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo reabrir', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'CERRADA') {
    return canReopen ? (
      <Button variant="secondary" loading={loading} onClick={reopen}>
        Reabrir planilla
      </Button>
    ) : (
      <span className="text-xs text-[var(--text-muted)]">
        Planilla cerrada. Solo un administrador puede reabrirla.
      </span>
    )
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        loading={loading}
        loadingLabel="Calculando planilla"
        disabled={employeeCount === 0}
        onClick={compute}
      >
        {runId ? 'Recalcular' : 'Calcular planilla'}
      </Button>
      {runId && (
        <Button loading={loading} onClick={close}>
          Cerrar planilla
        </Button>
      )}
    </div>
  )
}
