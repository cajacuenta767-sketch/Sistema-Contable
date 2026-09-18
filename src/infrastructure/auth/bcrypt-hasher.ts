import bcrypt from 'bcryptjs'
import type { PasswordHasher } from '@/core/application/ports'

/** 12 rondas: equilibrio actual entre costo de login (~250ms) y resistencia. */
const SALT_ROUNDS = 12

export class BcryptHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS)
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plain, hash)
    } catch {
      // Un hash corrupto en base no debe tumbar el login con un 500.
      return false
    }
  }
}
