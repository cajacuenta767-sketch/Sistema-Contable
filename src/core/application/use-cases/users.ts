import { ConflictError, ValidationError } from '@/core/domain/errors'
import { Permissions } from '@/core/domain/services/permissions'
import type { AuthenticatedUser, Role } from '@/core/domain/types'
import type { AuditLogRepository, PasswordHasher, UserRecord, UserRepository } from '../ports'

const MIN_PASSWORD_LENGTH = 10

export class UserUseCases {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditLogRepository,
  ) {}

  /** Lista del personal: alimenta los selectores de responsable. */
  async listStaff(user: AuthenticatedUser): Promise<UserRecord[]> {
    Permissions.assert(user, 'user:read')
    return this.users.listActive()
  }

  async create(
    actor: AuthenticatedUser,
    input: { email: string; password: string; fullName: string; role: Role; capacity?: number },
  ): Promise<UserRecord> {
    Permissions.assert(actor, 'user:write')

    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError('El correo no tiene un formato valido')
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`La contrasenia debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
    }
    if (!input.fullName.trim()) {
      throw new ValidationError('El nombre completo es obligatorio')
    }
    if (await this.users.findByEmail(email)) {
      throw new ConflictError('Ya existe un usuario con ese correo')
    }

    const created = await this.users.create({
      email,
      passwordHash: await this.hasher.hash(input.password),
      fullName: input.fullName.trim(),
      role: input.role,
      capacity: input.capacity,
    })

    await this.audit.record({
      action: 'user.create',
      entity: 'User',
      entityId: created.id,
      userId: actor.id,
      metadata: { email, role: input.role },
    })

    return created
  }
}
