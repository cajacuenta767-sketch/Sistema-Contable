'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import type { Role } from '@/core/domain/types'
import { Permissions } from '@/core/domain/services/permissions'

/**
 * Navegacion principal.
 *
 * En movil es un panel deslizante; en escritorio una columna fija. Una sola
 * lista de enlaces para ambos: duplicarla es la via rapida a que un enlace
 * exista solo en una de las dos versiones.
 *
 * Se divide en tres piezas por una razon concreta de CSS, no por gusto:
 *
 *   - `MobileNavTrigger` tiene que estar DENTRO de la barra superior, que es
 *     donde el usuario lo espera.
 *   - `SidebarNav` esta posicionado con `fixed` respecto al viewport, asi que
 *     NO puede colgar de la barra superior: esa barra usa `backdrop-blur`, y
 *     cualquier `filter`, `backdrop-filter`, `transform` o `will-change` en un
 *     ancestro convierte a ese ancestro en el bloque contenedor de sus
 *     descendientes `fixed`. El panel dejaria de medirse contra la pantalla y
 *     se encogeria dentro del header.
 *   - `NavProvider` comparte el estado abierto/cerrado entre ambos, que es lo
 *     unico que necesitaban tener en comun.
 *
 * Mantenerlos separados hace que agregar un filtro al header manana no vuelva
 * a romper la navegacion.
 */

interface NavState {
  open: boolean
  setOpen: (open: boolean) => void
}

const NavContext = createContext<NavState | null>(null)

export function NavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Al navegar se cierra el panel movil: si no, queda tapando el contenido
  // recien cargado.
  useEffect(() => setOpen(false), [pathname])

  const value = useMemo(() => ({ open, setOpen }), [open])
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

function useNav(): NavState {
  const context = useContext(NavContext)
  if (!context) throw new Error('La navegacion debe usarse dentro de <NavProvider>')
  return context
}

/** Boton hamburguesa. Visible solo en movil; vive en la barra superior. */
export function MobileNavTrigger() {
  const { open, setOpen } = useNav()
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Abrir menu de navegacion"
      aria-expanded={open}
      aria-controls="main-nav"
      className="inline-flex size-10 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] lg:hidden"
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
        <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  )
}

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  /** Si se indica, el enlace solo aparece con ese permiso. */
  requires?: Parameters<typeof Permissions.has>[1]
}

const NAV: NavItem[] = [
  { href: '/', label: 'Inicio', icon: <IconHome /> },
  { href: '/clientes', label: 'Clientes', icon: <IconUsers /> },
  { href: '/tareas', label: 'Tareas', icon: <IconCheck /> },
  { href: '/personal', label: 'Personal', icon: <IconTeam />, requires: 'user:read' },
  { href: '/reportes', label: 'Reportes', icon: <IconChart /> },
]

export function SidebarNav({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname()
  const { open, setOpen } = useNav()

  const items = NAV.filter((item) => !item.requires || Permissions.has(role, item.requires))

  return (
    <>
      {/* Fondo oscuro del panel movil */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/45 lg:hidden"
        />
      )}

      <nav
        id="main-nav"
        aria-label="Navegacion principal"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--border)] bg-[var(--surface-1)] transition-transform duration-200',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-white">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 9h8M8 13h8M8 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Sistema Contable</span>
            <span className="block truncate text-xs text-[var(--text-muted)]">{userName}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menu"
            className="ml-auto rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] lg:hidden"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ul className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => {
            // "/" solo coincide exacto; el resto tambien en sus subrutas.
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  // aria-current es lo que permite a un lector de pantalla
                  // saber en que seccion esta el usuario.
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-[var(--brand-soft)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        <form action="/api/auth/logout" method="post" className="border-t border-[var(--border)] p-3">
          <LogoutButton />
        </form>
      </nav>
    </>
  )
}

function LogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        // replace y no push: no se debe poder "volver" a la sesion cerrada.
        window.location.replace('/login')
      }}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)]"
    >
      <svg viewBox="0 0 20 20" className="size-5 shrink-0" fill="none" aria-hidden="true">
        <path d="M12 6V4.5A1.5 1.5 0 0010.5 3h-5A1.5 1.5 0 004 4.5v11A1.5 1.5 0 005.5 17h5a1.5 1.5 0 001.5-1.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 10h9m0 0l-2.5-2.5M17 10l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Cerrar sesion
    </button>
  )
}

function IconHome() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none">
      <path d="M3.5 8.5L10 3.5l6.5 5V16a1 1 0 01-1 1h-3v-4.5h-5V17h-3a1 1 0 01-1-1V8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none">
      <circle cx="8" cy="7" r="2.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.75 16c0-2.6 2.35-4.25 5.25-4.25S13.25 13.4 13.25 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 8.25a2.25 2.25 0 100-4.5M15.5 15.5c0-1.9-.8-3.2-2-3.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none">
      <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 10.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconTeam() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none">
      <circle cx="6.5" cy="7" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13.5" cy="7" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 15.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M11 12.3c2.9-.7 6.5.5 6.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function IconChart() {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none">
      <path d="M3.5 16.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 13.5V9M10 13.5V4.5M14 13.5v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
