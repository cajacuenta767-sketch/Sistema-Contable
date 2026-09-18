import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { periodActionSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period } = periodActionSchema.parse(await readJson(request))
  return jsonOk(await getContainer().accounting.reopenPeriod(user, clientId, period))
})
