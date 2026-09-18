'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Barra de filtros sincronizada con la URL.
 *
 * Los filtros viven en la query string y no en estado de React. Eso da gratis
 * tres cosas que los usuarios piden siempre: el enlace se puede compartir
 * ("mandame el link de las atrasadas de este cliente"), el boton Atras funciona,
 * y recargar no pierde lo que se estaba viendo.
 *
 * La busqueda va con rebote (debounce) de 400ms: sin eso, escribir "Comercial"
 * dispara nueve consultas y nueve renders del servidor.
 */

const DEBOUNCE_MS = 400

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
      {children}
    </div>
  )
}

export function useFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      // Cualquier cambio de filtro vuelve a la pagina 1: quedarse en la 7 de un
      // resultado que ahora tiene 2 paginas muestra una tabla vacia.
      if (key !== 'page') params.delete('page')
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const get = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams])

  return { setParam, get, searchParams }
}

export function SearchInput({ placeholder = 'Buscar...' }: { placeholder?: string }) {
  const { get, setParam } = useFilters()
  const [value, setValue] = useState(get('search'))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Si la URL cambia desde fuera (boton Atras), el input debe seguirla.
  const urlValue = get('search')
  useEffect(() => setValue(urlValue), [urlValue])

  function handleChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setParam('search', next || null), DEBOUNCE_MS)
  }

  // Limpia el temporizador pendiente al desmontar para no llamar a setParam
  // sobre un componente que ya no existe.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div className="min-w-[200px] flex-1">
      <label htmlFor="filtro-busqueda" className="sr-only">
        Buscar
      </label>
      <div className="relative">
        <svg
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          id="filtro-busqueda"
          type="search"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)]"
        />
      </div>
    </div>
  )
}

export function FilterSelect({
  name,
  label,
  options,
  allLabel = 'Todos',
}: {
  name: string
  label: string
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  const { get, setParam } = useFilters()
  const id = `filtro-${name}`

  return (
    <div className="min-w-[150px]">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
        {label}
      </label>
      <select
        id={id}
        value={get(name)}
        onChange={(e) => setParam(name, e.target.value || null)}
        className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 text-sm"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
