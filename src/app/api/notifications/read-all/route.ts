import { jsonOk, withErrorHandling } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs'

export const POST = withErrorHandling(async () => {
  const user = await requireUser()
  return jsonOk({ updated: await getContainer().notifications.markAllRead(user) })
})
