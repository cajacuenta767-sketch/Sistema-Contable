import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { clientFiltersSchema, createClientSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { page, pageSize, ...filters } = clientFiltersSchema.parse(
    searchParamsToObject(request.url),
  )
  const result = await getContainer().clients.list(user, filters, { page, pageSize })
  return jsonOk(result)
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = createClientSchema.parse(await readJson(request))
  const client = await getContainer().clients.create(user, {
    ...input,
    contactEmail: input.contactEmail || null,
  })
  return jsonOk(client, 201)
})
