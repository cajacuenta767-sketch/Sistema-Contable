import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold text-[var(--accent)]">Error 404</p>
      <h1 className="text-2xl font-semibold">No encontramos esta pagina</h1>
      <p className="max-w-md text-sm text-[var(--text-secondary)]">
        El recurso no existe o usted no tiene acceso a el.
      </p>
      <Link
        href="/"
        className="mt-3 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
