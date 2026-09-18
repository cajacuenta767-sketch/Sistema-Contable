import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { templateSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

export const GET = withErrorHandling(async () => {
  const user = await requireUser()
  return jsonOk({ items: await getContainer().templates.list(user) })
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = templateSchema.parse(await readJson(request))
  return jsonOk(
    await getContainer().templates.create(user, {
      ...input,
      description: input.description ?? null,
      dueDayOfMonth: input.dueDayOfMonth ?? null,
      fixedDueDate: input.fixedDueDate ?? null,
      defaultAssigneeId: input.defaultAssigneeId ?? null,
      clientId: input.clientId ?? null,
    }),
    201,
  )
})
