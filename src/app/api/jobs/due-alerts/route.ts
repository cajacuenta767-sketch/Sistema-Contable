import { jsonOk, withErrorHandling } from '@/lib/http'
import { assertCronAuthorized } from '@/lib/cron-auth'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Job de alertas. Pensado para correr cada hora; deduplica por dedupeKey. */
export const POST = withErrorHandling(async (request: Request) => {
  assertCronAuthorized(request)
  return jsonOk(await getContainer().jobs.generateDueAlerts.execute())
})
