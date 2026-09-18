import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { computePayrollSchema } from '@/lib/validation'
import { parseMoney, serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Una planilla de cien trabajadores hace un calculo por cada uno, con una
// consulta de retenciones acumuladas: puede pasar los 10 segundos.
export const maxDuration = 120

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period } = z
    .object({
      clientId: z.string().min(1),
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    })
    .parse(searchParamsToObject(request.url))

  const container = getContainer()
  const result = period
    ? await container.payroll.getRun(user, clientId, period)
    : { items: await container.payroll.listRuns(user, clientId) }

  return jsonOk(serialize(result))
})

/** Calcula o recalcula la planilla del periodo. */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = computePayrollSchema.parse(await readJson(request))

  const result = await getContainer().payroll.computeRun(user, {
    clientId: input.clientId,
    period: input.period,
    adjustments: input.adjustments?.map((adjustment) => ({
      ...adjustment,
      bonuses: adjustment.bonuses ? parseMoney(adjustment.bonuses) : undefined,
      otherDeductions: adjustment.otherDeductions
        ? parseMoney(adjustment.otherDeductions)
        : undefined,
    })),
  })

  return jsonOk(serialize(result))
})
