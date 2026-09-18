'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Avisos efimeros.
 *
 * La region va con aria-live="polite" y role="status": los mensajes se anuncian
 * sin interrumpir lo que el usuario este haciendo. Para errores se usa "assertive",
 * que si interrumpe, porque un fallo al guardar no puede pasar desapercibido.
 */

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const ToastContext = createContext<{ push: (message: string, tone?: ToastTone) => void } | null>(
  null,
)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current, { id, message, tone }])
    // Los errores se quedan mas tiempo: hay que poder leerlos y reaccionar.
    const ttl = tone === 'error' ? 7000 : 4000
    setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), ttl)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // La region existe SIEMPRE en el DOM, aunque este vacia: si se montara
        // junto con el primer mensaje, los lectores de pantalla no lo
        // anunciarian (no alcanzan a observar la region recien creada).
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : undefined}
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 text-sm shadow-[var(--shadow-md)]',
              item.tone === 'success' &&
                'border-[color-mix(in_srgb,var(--status-good)_45%,transparent)] bg-[var(--surface-1)] text-[var(--status-good)]',
              item.tone === 'error' &&
                'border-[color-mix(in_srgb,var(--status-critical)_45%,transparent)] bg-[var(--surface-1)] text-[var(--status-critical)]',
              item.tone === 'info' && 'border-[var(--border-strong)] bg-[var(--surface-1)] text-[var(--text-primary)]',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return context
}
