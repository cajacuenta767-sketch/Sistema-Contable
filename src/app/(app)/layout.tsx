import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { MobileNavTrigger, NavProvider, SidebarNav } from '@/components/layout/Sidebar'
import { NotificationBell } from '@/components/layout/NotificationBell'

export const dynamic = 'force-dynamic'

/**
 * Armazon de la aplicacion autenticada.
 *
 * La sesion se resuelve aqui, en el servidor, una sola vez por navegacion, y
 * baja como props. El middleware ya redirigio a quien no tenia token; esta
 * segunda verificacion no es redundante: el middleware solo comprueba la
 * firma, aqui se confirma contra la base que el usuario sigue activo.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <NavProvider>
      <div className="min-h-dvh">
      {/* Salto al contenido: primer elemento enfocable de la pagina. Sin esto,
          un usuario de teclado tiene que recorrer toda la navegacion en cada
          pantalla. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>

      {/* El panel va FUERA del header a proposito: el header usa backdrop-blur
          y eso lo convertiria en el bloque contenedor de cualquier descendiente
          con position:fixed. Ver la nota en Sidebar.tsx. */}
      <SidebarNav role={user.role} userName={user.fullName} />

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)]/95 px-4 backdrop-blur sm:px-6">
          <MobileNavTrigger />

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--accent)]"
              >
                {initials(user.fullName)}
              </span>
              <span className="hidden text-sm sm:block">
                <span className="block font-medium leading-tight">{user.fullName}</span>
                <span className="block text-xs leading-tight text-[var(--text-muted)]">
                  {roleLabel(user.role)}
                </span>
              </span>
            </div>
          </div>
        </header>

        <main id="contenido" className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      </div>
    </NavProvider>
  )
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function roleLabel(role: string): string {
  return (
    { ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', CONTADOR: 'Contador', ASISTENTE: 'Asistente' }[
      role
    ] ?? role
  )
}
