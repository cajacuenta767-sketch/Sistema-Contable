import { jsonOk, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { trialBalanceSchema } from '@/lib/validation'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period, cumulative, level } = trialBalanceSchema.parse(
    searchParamsToObject(request.url),
  )
  const result = await getContainer().accountingReports.trialBalance(user, clientId, period, {
    cumulative,
    level,
  })
  return jsonOk(serialize(result))
})
