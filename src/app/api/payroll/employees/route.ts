import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { createEmployeeSchema } from '@/lib/validation'
import { parseMoney, serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, includeTerminated } = z
    .object({
      clientId: z.string().min(1),
      includeTerminated: z.enum(['true', 'false']).optional(),
    })
    .parse(searchParamsToObject(request.url))

  const items = await getContainer().payroll.listEmployees(
    user,
    clientId,
    includeTerminated === 'true',
  )
  return jsonOk(serialize({ items }))
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = createEmployeeSchema.parse(await readJson(request))

  const employee = await getContainer().payroll.createEmployee(user, {
    ...input,
    position: input.position ?? null,
    terminationDate: input.terminationDate ?? null,
    basicSalary: parseMoney(input.basicSalary),
    afpCode: input.afpCode ?? null,
    afpCuspp: input.afpCuspp ?? null,
    bankAccount: input.bankAccount ?? null,
  })

  return jsonOk(serialize(employee), 201)
})
