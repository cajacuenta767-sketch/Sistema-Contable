import { jsonOk, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { Permissions } from '@/core/domain/services/permissions'

export const runtime = 'nodejs'

export const GET = withErrorHandling(async () => {
  const user = await requireUser()
  // Se devuelven los permisos para que la UI pueda ocultar acciones. Ocultar
  // no es autorizar: el servidor vuelve a verificar en cada endpoint.
  return jsonOk({ user, permissions: Permissions.listFor(user.role) })
})
