import type {
  ClientStatus,
  DueDateRule,
  NotificationType,
  Recurrence,
  Role,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  TaxRegime,
} from '@/core/domain/types'

/**
 * Puertos: lo que el nucleo NECESITA, expresado como interfaces.
 *
 * La infraestructura (Prisma, bcrypt, jose) los implementa. Los casos de uso
 * dependen solo de estas firmas, por eso se pueden testear con dobles en
 * memoria sin levantar Postgres.
 */

// ---------------------------------------------------------------------------
// Utilidades transversales
// ---------------------------------------------------------------------------

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PageParams {
  page: number
  pageSize: number
}

/** Paginacion siempre en servidor: con 200+ clientes traer todo no es opcion. */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface Clock {
  now(): Date
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>
  verify(plain: string, hash: string): Promise<boolean>
}

export interface SessionPayload {
  sub: string
  email: string
  role: Role
  fullName: string
}

export interface TokenService {
  sign(payload: SessionPayload, ttlSeconds: number): Promise<string>
  verify(token: string): Promise<SessionPayload | null>
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string
  email: string
  fullName: string
  role: Role
  status: 'ACTIVE' | 'INACTIVE'
  capacity: number
  phone: string | null
}

export interface UserWithSecret extends UserRecord {
  passwordHash: string
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserWithSecret | null>
  findById(id: string): Promise<UserRecord | null>
  listActive(): Promise<UserRecord[]>
  create(data: {
    email: string
    passwordHash: string
    fullName: string
    role: Role
    capacity?: number
  }): Promise<UserRecord>
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface ClientRecord {
  id: string
  ruc: string
  rucLastDigit: number
  businessName: string
  tradeName: string | null
  taxRegime: TaxRegime
  status: ClientStatus
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  address: string | null
  monthlyFee: number | null
  serviceStart: Date | null
  notes: string | null
  accountantId: string | null
  accountantName: string | null
  createdAt: Date
}

/** Fila del listado: incluye contadores agregados sin traer las tareas. */
export interface ClientListItem {
  id: string
  ruc: string
  businessName: string
  taxRegime: TaxRegime
  status: ClientStatus
  accountantName: string | null
  openTasks: number
  overdueTasks: number
}

export interface ClientFilters {
  search?: string
  status?: ClientStatus
  taxRegime?: TaxRegime
  accountantId?: string
}

export interface CreateClientInput {
  ruc: string
  rucLastDigit: number
  businessName: string
  tradeName?: string | null
  taxRegime: TaxRegime
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  address?: string | null
  monthlyFee?: number | null
  serviceStart?: Date | null
  notes?: string | null
  accountantId?: string | null
}

export type UpdateClientInput = Partial<Omit<CreateClientInput, 'ruc' | 'rucLastDigit'>> & {
  status?: ClientStatus
}

export interface ClientRepository {
  list(filters: ClientFilters, page: PageParams, now: Date): Promise<Page<ClientListItem>>
  findById(id: string): Promise<ClientRecord | null>
  findByRuc(ruc: string): Promise<ClientRecord | null>
  create(input: CreateClientInput): Promise<ClientRecord>
  update(id: string, input: UpdateClientInput): Promise<ClientRecord>
  /** Clientes activos para la generacion masiva de tareas. */
  listActiveForGeneration(): Promise<
    { id: string; rucLastDigit: number; taxRegime: TaxRegime; accountantId: string | null; businessName: string }[]
  >
  countByStatus(): Promise<Record<ClientStatus, number>>
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------

export interface TaskRecord {
  id: string
  title: string
  description: string | null
  category: TaskCategory
  status: TaskStatus
  priority: TaskPriority
  period: string | null
  dueDate: Date
  startedAt: Date | null
  completedAt: Date | null
  clientId: string
  clientName: string
  clientRuc: string
  assigneeId: string | null
  assigneeName: string | null
  templateId: string | null
  createdById: string | null
  createdByName: string | null
  createdAt: Date
}

export interface TaskFilters {
  search?: string
  status?: TaskStatus
  /** Filtro derivado: solo tareas cuya fecha limite ya paso y siguen abiertas. */
  overdueOnly?: boolean
  clientId?: string
  assigneeId?: string
  category?: TaskCategory
  priority?: TaskPriority
  period?: string
  dueBefore?: Date
  dueAfter?: Date
}

export type TaskSort = 'dueDate' | 'priority' | 'createdAt'

export interface CreateTaskInput {
  title: string
  description?: string | null
  category: TaskCategory
  priority: TaskPriority
  period?: string | null
  dueDate: Date
  clientId: string
  assigneeId?: string | null
  createdById: string
  templateId?: string | null
}

export interface TaskStatusChangeRecord {
  id: string
  from: TaskStatus | null
  to: TaskStatus
  note: string | null
  userName: string | null
  createdAt: Date
}

export interface TaskCommentRecord {
  id: string
  body: string
  authorName: string | null
  createdAt: Date
}

export interface TaskRepository {
  list(
    filters: TaskFilters,
    page: PageParams,
    sort: TaskSort,
    now: Date,
  ): Promise<Page<TaskRecord>>
  findById(id: string): Promise<TaskRecord | null>
  create(input: CreateTaskInput): Promise<TaskRecord>
  update(
    id: string,
    data: Partial<{
      title: string
      description: string | null
      priority: TaskPriority
      dueDate: Date
      assigneeId: string | null
      status: TaskStatus
      startedAt: Date | null
      completedAt: Date | null
    }>,
  ): Promise<TaskRecord>
  /**
   * Inserta en lote ignorando duplicados (unique clientId+templateId+period).
   * Devuelve cuantas se crearon realmente: hace el job idempotente.
   */
  createManyIgnoringDuplicates(inputs: CreateTaskInput[]): Promise<number>
  recordStatusChange(input: {
    taskId: string
    from: TaskStatus | null
    to: TaskStatus
    userId: string | null
    note?: string | null
  }): Promise<void>
  listStatusChanges(taskId: string): Promise<TaskStatusChangeRecord[]>
  addComment(input: { taskId: string; body: string; authorId: string }): Promise<TaskCommentRecord>
  listComments(taskId: string): Promise<TaskCommentRecord[]>
  /** Tareas abiertas cuyo vencimiento cae dentro de la ventana indicada. */
  findDueBetween(from: Date, to: Date): Promise<TaskRecord[]>
}

// ---------------------------------------------------------------------------
// Plantillas y cronograma
// ---------------------------------------------------------------------------

export interface TemplateRecord {
  id: string
  name: string
  description: string | null
  category: TaskCategory
  recurrence: Recurrence
  priority: TaskPriority
  active: boolean
  dueDateRule: DueDateRule
  dueDayOfMonth: number | null
  fixedDueDate: Date | null
  appliesToRegimes: TaxRegime[]
  defaultAssigneeId: string | null
  clientId: string | null
}

export interface TemplateRepository {
  listActive(): Promise<TemplateRecord[]>
  findById(id: string): Promise<TemplateRecord | null>
  create(input: Omit<TemplateRecord, 'id'>): Promise<TemplateRecord>
  update(id: string, input: Partial<Omit<TemplateRecord, 'id'>>): Promise<TemplateRecord>
}

export interface SunatScheduleRepository {
  /** Cronograma del periodo como Map "period:digit" -> fecha. */
  getScheduleMap(period: string): Promise<Map<string, Date>>
  upsertMany(entries: { period: string; lastDigit: number; dueDate: Date }[]): Promise<number>
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

export interface NotificationRecord {
  id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  readAt: Date | null
  createdAt: Date
}

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  dedupeKey?: string | null
}

export interface NotificationRepository {
  listForUser(userId: string, limit: number): Promise<NotificationRecord[]>
  countUnread(userId: string): Promise<number>
  markRead(userId: string, notificationId: string): Promise<void>
  markAllRead(userId: string): Promise<number>
  /** Ignora las que choquen con dedupeKey. Devuelve las realmente creadas. */
  createManyIgnoringDuplicates(inputs: CreateNotificationInput[]): Promise<number>
  create(input: CreateNotificationInput): Promise<void>
}

// ---------------------------------------------------------------------------
// Metricas y auditoria
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  clients: number
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  inReviewTasks: number
  overdueTasks: number
  /**
   * Conteos por estado EXCLUYENDO las vencidas.
   *
   * Existen porque "atrasada" no es un estado paralelo sino una condicion que
   * se superpone a los tres estados abiertos. Para un grafico de partes de un
   * todo hacen falta categorias disjuntas: si se grafican los cuatro estados
   * mas las atrasadas, las vencidas se cuentan dos veces y la suma de los
   * segmentos supera el total de tareas.
   */
  pendingOnTime: number
  inProgressOnTime: number
  inReviewOnTime: number
}

export interface StaffProgress {
  userId: string
  fullName: string
  role: Role
  capacity: number
  assigned: number
  completed: number
  overdue: number
}

export interface MetricsRepository {
  /**
   * Una sola consulta agregada en vez de N COUNT: con ~12k tareas/anio la
   * diferencia entre 1 query y 7 es la diferencia entre 40ms y 300ms.
   */
  dashboard(scope: { assigneeId?: string }, now: Date): Promise<DashboardMetrics>
  staffProgress(range: { from: Date; to: Date }, now: Date): Promise<StaffProgress[]>
  /** Tareas cerradas por dia en un rango, para el grafico de tendencia. */
  completionTrend(range: { from: Date; to: Date }, scope: { assigneeId?: string }): Promise<
    { date: string; count: number }[]
  >
}

export interface AuditLogRepository {
  record(input: {
    action: string
    entity: string
    entityId: string
    userId: string | null
    metadata?: Record<string, unknown>
    ip?: string | null
  }): Promise<void>
}
