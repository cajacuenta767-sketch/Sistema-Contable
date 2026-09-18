'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'
import type { TaskStatus } from '@/core/domain/types'

const LABELS: Record<TaskStatus, string> = {
  PENDIENTE: 'Devolver a pendiente',
  EN_PROCESO: 'Pasar a en proceso',
  EN_REVISION: 'Enviar a revision',
  TERMINADA: 'Marcar como terminada',
}

/**
 * Cambio de estado.
 *
 * Los botones que se muestran salen de `allowedTransitions`, que calcula el
 * dominio. La UI no reimplementa la maquina de estados: si manana se agrega un
 * estado "OBSERVADA", este componente lo refleja sin tocarlo.
 *
 * Aun asi, el servidor vuelve a validar la transicion: lo que llega del
 * navegador nunca se da por bueno, aunque el boton lo haya generado la propia
 * app.
 */
export function TaskActions({
  taskId,
  currentStatus,
  allowedTransitions,
}: {
  taskId: string
  currentStatus: TaskStatus
  allowedTransitions: TaskStatus[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<TaskStatus | null>(null)

  async function changeTo(status: TaskStatus) {
    setPending(status)
    try {
      await api.post(`/api/tasks/${taskId}/status`, { status, note: note.trim() || undefined })
      toast.push('Estado actualizado', 'success')
      setNote('')
      router.refresh()
    } catch (error) {
      toast.push(
        error instanceof ApiError ? error.message : 'No se pudo cambiar el estado',
        'error',
      )
    } finally {
      setPending(null)
    }
  }

  if (allowedTransitions.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No hay cambios de estado disponibles desde {currentStatus}.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <Textarea
        label="Nota del cambio"
        hint="Opcional. Queda registrada en el historial."
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ej: se presento la declaracion, orden 1234567"
      />

      <div className="flex flex-col gap-2">
        {allowedTransitions.map((status) => (
          <Button
            key={status}
            variant={status === 'TERMINADA' ? 'primary' : 'secondary'}
            fullWidth
            loading={pending === status}
            loadingLabel="Actualizando estado"
            // Deshabilitar los demas mientras uno esta en vuelo evita que un
            // doble clic rapido dispare dos transiciones encadenadas.
            disabled={pending !== null && pending !== status}
            onClick={() => changeTo(status)}
          >
            {LABELS[status]}
          </Button>
        ))}
      </div>
    </div>
  )
}
