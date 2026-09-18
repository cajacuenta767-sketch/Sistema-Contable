'use client'

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Campos de formulario accesibles.
 *
 * El patron que resuelven (y que casi siempre se implementa mal):
 *  - `label` ligada por id real, no por placeholder. Un placeholder NO es una
 *    etiqueta: desaparece al escribir y los lectores de pantalla no siempre
 *    lo anuncian.
 *  - El mensaje de error se liga con aria-describedby y el campo se marca con
 *    aria-invalid, para que el error se escuche al enfocar el campo.
 *  - El error se anuncia con role="alert" al aparecer.
 *  - El id se genera con useId(): estable entre servidor y cliente, sin
 *    colisiones aunque haya dos formularios iguales en la misma pagina.
 */

interface BaseFieldProps {
  label: string
  error?: string | null
  hint?: string
  required?: boolean
  /** Oculta visualmente la etiqueta sin quitarla del arbol de accesibilidad. */
  hideLabel?: boolean
}

function FieldShell({
  label,
  error,
  hint,
  required,
  hideLabel,
  inputId,
  errorId,
  hintId,
  children,
}: BaseFieldProps & {
  inputId: string
  errorId: string
  hintId: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={cn(
          'text-sm font-medium text-[var(--text-secondary)]',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--status-critical)]" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children}

      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-[var(--status-critical)]">
          {error}
        </p>
      )}
    </div>
  )
}

const CONTROL_CLASS =
  'w-full rounded-lg border bg-[var(--surface-1)] px-3 text-sm text-[var(--text-primary)] ' +
  'placeholder:text-[var(--text-muted)] transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>,
    BaseFieldProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, hideLabel, className, ...rest },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      hideLabel={hideLabel}
      inputId={id}
      errorId={errorId}
      hintId={hintId}
    >
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          CONTROL_CLASS,
          'h-10',
          error ? 'border-[var(--status-critical)]' : 'border-[var(--border-strong)]',
          className,
        )}
        {...rest}
      />
    </FieldShell>
  )
})

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>,
    BaseFieldProps {
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, hideLabel, options, placeholder, className, ...rest },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      hideLabel={hideLabel}
      inputId={id}
      errorId={errorId}
      hintId={hintId}
    >
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          CONTROL_CLASS,
          'h-10',
          error ? 'border-[var(--status-critical)]' : 'border-[var(--border-strong)]',
          className,
        )}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
})

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>,
    BaseFieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, hideLabel, className, rows = 4, ...rest },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <FieldShell
      label={label}
      error={error}
      hint={hint}
      required={required}
      hideLabel={hideLabel}
      inputId={id}
      errorId={errorId}
      hintId={hintId}
    >
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(
          CONTROL_CLASS,
          'py-2 leading-relaxed',
          error ? 'border-[var(--status-critical)]' : 'border-[var(--border-strong)]',
          className,
        )}
        {...rest}
      />
    </FieldShell>
  )
})
