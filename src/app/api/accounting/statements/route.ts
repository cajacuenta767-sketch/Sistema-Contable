import { jsonOk, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { taxReturnSchema } from '@/lib/validation'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Estado de Situacion Financiera y Estado de Resultados del periodo. */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period } = taxReturnSchema.parse(searchParamsToObject(request.url))
  const result = await getContainer().accountingReports.financialStatements(user, clientId, period)
  return jsonOk(serialize(result))
})
