'use client'

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Dialogo modal.
 *
 * Se construye sobre <dialog> nativo en vez de un div con position fixed,
 * porque el navegador ya resuelve gratis lo dificil: la capa superior (no hay
 * guerras de z-index), el fondo inerte (el contenido de atras deja de ser
 * accesible para el teclado y los lectores de pantalla) y el atrapado del
 * foco dentro del dialogo.
 *
 * Lo que si hay que resolver a mano:
 *  - Escape: el nativo cierra sin avisar al estado de React, se intercepta.
 *  - Clic en el backdrop: el nativo no lo cierra.
 *  - Devolver el foco al elemento que lo abrio al cerrarse.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      openerRef.current = document.activeElement as HTMLElement | null
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
      // Sin esto, al cerrar el foco se va al <body> y el usuario de teclado
      // queda perdido al principio de la pagina.
      openerRef.current?.focus()
    }
  }, [open])

  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault() // el nativo cerraria sin sincronizar el estado
      onClose()
    },
    [onClose],
  )

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      // El click en el backdrop tiene como target al propio <dialog>; un click
      // dentro del contenido tiene como target a un hijo.
      if (event.target === ref.current) onClose()
    },
    [onClose],
  )

  return (
    <dialog
      ref={ref}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-description' : undefined}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-1)] p-0',
        'text-[var(--text-primary)] shadow-[var(--shadow-md)] backdrop:bg-black/45',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 id="modal-title" className="text-base font-semibold">
            {title}
          </h2>
          {description && (
            <p id="modal-description" className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar dialogo"
          className="-mr-1 shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  )
}
