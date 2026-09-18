import { jsonOk, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrorHandling(async (_request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  await getContainer().notifications.markRead(user, id)
  return jsonOk({ ok: true })
})
