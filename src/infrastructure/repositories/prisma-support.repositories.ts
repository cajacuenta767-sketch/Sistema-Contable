import type { PrismaClient } from '@prisma/client'
import type {
  AuditLogRepository,
  CreateNotificationInput,
  NotificationRecord,
  NotificationRepository,
  SunatScheduleRepository,
  TemplateRecord,
  TemplateRepository,
} from '@/core/application/ports'
import { DueDateService } from '@/core/domain/services/due-date'

/** Repositorios de apoyo: plantillas, cronograma, notificaciones y auditoria. */

export class PrismaTemplateRepository implements TemplateRepository {
  constructor(private readonly db: PrismaClient) {}

  async listActive(): Promise<TemplateRecord[]> {
    return this.db.taskTemplate.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })
  }

  async findById(id: string): Promise<TemplateRecord | null> {
    return this.db.taskTemplate.findUnique({ where: { id } })
  }

  async create(input: Omit<TemplateRecord, 'id'>): Promise<TemplateRecord> {
    return this.db.taskTemplate.create({ data: input })
  }

  async update(id: string, input: Partial<Omit<TemplateRecord, 'id'>>): Promise<TemplateRecord> {
    return this.db.taskTemplate.update({ where: { id }, data: input })
  }
}

export class PrismaSunatScheduleRepository implements SunatScheduleRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Devuelve el cronograma como Map en memoria.
   *
   * Se carga UNA vez por corrida del job y se consulta 1000 veces sin tocar la
   * base. La version ingenua (una consulta por cliente) convierte la
   * generacion mensual en 1000 round-trips identicos.
   */
  async getScheduleMap(period: string): Promise<Map<string, Date>> {
    const rows = await this.db.sunatDueDate.findMany({
      where: { period },
      select: { period: true, lastDigit: true, dueDate: true },
    })
    return new Map(
      rows.map((r) => [DueDateService.scheduleKey(r.period, r.lastDigit), r.dueDate]),
    )
  }

  async upsertMany(
    entries: { period: string; lastDigit: number; dueDate: Date }[],
  ): Promise<number> {
    if (entries.length === 0) return 0
    // Son 10 filas por periodo: el upsert secuencial dentro de una transaccion
    // es suficiente y mantiene la semantica de "corregir una fecha ya cargada".
    const ops = entries.map((e) =>
      this.db.sunatDueDate.upsert({
        where: { period_lastDigit: { period: e.period, lastDigit: e.lastDigit } },
        create: e,
        update: { dueDate: e.dueDate },
      }),
    )
    const result = await this.db.$transaction(ops)
    return result.length
  }
}

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly db: PrismaClient) {}

  async listForUser(userId: string, limit: number): Promise<NotificationRecord[]> {
    return this.db.notification.findMany({
      where: { userId },
      // No leidas primero y, dentro de cada grupo, las mas recientes.
      orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    })
  }

  async countUnread(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, readAt: null } })
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    // userId en el WHERE: nadie marca como leida la notificacion de otro,
    // aunque adivine el id. updateMany no falla si no hay coincidencia.
    await this.db.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    })
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return result.count
  }

  async createManyIgnoringDuplicates(inputs: CreateNotificationInput[]): Promise<number> {
    if (inputs.length === 0) return 0
    const result = await this.db.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        body: i.body ?? null,
        link: i.link ?? null,
        dedupeKey: i.dedupeKey ?? null,
      })),
      // El unique sobre dedupeKey hace el trabajo: el job puede correr cada
      // hora sin inundar al usuario con la misma alerta.
      skipDuplicates: true,
    })
    return result.count
  }

  async create(input: CreateNotificationInput): Promise<void> {
    await this.createManyIgnoringDuplicates([input])
  }
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: PrismaClient) {}

  async record(input: {
    action: string
    entity: string
    entityId: string
    userId: string | null
    metadata?: Record<string, unknown>
    ip?: string | null
  }): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          userId: input.userId,
          metadata: (input.metadata ?? {}) as object,
          ip: input.ip ?? null,
        },
      })
    } catch (error) {
      // La auditoria NO puede tumbar la operacion de negocio: si falla el log,
      // el cliente igual se creo. Se reporta y se sigue.
      console.error('[audit] no se pudo registrar la accion', input.action, error)
    }
  }
}
