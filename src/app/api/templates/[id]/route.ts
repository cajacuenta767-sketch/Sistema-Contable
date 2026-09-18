import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { templateSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withErrorHandling(async (request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const input = templateSchema.partial().parse(await readJson(request))
  return jsonOk(await getContainer().templates.update(user, id, input))
})
