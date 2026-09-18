import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Ingresar' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  // Si ya hay sesion no tiene sentido mostrar el login.
  if (await getCurrentUser()) redirect('/')

  const { next } = await searchParams

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-0)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden="true">
              <path
                d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M8 9h8M8 13h8M8 17h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Sistema Contable</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Ingrese con las credenciales de su estudio
          </p>
        </div>

        <LoginForm redirectTo={next ?? '/'} />
      </div>
    </main>
  )
}
