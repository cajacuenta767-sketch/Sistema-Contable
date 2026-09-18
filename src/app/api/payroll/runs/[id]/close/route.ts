import { jsonOk, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrorHandling(async (_request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  return jsonOk(serialize(await getContainer().payroll.closeRun(user, id)))
})
