'use client'

import { useEffect } from 'react'

/**
 * Frontera de error de la aplicacion.
 *
 * Solo se muestra un mensaje generico: el detalle del fallo puede contener
 * nombres de tabla, rutas o consultas, y eso no va al navegador. El detalle se
 * registra del lado del servidor, donde si sirve.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ui] error no controlado:', error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Algo salio mal</h1>
      <p className="max-w-md text-sm text-[var(--text-secondary)]">
        No pudimos completar la operacion. Si el problema persiste, comuniquelo al administrador
        del sistema.
      </p>
      {error.digest && (
        // El digest permite al administrador encontrar el error exacto en los
        // registros del servidor sin exponer el detalle aqui.
        <p className="text-xs text-[var(--text-muted)]">Codigo de referencia: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-3 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
      >
        Reintentar
      </button>
    </main>
  )
}
