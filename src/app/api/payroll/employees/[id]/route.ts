import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { createEmployeeSchema } from '@/lib/validation'
import { parseMoney, serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withErrorHandling(async (request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const input = createEmployeeSchema.partial().parse(await readJson(request))

  const employee = await getContainer().payroll.updateEmployee(user, id, {
    ...input,
    basicSalary: input.basicSalary ? parseMoney(input.basicSalary) : undefined,
  })

  return jsonOk(serialize(employee))
})
