import { jsonOk, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/** Genera el asiento de un comprobante importado que todavia no lo tiene. */
export const POST = withErrorHandling(async (_request: Request, ctx: Ctx) => {
  const user = await requireUser()
  const { id } = await ctx.params
  const entry = await getContainer().accounting.generateEntryForDocument(user, id)
  return jsonOk(serialize(entry), 201)
})
