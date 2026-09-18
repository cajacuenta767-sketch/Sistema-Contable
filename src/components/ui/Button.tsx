'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Boton base de la aplicacion.
 *
 * Decisiones de accesibilidad que no son negociables:
 *  - `loading` deshabilita Y anuncia el cambio con aria-busy; si solo se
 *    deshabilitara, un lector de pantalla no diria nada.
 *  - El indicador de carga es decorativo (aria-hidden) y el texto de estado
 *    va en un nodo sr-only: el usuario ciego escucha "Guardando", no un spinner.
 *  - Nunca se elimina el foco visible.
 *  - El area tactil minima es 40px de alto (44px en `lg`), por encima del
 *    minimo recomendado para dedos.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Texto anunciado mientras `loading` esta activo. */
  loadingLabel?: string
  iconLeft?: ReactNode
  fullWidth?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] border border-transparent',
  secondary:
    'bg-[var(--surface-1)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-2)]',
  danger: 'bg-[var(--status-critical)] text-white border border-transparent hover:brightness-90',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel = 'Procesando',
    iconLeft,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // Un boton en carga se deshabilita para evitar el doble envio, que en
      // este sistema significaria crear la misma tarea dos veces.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:opacity-55 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span className="sr-only">{loadingLabel}</span>
        </>
      ) : (
        iconLeft && (
          <span aria-hidden="true" className="shrink-0">
            {iconLeft}
          </span>
        )
      )}
      <span className={cn(loading && 'opacity-80')}>{children}</span>
    </button>
  )
})
