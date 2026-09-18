/**
 * Tipos del dominio.
 *
 * Se declaran como uniones de literales en vez de importar los enums de
 * Prisma: el dominio no debe conocer la persistencia. Como los enums de
 * Prisma se generan como literales de string, ambos son estructuralmente
 * compatibles y no hace falta una capa de mapeo.
 *
 * Si algun dia se cambia de ORM, este archivo no se toca.
 */

export const ROLES = ['ADMIN', 'SUPERVISOR', 'CONTADOR', 'ASISTENTE'] as const
export type Role = (typeof ROLES)[number]

export const TAX_REGIMES = ['NRUS', 'RER', 'MYPE', 'GENERAL'] as const
export type TaxRegime = (typeof TAX_REGIMES)[number]

export const CLIENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const TASK_STATUSES = ['PENDIENTE', 'EN_PROCESO', 'EN_REVISION', 'TERMINADA'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_CATEGORIES = [
  'DECLARACION',
  'LIBRO',
  'PLANILLA',
  'TRAMITE',
  'REPORTE',
  'OTRO',
] as const
export type TaskCategory = (typeof TASK_CATEGORIES)[number]

export const RECURRENCES = ['MENSUAL', 'TRIMESTRAL', 'ANUAL', 'UNICA'] as const
export type Recurrence = (typeof RECURRENCES)[number]

export const DUE_DATE_RULES = ['SUNAT_MONTHLY', 'DAY_OF_MONTH', 'FIXED_DATE'] as const
export type DueDateRule = (typeof DUE_DATE_RULES)[number]

export const NOTIFICATION_TYPES = [
  'TAREA_ASIGNADA',
  'TAREA_POR_VENCER',
  'TAREA_VENCIDA',
  'TAREA_EN_REVISION',
  'TAREA_DEVUELTA',
  'SISTEMA',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/**
 * Estado derivado, NO persistido. Una tarea esta "atrasada" cuando su fecha
 * limite ya paso y todavia no esta terminada. Guardarlo en la base obligaria
 * a un job que reescriba filas cada medianoche y abriria la puerta a estados
 * inconsistentes; se calcula siempre a partir de dueDate + reloj.
 */
export type DerivedTaskState = TaskStatus | 'ATRASADA'

export interface AuthenticatedUser {
  id: string
  email: string
  fullName: string
  role: Role
}
