import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  CreateTaskInput,
  Page,
  PageParams,
  TaskCommentRecord,
  TaskFilters,
  TaskRecord,
  TaskRepository,
  TaskSort,
  TaskStatusChangeRecord,
} from '@/core/application/ports'
import type { TaskStatus } from '@/core/domain/types'

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  status: true,
  priority: true,
  period: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  clientId: true,
  assigneeId: true,
  templateId: true,
  createdById: true,
  createdAt: true,
  client: { select: { businessName: true, ruc: true } },
  assignee: { select: { fullName: true } },
  createdBy: { select: { fullName: true } },
} as const

type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>

/** Tope duro para consultas sin paginar (alertas, proximos vencimientos). */
const UNPAGED_LIMIT = 500

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(
    filters: TaskFilters,
    page: PageParams,
    sort: TaskSort,
    now: Date,
  ): Promise<Page<TaskRecord>> {
    const where = this.buildWhere(filters, now)
    const skip = (page.page - 1) * page.pageSize

    const [total, rows] = await this.db.$transaction([
      this.db.task.count({ where }),
      this.db.task.findMany({
        where,
        skip,
        take: page.pageSize,
        orderBy: this.buildOrderBy(sort),
        select: TASK_SELECT,
      }),
    ])

    return {
      items: rows.map(toRecord),
      total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
    }
  }

  async findById(id: string): Promise<TaskRecord | null> {
    const row = await this.db.task.findUnique({ where: { id }, select: TASK_SELECT })
    return row ? toRecord(row) : null
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const row = await this.db.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        priority: input.priority,
        period: input.period ?? null,
        dueDate: input.dueDate,
        clientId: input.clientId,
        assigneeId: input.assigneeId ?? null,
        createdById: input.createdById,
        templateId: input.templateId ?? null,
      },
      select: TASK_SELECT,
    })
    return toRecord(row)
  }

  async update(
    id: string,
    data: Partial<{
      title: string
      description: string | null
      priority: TaskRecord['priority']
      dueDate: Date
      assigneeId: string | null
      status: TaskStatus
      startedAt: Date | null
      completedAt: Date | null
    }>,
  ): Promise<TaskRecord> {
    const row = await this.db.task.update({ where: { id }, data, select: TASK_SELECT })
    return toRecord(row)
  }

  /**
   * INSERT masivo con `skipDuplicates`: se apoya en el indice unico
   * (clientId, templateId, period) para la idempotencia del job mensual.
   * Un chequeo previo en codigo seria vulnerable a dos ejecuciones
   * simultaneas; la restriccion de la base no.
   */
  async createManyIgnoringDuplicates(inputs: CreateTaskInput[]): Promise<number> {
    if (inputs.length === 0) return 0

    // Se trocea para no armar una sentencia gigante: con 200+ clientes y
    // varias plantillas esto puede superar las 2000 filas.
    const CHUNK = 500
    let created = 0

    for (let i = 0; i < inputs.length; i += CHUNK) {
      const chunk = inputs.slice(i, i + CHUNK)
      const result = await this.db.task.createMany({
        data: chunk.map((input) => ({
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          priority: input.priority,
          period: input.period ?? null,
          dueDate: input.dueDate,
          clientId: input.clientId,
          assigneeId: input.assigneeId ?? null,
          createdById: input.createdById,
          templateId: input.templateId ?? null,
        })),
        skipDuplicates: true,
      })
      created += result.count
    }
    return created
  }

  async recordStatusChange(input: {
    taskId: string
    from: TaskStatus | null
    to: TaskStatus
    userId: string | null
    note?: string | null
  }): Promise<void> {
    await this.db.taskStatusChange.create({
      data: {
        taskId: input.taskId,
        from: input.from,
        to: input.to,
        userId: input.userId,
        note: input.note ?? null,
      },
    })
  }

  async listStatusChanges(taskId: string): Promise<TaskStatusChangeRecord[]> {
    const rows = await this.db.taskStatusChange.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        from: true,
        to: true,
        note: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      note: r.note,
      userName: r.user?.fullName ?? null,
      createdAt: r.createdAt,
    }))
  }

  async addComment(input: {
    taskId: string
    body: string
    authorId: string
  }): Promise<TaskCommentRecord> {
    const row = await this.db.taskComment.create({
      data: { taskId: input.taskId, body: input.body, authorId: input.authorId },
      select: { id: true, body: true, createdAt: true, author: { select: { fullName: true } } },
    })
    return {
      id: row.id,
      body: row.body,
      authorName: row.author?.fullName ?? null,
      createdAt: row.createdAt,
    }
  }

  async listComments(taskId: string): Promise<TaskCommentRecord[]> {
    const rows = await this.db.taskComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, body: true, createdAt: true, author: { select: { fullName: true } } },
    })
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      authorName: r.author?.fullName ?? null,
      createdAt: r.createdAt,
    }))
  }

  async findDueBetween(from: Date, to: Date): Promise<TaskRecord[]> {
    const rows = await this.db.task.findMany({
      where: { status: { not: 'TERMINADA' }, dueDate: { gte: from, lte: to } },
      orderBy: { dueDate: 'asc' },
      take: UNPAGED_LIMIT,
      select: TASK_SELECT,
    })
    return rows.map(toRecord)
  }

  private buildWhere(filters: TaskFilters, now: Date): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {}

    if (filters.status) where.status = filters.status
    if (filters.clientId) where.clientId = filters.clientId
    if (filters.assigneeId) where.assigneeId = filters.assigneeId
    if (filters.category) where.category = filters.category
    if (filters.priority) where.priority = filters.priority
    if (filters.period) where.period = filters.period

    // "Atrasada" es derivado: no existe como estado en la base. Se traduce
    // aqui a su definicion real (abierta + vencida) para no persistir un
    // estado que habria que reescribir cada medianoche.
    //
    // Se COMPONE con el filtro de estado en vez de pisarlo: quien pida
    // "en proceso + atrasadas" espera la interseccion, no que el segundo
    // filtro anule al primero. Solo cuando no se indico estado se agrega la
    // condicion de "abierta".
    if (filters.overdueOnly) {
      if (!filters.status) where.status = { not: 'TERMINADA' }
      where.dueDate = { lt: now }
    }

    if (filters.dueBefore || filters.dueAfter) {
      where.dueDate = {
        ...(typeof where.dueDate === 'object' && where.dueDate !== null ? where.dueDate : {}),
        ...(filters.dueAfter ? { gte: filters.dueAfter } : {}),
        ...(filters.dueBefore ? { lte: filters.dueBefore } : {}),
      }
    }

    const search = filters.search?.trim()
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { client: { businessName: { contains: search, mode: 'insensitive' } } },
        { client: { ruc: { startsWith: search } } },
      ]
    }
    return where
  }

  private buildOrderBy(sort: TaskSort): Prisma.TaskOrderByWithRelationInput[] {
    switch (sort) {
      case 'priority':
        // El enum se declara de menor a mayor, asi que 'desc' pone URGENTE
        // arriba. El segundo criterio desempata por urgencia real.
        return [{ priority: 'desc' }, { dueDate: 'asc' }]
      case 'createdAt':
        return [{ createdAt: 'desc' }]
      case 'dueDate':
      default:
        return [{ dueDate: 'asc' }, { priority: 'desc' }]
    }
  }
}

function toRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    priority: row.priority,
    period: row.period,
    dueDate: row.dueDate,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    clientId: row.clientId,
    clientName: row.client.businessName,
    clientRuc: row.client.ruc,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.fullName ?? null,
    templateId: row.templateId,
    createdById: row.createdById,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt,
  }
}
