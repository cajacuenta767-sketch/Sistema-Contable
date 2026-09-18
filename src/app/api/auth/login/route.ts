import { NextResponse } from 'next/server'
import { jsonOk, readJson, withErrorHandling } from '@/lib/http'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'
import { loginSchema } from '@/lib/validation'
import { getContainer } from '@/infrastructure/container'

export const runtime = 'nodejs' // bcrypt no corre en Edge

export const POST = withErrorHandling(async (request: Request) => {
  const { auth, env } = getContainer()
  const { email, password } = loginSchema.parse(await readJson(request))

  const { token, user } = await auth.login(email, password)

  const response = jsonOk({ user })
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(env.SESSION_TTL_SECONDS))
  return response
})

export async function GET() {
  return NextResponse.json({ error: { code: 'METHOD_NOT_ALLOWED' } }, { status: 405 })
}
