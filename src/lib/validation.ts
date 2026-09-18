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

/**
 * Fecha de CALENDARIO (no instante): fecha de emision, de ingreso, de cese.
 *
 * Un input `type="date"` envia "2026-08-20". `new Date("2026-08-20")` lo
 * interpreta como medianoche UTC, que en Lima (UTC-5) es el 19 a las 19:00.
 * Guardado asi, una factura del 20 se muestra y se EXPORTA AL PLE como del 19:
 * un error de fecha en un libro electronico, no un detalle cosmetico.
 *
 * La normalizacion al mediodia UTC hace que el dia de calendario sea el mismo
 * en cualquier zona horaria entre UTC-12 y UTC+11, que las cubre todas las que
 * importan aqui.
 */
const calendarDate = z.coerce.date().transform((date) => {
  // Si ya trae hora significativa (viene de una API, no de un input de fecha)
  // se respeta: puede ser un instante real que no hay que mover.
  const isMidnightUtc =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0

  if (!isMidnightUtc) return date

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0),
  )
})

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

export const paginationSchema = z.object({
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
  serviceStart: calendarDate.nullish(),
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
  dueDate: calendarDate,
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
  fixedDueDate: calendarDate.nullish(),
  appliesToRegimes: z.array(z.enum(TAX_REGIMES)).default([]),
  defaultAssigneeId: cuid.nullish(),
  clientId: cuid.nullish(),
})

// ---------------------------------------------------------------------------
// Fase 2 - contabilidad
// ---------------------------------------------------------------------------

/**
 * Importes: se aceptan como CADENA y se validan con expresion regular, no con
 * `z.number()`. Un importe que pasa por `number` ya perdio precision antes de
 * llegar al dominio, y en contabilidad eso descuadra libros.
 */
const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v.toFixed(2) : v.trim()))
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), {
    message: 'Importe invalido: use hasta dos decimales, con punto',
  })

const rateString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d+)?$/.test(v), { message: 'Tasa invalida' })

const accountCode = z.string().regex(/^\d{1,10}$/, 'Codigo de cuenta invalido')

export const documentFiltersSchema = paginationSchema.extend({
  clientId: cuid,
  period: period.optional(),
  kind: z.enum(['VENTA', 'COMPRA']).optional(),
  status: z.enum(['REGISTRADO', 'ANULADO']).optional(),
  search: z.string().trim().max(120).optional(),
})

export const createDocumentSchema = z.object({
  clientId: cuid,
  kind: z.enum(['VENTA', 'COMPRA']),
  docType: z.string().regex(/^\d{2}$/, 'Tipo de comprobante: dos digitos del catalogo 10'),
  serie: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
  number: z.string().trim().min(1).max(20),
  issueDate: calendarDate,
  dueDate: calendarDate.nullish(),
  period: period.optional(),
  counterpartyDocType: z.string().regex(/^\d$/, 'Tipo de documento: un digito del catalogo 6'),
  counterpartyDocNumber: z.string().trim().min(1).max(15),
  counterpartyName: z.string().trim().min(2).max(100),
  currency: z.enum(['PEN', 'USD']).default('PEN'),
  exchangeRate: rateString.default('1'),
  taxableBase: moneyString.default('0'),
  exemptAmount: moneyString.default('0'),
  unaffectedAmount: moneyString.default('0'),
  igv: moneyString.default('0'),
  isc: moneyString.default('0'),
  otherCharges: moneyString.default('0'),
  total: moneyString,
  detractionRate: rateString.nullish(),
  detractionAmount: moneyString.nullish(),
  detractionDate: calendarDate.nullish(),
  detractionNumber: z.string().trim().max(20).nullish(),
  refDocType: z.string().regex(/^\d{2}$/).nullish(),
  refSerie: z.string().trim().max(20).nullish(),
  refNumber: z.string().trim().max(20).nullish(),
  refIssueDate: calendarDate.nullish(),
  notes: z.string().trim().max(500).nullish(),
})

export const importDocumentsSchema = z.object({
  clientId: cuid,
  documents: z.array(createDocumentSchema.omit({ clientId: true })).min(1).max(5000),
})

export const createEntrySchema = z.object({
  clientId: cuid,
  date: calendarDate,
  period,
  glossa: z.string().trim().min(3).max(200),
  source: z.enum(['MANUAL', 'AJUSTE']).default('MANUAL'),
  lines: z
    .array(
      z.object({
        accountCode,
        debit: moneyString.default('0'),
        credit: moneyString.default('0'),
        glossa: z.string().trim().max(200).nullish(),
      }),
    )
    .min(2, 'Un asiento requiere al menos dos lineas'),
})

export const createAccountSchema = z.object({
  clientId: cuid,
  code: accountCode,
  name: z.string().trim().min(3).max(150),
  isPosting: z.boolean().default(true),
})

export const reverseEntrySchema = z.object({
  reason: z.string().trim().min(3, 'Indique el motivo del extorno').max(200),
})

export const periodActionSchema = z.object({ clientId: cuid, period })

export const pleBookSchema = z.object({
  clientId: cuid,
  period,
  bookCode: z.enum(['140100', '080100', '050100', '060100']),
})

export const trialBalanceSchema = z.object({
  clientId: cuid,
  period,
  cumulative: queryBoolean.default('true'),
  level: z.coerce.number().int().min(1).max(6).default(4),
})

export const taxReturnSchema = z.object({ clientId: cuid, period })

export const presentTaxReturnSchema = z.object({
  clientId: cuid,
  period,
  orderNumber: z.string().trim().min(1).max(30),
})

// ---------------------------------------------------------------------------
// Fase 3 - planillas
// ---------------------------------------------------------------------------

export const createEmployeeSchema = z.object({
  clientId: cuid,
  docType: z.string().regex(/^\d$/).default('1'),
  docNumber: z.string().trim().min(8).max(15),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  position: z.string().trim().max(80).nullish(),
  contractType: z
    .enum(['INDEFINIDO', 'PLAZO_FIJO', 'TIEMPO_PARCIAL', 'LOCACION'])
    .default('INDEFINIDO'),
  hireDate: calendarDate,
  terminationDate: calendarDate.nullish(),
  basicSalary: moneyString,
  familyAllowance: z.boolean().default(false),
  pensionSystem: z.enum(['ONP', 'AFP']).default('ONP'),
  afpCode: z.string().trim().max(10).nullish(),
  afpCuspp: z.string().trim().max(20).nullish(),
  commissionType: z.enum(['FLUJO', 'MIXTA']).default('FLUJO'),
  healthSystem: z.enum(['ESSALUD', 'EPS']).default('ESSALUD'),
  highRisk: z.boolean().default(false),
  bankAccount: z.string().trim().max(40).nullish(),
  status: z.enum(['ACTIVO', 'CESADO']).optional(),
})

export const computePayrollSchema = z.object({
  clientId: cuid,
  period,
  adjustments: z
    .array(
      z.object({
        employeeId: cuid,
        workedDays: z.coerce.number().int().min(0).max(30).optional(),
        absentDays: z.coerce.number().int().min(0).max(30).optional(),
        overtimeHours25: z.coerce.number().min(0).max(200).optional(),
        overtimeHours35: z.coerce.number().min(0).max(200).optional(),
        bonuses: moneyString.optional(),
        otherDeductions: moneyString.optional(),
      }),
    )
    .optional(),
})
