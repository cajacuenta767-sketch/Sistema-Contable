import { z } from 'zod'
import {
  CLIENT_STATUSES,
  RECURRENCES,
  ROLES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TAX_REGIMES,
} from '@/core/domain/types'

/**
 * Esquemas de entrada de la API.
 *
 * Validar en el borde cumple dos funciones: rechaza basura antes de que llegue
 * al dominio, y le da a TypeScript tipos reales en vez de `any` salido de
 * `request.json()`.
 *
 * Ojo: esto NO reemplaza las reglas de negocio. Zod verifica forma; el dominio
 * verifica significado (que el RUC tenga digito verificador valido, que la
 * transicion de estado sea legal). Son capas distintas a proposito.
 */

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato esperado: YYYY-MM')
const cuid = z.string().min(1)

export /**
 * Booleano de query string.
 *
 * NO se usa `z.coerce.boolean()`: coaccionar con `Boolean("false")` da `true`,
 * porque cualquier cadena no vacia es verdadera en JavaScript. Es decir que
 * `?overdueOnly=false` filtraria por atrasadas. Se comparan literales.
 */
const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
})

export const loginSchema = z.object({
  email: z.string().email('Correo invalido'),
  password: z.string().min(1, 'La contrasenia es obligatoria'),
})

export const clientFiltersSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  taxRegime: z.enum(TAX_REGIMES).optional(),
  accountantId: cuid.optional(),
})

export const createClientSchema = z.object({
  ruc: z.string().trim(),
  businessName: z.string().trim().min(3, 'La razon social es muy corta').max(200),
  tradeName: z.string().trim().max(200).nullish(),
  taxRegime: z.enum(TAX_REGIMES),
  contactName: z.string().trim().max(120).nullish(),
  contactEmail: z.string().email('Correo de contacto invalido').nullish().or(z.literal('')),
  contactPhone: z.string().trim().max(30).nullish(),
  address: z.string().trim().max(250).nullish(),
  monthlyFee: z.coerce.number().nonnegative().nullish(),
  serviceStart: z.coerce.date().nullish(),
  notes: z.string().trim().max(2000).nullish(),
  accountantId: cuid.nullish(),
})

export const updateClientSchema = createClientSchema
  .omit({ ruc: true })
  .partial()
  .extend({ status: z.enum(CLIENT_STATUSES).optional() })

export const taskFiltersSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  overdueOnly: queryBoolean.optional(),
  clientId: cuid.optional(),
  assigneeId: cuid.optional(),
  category: z.enum(TASK_CATEGORIES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  period: period.optional(),
  sort: z.enum(['dueDate', 'priority', 'createdAt']).default('dueDate'),
})

export const createTaskSchema = z.object({
  title: z.string().trim().min(3, 'El titulo es muy corto').max(200),
  description: z.string().trim().max(5000).nullish(),
  category: z.enum(TASK_CATEGORIES),
  priority: z.enum(TASK_PRIORITIES).default('MEDIA'),
  period: period.nullish(),
  dueDate: z.coerce.date(),
  clientId: cuid,
  assigneeId: cuid.nullish(),
})

export const changeStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  note: z.string().trim().max(1000).optional(),
})

export const assignTaskSchema = z.object({ assigneeId: cuid.nullable() })

export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) })

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Minimo 10 caracteres'),
  fullName: z.string().trim().min(3).max(120),
  role: z.enum(ROLES),
  capacity: z.coerce.number().int().positive().max(500).optional(),
})

export const generateTasksSchema = z.object({ period: period.optional() })

export const reportRangeSchema = z.object({
  range: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
})

export const templateFiltersSchema = z.object({
  // El default se aplica sobre el valor de ENTRADA (la cadena), no sobre el
  // booleano de salida: el transform corre despues.
  activeOnly: queryBoolean.default('true'),
})

export const templateSchema = z.object({
  name: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).nullish(),
  category: z.enum(TASK_CATEGORIES),
  recurrence: z.enum(RECURRENCES).default('MENSUAL'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIA'),
  active: z.boolean().default(true),
  dueDateRule: z.enum(['SUNAT_MONTHLY', 'DAY_OF_MONTH', 'FIXED_DATE']).default('SUNAT_MONTHLY'),
  dueDayOfMonth: z.coerce.number().int().min(1).max(31).nullish(),
  fixedDueDate: z.coerce.date().nullish(),
  appliesToRegimes: z.array(z.enum(TAX_REGIMES)).default([]),
  defaultAssigneeId: cuid.nullish(),
  clientId: cuid.nullish(),
})
