import { jsonError, jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { assertCronAuthorized } from '@/lib/cron-auth'
import { generateTasksSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Generar ~1000 tareas puede pasar del limite por defecto de 10s.
export const maxDuration = 300

/**
 * Job mensual. Se invoca desde un cron externo:
 *
 *   curl -X POST https://.../api/jobs/generate-tasks \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Es idempotente: correrlo de nuevo no duplica tareas.
 */
export const POST = withErrorHandling(async (request: Request) => {
  assertCronAuthorized(request)

  const container = getContainer()
  const { period } = generateTasksSchema.parse(await readJson(request))

  const actorId = await container.resolveSystemActorId()
  if (!actorId) {
    return jsonError(
      'NO_ADMIN',
      'No hay un administrador activo al que atribuir la generacion',
      412,
    )
  }

  const summary = await container.jobs.generateMonthlyTasks.execute(period, actorId)
  return jsonOk(summary)
})
