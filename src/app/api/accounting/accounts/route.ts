import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { createAccountSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId } = z
    .object({ clientId: z.string().min(1) })
    .parse(searchParamsToObject(request.url))
  return jsonOk({ items: await getContainer().accounting.chart(user, clientId) })
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = createAccountSchema.parse(await readJson(request))
  const account = await getContainer().accounting.createAccount(user, input.clientId, input)
  return jsonOk(account, 201)
})
