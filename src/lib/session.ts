import 'server-only'
import { cookies } from 'next/headers'
import { UnauthorizedError } from '@/core/domain/errors'
import type { AuthenticatedUser } from '@/core/domain/types'
import { getContainer } from '@/infrastructure/container'

export const SESSION_COOKIE = 'sc_session'

/**
 * Cookie de sesion.
 *
 *  - httpOnly: JavaScript del navegador no puede leerla, asi que un XSS no
 *    se lleva la sesion.
 *  - sameSite lax: corta CSRF en peticiones cross-site manteniendo la
 *    navegacion normal desde enlaces externos.
 *  - secure en produccion: no viaja por HTTP plano.
 */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

/** Usuario de la peticion actual, o null si no hay sesion valida. */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return getContainer().auth.resolveSession(token)
}

/** Igual que getCurrentUser pero exige sesion. Es lo que usan los endpoints. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser()
  if (!user) throw new UnauthorizedError()
  return user
}
