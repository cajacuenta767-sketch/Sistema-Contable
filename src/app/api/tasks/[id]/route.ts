import { jsonOk, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withErrorHandling(async (_request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  return jsonOk(await getContainer().tasks.getDetail(user, id))
})
