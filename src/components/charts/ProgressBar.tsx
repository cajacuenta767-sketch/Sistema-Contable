import { cn } from '@/lib/cn'

/**
 * Barra de avance por trabajador (el indicador de la maqueta).
 *
 * Una sola serie, asi que no lleva leyenda: el titulo de la seccion ya la
 * nombra. El color NO codifica el nivel de carga -- eso lo dice una etiqueta
 * de texto al lado -- para no apoyar significado unicamente en el color.
 *
 * role="progressbar" con aria-valuenow hace que un lector de pantalla anuncie
 * "75 por ciento" en vez de leer un div vacio.
 */
export function ProgressBar({
  value,
  label,
  size = 'md',
}: {
  /** 0-100. */
  value: number
  /** Texto accesible. Obligatorio: una barra sin nombre no dice nada. */
  label: string
  size?: 'sm' | 'md'
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        'w-full overflow-hidden rounded-full bg-[var(--surface-2)]',
        size === 'sm' ? 'h-1.5' : 'h-2',
      )}
    >
      <div
        className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}
