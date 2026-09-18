import { jsonOk, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  accountCode: z.string().regex(/^\d{1,10}$/).optional(),
})

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period, accountCode } = schema.parse(searchParamsToObject(request.url))
  const result = await getContainer().accountingReports.ledger(user, clientId, period, accountCode)
  return jsonOk(serialize({ items: result }))
})
