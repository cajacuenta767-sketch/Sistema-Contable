import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { assignTaskSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrorHandling(async (request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { assigneeId } = assignTaskSchema.parse(await readJson(request))
  return jsonOk(await getContainer().tasks.assign(user, id, assigneeId))
})
