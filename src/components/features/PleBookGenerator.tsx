'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

const BOOKS = [
  { code: '140100', name: 'Registro de Ventas e Ingresos' },
  { code: '080100', name: 'Registro de Compras' },
  { code: '050100', name: 'Libro Diario' },
  { code: '060100', name: 'Libro Mayor' },
]

/**
 * Generacion y descarga de libros electronicos.
 *
 * La descarga NO usa el cliente de API comun: la respuesta es un archivo de
 * texto en Latin-1, no JSON. Se maneja el blob directamente para que el
 * navegador reciba los bytes tal cual los produjo el servidor; pasarlos por
 * una cadena de JavaScript los convertiria a UTF-8 y el validador de SUNAT
 * rechazaria las razones sociales con enie o tilde.
 */
export function PleBookGenerator({ clientId, period }: { clientId: string; period: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = useState<string | null>(null)

  async function generate(bookCode: string, bookName: string) {
    setPending(bookCode)
    try {
      const response = await fetch('/api/accounting/ple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, period, bookCode }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        toast.push(body?.error?.message ?? 'No se pudo generar el libro', 'error')
        return
      }

      const lines = response.headers.get('X-Ple-Lines') ?? '0'
      const rawWarnings = response.headers.get('X-Ple-Warnings')
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${bookCode}.txt`

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      // Liberar el objeto: sin esto el blob queda en memoria hasta recargar.
      URL.revokeObjectURL(url)

      toast.push(`${bookName}: ${lines} lineas generadas`, 'success')

      if (rawWarnings) {
        try {
          const warnings: string[] = JSON.parse(decodeURIComponent(rawWarnings))
          for (const warning of warnings) toast.push(warning, 'info')
        } catch {
          // Un aviso mal codificado no debe romper la descarga, que ya ocurrio.
        }
      }

      router.refresh()
    } catch {
      toast.push('No se pudo conectar con el servidor', 'error')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BOOKS.map((book) => (
        <div
          key={book.code}
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{book.name}</p>
            <p className="font-mono text-xs text-[var(--text-muted)]">{book.code}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={pending === book.code}
            loadingLabel="Generando libro"
            disabled={pending !== null && pending !== book.code}
            onClick={() => generate(book.code, book.name)}
          >
            Generar
          </Button>
        </div>
      ))}
    </div>
  )
}
