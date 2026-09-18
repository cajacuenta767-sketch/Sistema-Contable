import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { createEntrySchema, paginationSchema } from '@/lib/validation'
import { parseMoney, serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const filtersSchema = paginationSchema.extend({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  status: z.enum(['BORRADOR', 'CONFIRMADO', 'EXTORNADO']).optional(),
})

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { page, pageSize, ...filters } = filtersSchema.parse(searchParamsToObject(request.url))
  const result = await getContainer().accounting.listEntries(user, filters, { page, pageSize })
  return jsonOk(serialize(result))
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = createEntrySchema.parse(await readJson(request))

  const entry = await getContainer().accounting.createManualEntry(user, {
    ...input,
    lines: input.lines.map((line) => ({
      accountCode: line.accountCode,
      debit: parseMoney(line.debit),
      credit: parseMoney(line.credit),
      glossa: line.glossa ?? null,
    })),
  })

  return jsonOk(serialize(entry), 201)
})
