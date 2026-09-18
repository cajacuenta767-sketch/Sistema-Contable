import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { updateClientSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

/** En Next 15 los params de ruta llegan como Promise. */
type Ctx = { params: Promise<{ id: string }> }

export const GET = withErrorHandling(async (_request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  return jsonOk(await getContainer().clients.getById(user, id))
})

export const PATCH = withErrorHandling(async (request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const input = updateClientSchema.parse(await readJson(request))
  return jsonOk(await getContainer().clients.update(user, id, input))
})
