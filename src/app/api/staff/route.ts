import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { createUserSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

export const GET = withErrorHandling(async () => {
  const user = await requireUser()
  return jsonOk({ items: await getContainer().users.listStaff(user) })
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = createUserSchema.parse(await readJson(request))
  return jsonOk(await getContainer().users.create(user, input), 201)
})
