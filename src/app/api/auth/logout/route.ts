import { jsonOk, withErrorHandling } from '@/lib/http'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

export const runtime = 'nodejs'

export const POST = withErrorHandling(async () => {
  const response = jsonOk({ ok: true })
  // maxAge 0 expira la cookie en el navegador de inmediato.
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0))
  return response
})
