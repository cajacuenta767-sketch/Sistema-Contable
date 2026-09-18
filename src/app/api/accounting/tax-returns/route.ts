import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { taxReturnSchema } from '@/lib/validation'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId } = z
    .object({ clientId: z.string().min(1) })
    .parse(searchParamsToObject(request.url))
  const items = await getContainer().accountingReports.listTaxReturns(user, clientId)
  return jsonOk(serialize({ items }))
})

/** Calcula (o recalcula) la determinacion mensual del periodo. */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period } = taxReturnSchema.parse(await readJson(request))
  const result = await getContainer().accountingReports.computeTaxReturn(user, clientId, period)
  return jsonOk(serialize(result))
})
