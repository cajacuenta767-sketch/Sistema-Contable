import { jsonOk, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { reportRangeSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { range } = reportRangeSchema.parse(searchParamsToObject(request.url))
  return jsonOk(await getContainer().dashboard.getProductivityReport(user, range))
})
