import type { PrismaClient } from '@prisma/client'
import type { UserRecord, UserRepository, UserWithSecret } from '@/core/application/ports'
import type { Role } from '@/core/domain/types'

/** Campos que se exponen al nucleo. Nunca se filtra el passwordHash. */
const PUBLIC_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  capacity: true,
  phone: true,
} as const

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmail(email: string): Promise<UserWithSecret | null> {
    const user = await this.db.user.findUnique({
      where: { email },
      select: { ...PUBLIC_FIELDS, passwordHash: true },
    })
    return user as UserWithSecret | null
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id }, select: PUBLIC_FIELDS })
  }

  async listActive(): Promise<UserRecord[]> {
    return this.db.user.findMany({
      where: { status: 'ACTIVE' },
      select: PUBLIC_FIELDS,
      orderBy: { fullName: 'asc' },
    })
  }

  async create(data: {
    email: string
    passwordHash: string
    fullName: string
    role: Role
    capacity?: number
  }): Promise<UserRecord> {
    return this.db.user.create({ data, select: PUBLIC_FIELDS })
  }
}
