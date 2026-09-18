import { jsonOk, readJson, searchParamsToObject, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { createTaskSchema, taskFiltersSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { page, pageSize, sort, ...filters } = taskFiltersSchema.parse(
    searchParamsToObject(request.url),
  )
  return jsonOk(await getContainer().tasks.list(user, filters, { page, pageSize }, sort))
})

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = createTaskSchema.parse(await readJson(request))
  return jsonOk(await getContainer().tasks.create(user, input), 201)
})
