import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { presentTaxReturnSchema } from '@/lib/validation'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

/**
 * Registra que la declaracion se presento en SUNAT.
 * El sistema NO presenta: SUNAT no expone una API para hacerlo. Aqui solo
 * queda constancia del numero de orden.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period, orderNumber } = presentTaxReturnSchema.parse(await readJson(request))
  const result = await getContainer().accountingReports.markTaxReturnPresented(
    user,
    clientId,
    period,
    orderNumber,
  )
  return jsonOk(serialize(result))
})
