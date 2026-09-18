'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

/**
 * Campana de notificaciones.
 *
 * Se refresca por sondeo cada 60 segundos, no con WebSocket. Para un estudio
 * contable, enterarse de una alerta de vencimiento un minuto despues es
 * irrelevante, y un WebSocket agrega un servidor con estado que habria que
 * escalar. Si algun dia hace falta tiempo real, se cambia este hook y nada mas.
 *
 * El sondeo se detiene cuando la pestania no esta visible: sin eso, veinte
 * pestanias abiertas en el estudio golpean la API sin que nadie mire.
 */
const POLL_INTERVAL_MS = 60_000

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      setItems(data.items ?? [])
      setUnread(data.unread ?? 0)
    } catch {
      // Un fallo de red en la campana no debe romper la pagina ni molestar al
      // usuario: se reintenta en el siguiente ciclo.
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  // Cerrar con Escape y al hacer clic fuera: comportamiento esperado de
  // cualquier menu desplegable.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [open])

  async function markAllRead() {
    setUnread(0)
    setItems((current) => current.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })))
    await fetch('/api/notifications/read-all', { method: 'POST' })
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        className="relative inline-flex size-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
          <path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 3.5-1.5 4.5-1.5 4.5h12s-1.5-1-1.5-4.5A4.5 4.5 0 0010 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8.5 15a1.75 1.75 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-[var(--status-critical)] px-1 text-[10px] font-bold leading-4 text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-md)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <h2 className="text-sm font-semibold">Notificaciones</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Marcar todas como leidas
              </button>
            )}
          </div>

          <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                No tiene notificaciones
              </li>
            )}
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.link ?? '#'}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block px-4 py-3 transition-colors hover:bg-[var(--surface-2)]',
                    !item.readAt && 'bg-[var(--brand-soft)]',
                  )}
                >
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                  {item.body && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{item.body}</p>
                  )}
                  <time
                    dateTime={item.createdAt}
                    className="mt-1 block text-[11px] text-[var(--text-muted)]"
                  >
                    {new Date(item.createdAt).toLocaleString('es-PE', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
