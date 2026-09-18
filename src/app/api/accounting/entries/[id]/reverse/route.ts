import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { reverseEntrySchema } from '@/lib/validation'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withErrorHandling(async (request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const { reason } = reverseEntrySchema.parse(await readJson(request))
  return jsonOk(serialize(await getContainer().accounting.reverseEntry(user, id, reason)), 201)
})
