'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

const FILES = [
  { kind: 'JORNADA' as const, label: 'Jornada laboral (.jor)' },
  { kind: 'CONCEPTOS' as const, label: 'Conceptos remunerativos (.rem)' },
]

/**
 * Descarga de los archivos de importacion del PDT PLAME.
 *
 * Igual que con los libros electronicos, la descarga no pasa por el cliente de
 * API comun: la respuesta es texto en Latin-1 y convertirla a cadena de
 * JavaScript la pasaria a UTF-8, que el importador del PDT no lee.
 */
export function PlameGeneratorButtons({
  clientId,
  period,
  disabled,
}: {
  clientId: string
  period: string
  disabled: boolean
}) {
  const toast = useToast()
  const [pending, setPending] = useState<string | null>(null)

  async function download(kind: string, label: string) {
    setPending(kind)
    try {
      const response = await fetch('/api/payroll/plame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, period, kind }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        toast.push(body?.error?.message ?? 'No se pudo generar el archivo', 'error')
        return
      }

      const disposition = response.headers.get('Content-Disposition') ?? ''
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `plame-${kind}.txt`
      const lines = response.headers.get('X-Plame-Lines') ?? '0'
      const rawWarnings = response.headers.get('X-Plame-Warnings')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)

      toast.push(`${label}: ${lines} lineas`, 'success')

      if (rawWarnings) {
        try {
          for (const warning of JSON.parse(decodeURIComponent(rawWarnings)) as string[]) {
            toast.push(warning, 'info')
          }
        } catch {
          // Un aviso mal codificado no invalida la descarga, que ya ocurrio.
        }
      }
    } catch {
      toast.push('No se pudo conectar con el servidor', 'error')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] px-3 py-2 text-xs text-[var(--text-secondary)]">
        Estos archivos se <strong>importan</strong> al PDT PLAME, que es el que presenta la
        declaracion. Verifique que la estructura corresponda a la version vigente del PDT antes
        de importarlos.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {FILES.map((file) => (
          <div
            key={file.kind}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5"
          >
            <span className="min-w-0 truncate text-sm font-medium">{file.label}</span>
            <Button
              size="sm"
              variant="secondary"
              loading={pending === file.kind}
              loadingLabel="Generando archivo"
              disabled={disabled || (pending !== null && pending !== file.kind)}
              onClick={() => download(file.kind, file.label)}
            >
              Descargar
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
