import { jsonOk, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'
// El dashboard depende de la sesion: nunca debe cachearse en el CDN.
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async () => {
  const user = await requireUser()
  return jsonOk(await getContainer().dashboard.getOverview(user))
})
