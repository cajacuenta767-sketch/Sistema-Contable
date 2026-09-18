import { jsonOk, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** Con ?employeeId= devuelve la boleta individual con su detalle de calculo. */
export const GET = withErrorHandling(async (request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { employeeId } = z
    .object({ employeeId: z.string().min(1).optional() })
    .parse(searchParamsToObject(request.url))

  const container = getContainer()
  if (employeeId) {
    return jsonOk(serialize(await container.payroll.payslip(user, id, employeeId)))
  }

  return jsonOk(serialize(await container.payroll.getRunById(user, id)))
})
