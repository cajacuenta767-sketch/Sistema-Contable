import { ForbiddenError } from '../errors'
import type { AuthenticatedUser, Role } from '../types'

/**
 * RBAC.
 *
 * Una unica tabla de permisos en vez de `if (user.role === 'ADMIN')` repartido
 * por 30 endpoints. Agregar un rol es agregar una fila, no auditar la app
 * entera.
 */

export const PERMISSIONS = [
  'client:read:all',
  'client:read:own',
  'client:write',
  'client:archive',
  'task:read:all',
  'task:read:own',
  'task:write',
  'task:assign',
  'task:approve',
  'template:write',
  'user:read',
  'user:write',
  'report:read:all',
  'report:read:own',
  'audit:read',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ADMIN: PERMISSIONS,
  SUPERVISOR: [
    'client:read:all',
    'client:write',
    'task:read:all',
    'task:write',
    'task:assign',
    'task:approve',
    'template:write',
    'user:read',
    'report:read:all',
    'audit:read',
  ],
  CONTADOR: [
    'client:read:own',
    'client:write',
    'task:read:own',
    'task:write',
    'user:read',
    'report:read:own',
  ],
  ASISTENTE: ['client:read:own', 'task:read:own', 'task:write', 'report:read:own'],
}

export const Permissions = {
  has(role: Role, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role].includes(permission)
  },

  assert(user: AuthenticatedUser, permission: Permission): void {
    if (!Permissions.has(user.role, permission)) {
      throw new ForbiddenError(`Se requiere el permiso "${permission}"`)
    }
  },

  /** true si el rol ve toda la cartera; false si solo ve lo suyo. */
  canSeeEverything(role: Role): boolean {
    return Permissions.has(role, 'task:read:all')
  },

  listFor(role: Role): readonly Permission[] {
    return ROLE_PERMISSIONS[role]
  },
}
