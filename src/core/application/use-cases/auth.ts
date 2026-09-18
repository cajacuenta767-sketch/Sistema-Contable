import { UnauthorizedError } from '@/core/domain/errors'
import type { AuthenticatedUser } from '@/core/domain/types'
import type { PasswordHasher, TokenService, UserRepository } from '../ports'

/**
 * Casos de uso agrupados por agregado, no uno por archivo.
 *
 * Un archivo por caso de uso es mas "puro", pero con ~40 casos produce 40
 * archivos de 15 lineas que nadie navega. Agrupar por agregado mantiene
 * juntas las reglas que cambian juntas.
 */

export interface LoginResult {
  token: string
  user: AuthenticatedUser
}

export class AuthUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessionTtlSeconds: number,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase()
    const user = await this.users.findByEmail(normalizedEmail)

    // Se verifica el hash incluso si el usuario no existe, contra un hash
    // ficticio, para que el tiempo de respuesta no revele que correos estan
    // registrados (timing attack / enumeracion de usuarios).
    const hashToCheck = user?.passwordHash ?? DUMMY_HASH
    const passwordOk = await this.hasher.verify(password, hashToCheck)

    if (!user || !passwordOk) {
      throw new UnauthorizedError('Correo o contrasenia incorrectos')
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('El usuario se encuentra inactivo')
    }

    const authenticated: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    }

    const token = await this.tokens.sign(
      { sub: user.id, email: user.email, role: user.role, fullName: user.fullName },
      this.sessionTtlSeconds,
    )

    return { token, user: authenticated }
  }

  /**
   * Resuelve la sesion a partir del token.
   * Relee el usuario de la base: si fue desactivado a mitad de sesion, el
   * token sigue siendo criptograficamente valido pero el acceso ya no.
   */
  async resolveSession(token: string | undefined): Promise<AuthenticatedUser | null> {
    if (!token) return null
    const payload = await this.tokens.verify(token)
    if (!payload) return null

    const user = await this.users.findById(payload.sub)
    if (!user || user.status !== 'ACTIVE') return null

    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role }
  }
}

/** Hash bcrypt de una cadena arbitraria. Solo se usa para igualar tiempos. */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
