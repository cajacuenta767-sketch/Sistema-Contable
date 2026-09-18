'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'

/**
 * Calcula la determinacion mensual y, por separado, registra que se presento.
 *
 * Son dos acciones distintas a proposito: el sistema calcula, la persona
 * presenta en SUNAT y despues vuelve aqui a anotar el numero de orden de la
 * constancia. Confundirlas daria a entender que el sistema presenta, y no lo
 * hace: SUNAT no expone una API para eso.
 */
export function ComputeTaxReturnButton({
  clientId,
  period,
  alreadyPresented,
}: {
  clientId: string
  period: string
  alreadyPresented: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')

  async function compute() {
    setLoading(true)
    try {
      const result = await api.post<{ warnings: string[] }>('/api/accounting/tax-returns', {
        clientId,
        period,
      })
      toast.push('Determinacion calculada', 'success')
      for (const warning of result.warnings ?? []) toast.push(warning, 'info')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo calcular', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function markPresented() {
    setLoading(true)
    try {
      await api.post('/api/accounting/tax-returns/present', { clientId, period, orderNumber })
      toast.push('Presentacion registrada', 'success')
      setOpen(false)
      setOrderNumber('')
      router.refresh()
    } catch (error) {
      toast.push(error instanceof ApiError ? error.message : 'No se pudo registrar', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" loading={loading} onClick={compute}>
          Recalcular
        </Button>
        {!alreadyPresented && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Registrar presentacion
          </Button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar presentacion"
        description="Anote el numero de orden de la constancia que emitio SUNAT."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button loading={loading} disabled={!orderNumber.trim()} onClick={markPresented}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            El sistema no presenta declaraciones ante SUNAT: no existe una API publica para
            hacerlo. Presente en SUNAT Operaciones en Linea y registre aqui la constancia.
          </p>
          <Input
            label="Numero de orden"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="Ej: 1234567890"
            required
          />
        </div>
      </Modal>
    </>
  )
}
