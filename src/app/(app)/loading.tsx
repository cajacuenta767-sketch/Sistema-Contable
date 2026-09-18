import { Skeleton } from '@/components/ui/Feedback'

/**
 * Estado de carga a nivel de ruta. Next lo muestra automaticamente mientras el
 * Server Component obtiene sus datos, asi la navegacion se siente inmediata en
 * vez de congelada.
 */
export default function Loading() {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Cargando contenido</span>
      <Skeleton className="h-7 w-52" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}
