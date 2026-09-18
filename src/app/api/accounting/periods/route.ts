import { jsonOk, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId } = z
    .object({ clientId: z.string().min(1) })
    .parse(searchParamsToObject(request.url))
  return jsonOk({ items: await getContainer().accounting.listPeriods(user, clientId) })
})
