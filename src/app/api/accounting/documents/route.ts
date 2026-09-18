import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { createDocumentSchema, documentFiltersSchema } from '@/lib/validation'
import { parseMoney, parseMoneyOrNull, serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { page, pageSize, ...filters } = documentFiltersSchema.parse(
    searchParamsToObject(request.url),
  )
  const result = await getContainer().accounting.listDocuments(user, filters, { page, pageSize })
  return jsonOk(serialize(result))
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = createDocumentSchema.parse(await readJson(request))

  const result = await getContainer().accounting.registerDocument(user, {
    ...input,
    period: input.period ?? TaxPeriod.fromDate(input.issueDate).value,
    dueDate: input.dueDate ?? null,
    taxableBase: parseMoney(input.taxableBase),
    exemptAmount: parseMoney(input.exemptAmount),
    unaffectedAmount: parseMoney(input.unaffectedAmount),
    igv: parseMoney(input.igv),
    isc: parseMoney(input.isc),
    otherCharges: parseMoney(input.otherCharges),
    total: parseMoney(input.total),
    detractionRate: input.detractionRate ?? null,
    detractionAmount: parseMoneyOrNull(input.detractionAmount),
    detractionDate: input.detractionDate ?? null,
    detractionNumber: input.detractionNumber ?? null,
    refDocType: input.refDocType ?? null,
    refSerie: input.refSerie ?? null,
    refNumber: input.refNumber ?? null,
    refIssueDate: input.refIssueDate ?? null,
    notes: input.notes ?? null,
    createdById: user.id,
  })

  return jsonOk(serialize(result), 201)
})
