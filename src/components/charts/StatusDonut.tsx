'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Distribucion de tareas por estado.
 *
 * Decisiones:
 *
 *  - ORDEN DE LOS SEGMENTOS. No es estetico. En un anillo el ultimo segmento
 *    toca al primero, asi que el par de cierre tambien tiene que distinguirse.
 *    Este orden (proceso, terminada, revision, pendiente, atrasada) fue
 *    elegido porque es el unico de los evaluados que pasa las comprobaciones
 *    de separacion para daltonismo en claro Y en oscuro, incluido el par de
 *    cierre. Reordenar sin volver a validar rompe esa garantia: en particular
 *    "terminada" (verde) y "atrasada" (rojo) NO pueden quedar contiguos, que
 *    es justo el par que un deuteranope no distingue.
 *
 *  - SEPARADOR DE 2px del color de la superficie entre segmentos: separa las
 *    formas aunque dos colores se parezcan, y es el encoding secundario que
 *    exige la norma de accesibilidad.
 *
 *  - LEYENDA SIEMPRE PRESENTE con etiqueta y valor. El color nunca es el unico
 *    portador del dato.
 *
 *  - TABLA EQUIVALENTE oculta visualmente: un lector de pantalla recibe los
 *    numeros exactos, no "grafico".
 */

export interface DonutSlice {
  key: string
  label: string
  value: number
}

/** Color por estado. Las claves coinciden con TaskStatus + ATRASADA. */
const SLICE_COLOR: Record<string, string> = {
  EN_PROCESO: 'var(--series-proceso)',
  TERMINADA: 'var(--series-terminada)',
  EN_REVISION: 'var(--series-revision)',
  PENDIENTE: 'var(--series-pendiente)',
  ATRASADA: 'var(--series-atrasada)',
}

/** Orden validado del anillo. Ver nota de arriba antes de tocarlo. */
const RING_ORDER = ['EN_PROCESO', 'TERMINADA', 'EN_REVISION', 'PENDIENTE', 'ATRASADA'] as const

const SIZE = 168
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Separador entre segmentos, en unidades de longitud de arco. */
const GAP = 2.5

export function StatusDonut({
  slices,
  title = 'Tareas por estado',
}: {
  slices: DonutSlice[]
  title?: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  const ordered = RING_ORDER.map((key) => slices.find((s) => s.key === key)).filter(
    (s): s is DonutSlice => Boolean(s && s.value > 0),
  )
  const total = ordered.reduce((sum, s) => sum + s.value, 0)

  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--text-muted)]">
        Todavia no hay tareas registradas.
      </p>
    )
  }

  // Se acumula el desplazamiento de cada arco. El anillo arranca arriba
  // (rotacion -90deg) porque es donde el ojo espera el inicio.
  let offset = 0
  const arcs = ordered.map((slice) => {
    const length = (slice.value / total) * CIRCUMFERENCE
    const arc = { ...slice, length: Math.max(0, length - GAP), offset }
    offset += length
    return arc
  })

  const active = hovered ? ordered.find((s) => s.key === hovered) : null

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
      <div className="relative shrink-0">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${title}. Total ${total} tareas.`}
          className="-rotate-90"
        >
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={SLICE_COLOR[arc.key] ?? 'var(--border-strong)'}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              onMouseEnter={() => setHovered(arc.key)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'cursor-default transition-opacity duration-150',
                // Al pasar el mouse se atenuan los demas en vez de agrandar el
                // activo: agrandarlo distorsionaria el area, que es el dato.
                hovered && hovered !== arc.key && 'opacity-35',
              )}
            />
          ))}
        </svg>

        {/* Numero central: el dato principal, no una etiqueta decorativa. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {active ? active.value : total}
          </span>
          <span className="max-w-[92px] text-center text-[11px] leading-tight text-[var(--text-muted)]">
            {active ? active.label : 'tareas'}
          </span>
        </div>
      </div>

      {/* Leyenda: siempre presente, con etiqueta y valor. */}
      <ul className="w-full min-w-0 space-y-1.5">
        {ordered.map((slice) => {
          const pct = Math.round((slice.value / total) * 100)
          return (
            <li
              key={slice.key}
              onMouseEnter={() => setHovered(slice.key)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm transition-colors',
                hovered === slice.key && 'bg-[var(--surface-2)]',
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: SLICE_COLOR[slice.key] ?? 'var(--border-strong)' }}
              />
              <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                {slice.label}
              </span>
              <span className="tabular-nums font-medium text-[var(--text-primary)]">
                {slice.value}
              </span>
              <span className="w-10 text-right tabular-nums text-xs text-[var(--text-muted)]">
                {pct}%
              </span>
            </li>
          )
        })}
      </ul>

      {/* Equivalente textual para lectores de pantalla. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Estado</th>
            <th scope="col">Tareas</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{s.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
