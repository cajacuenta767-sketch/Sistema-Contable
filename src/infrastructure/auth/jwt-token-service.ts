import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload, TokenService } from '@/core/application/ports'
import { ROLES, type Role } from '@/core/domain/types'

/**
 * Sesiones con JWT firmado (HS256) guardado en cookie httpOnly.
 *
 * Se usa `jose` y no `jsonwebtoken` porque funciona en el runtime Edge, que es
 * donde corre el middleware de Next. Con `jsonwebtoken` el middleware no
 * podria validar la sesion y habria que hacerlo en cada pagina.
 */
export class JwtTokenService implements TokenService {
  private readonly key: Uint8Array

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret)
  }

  async sign(payload: SessionPayload, ttlSeconds: number): Promise<string> {
    return new SignJWT({ email: payload.email, role: payload.role, fullName: payload.fullName })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key)
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] })

      // No se confia en la forma del payload solo porque la firma valide:
      // un token viejo puede traer un rol que ya no existe.
      const role = payload.role
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.fullName !== 'string' ||
        typeof role !== 'string' ||
        !ROLES.includes(role as Role)
      ) {
        return null
      }

      return {
        sub: payload.sub,
        email: payload.email,
        fullName: payload.fullName,
        role: role as Role,
      }
    } catch {
      // Expirado, firma invalida o malformado: para el caller es lo mismo.
      return null
    }
  }
}
