import { ForbiddenError, NotFoundError, ValidationError } from '@/core/domain/errors'
import { Permissions } from '@/core/domain/services/permissions'
import { TaskStatusService } from '@/core/domain/services/task-status'
import type { AuthenticatedUser, TaskStatus } from '@/core/domain/types'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'
import {
  type AuditLogRepository,
  type Clock,
  type CreateTaskInput,
  type NotificationRepository,
  type Page,
  type PageParams,
  type TaskCommentRecord,
  type TaskFilters,
  type TaskRecord,
  type TaskRepository,
  type TaskSort,
  type TaskStatusChangeRecord,
} from '../ports'
import { normalizePage } from './clients'

export interface TaskDetail extends TaskRecord {
  history: TaskStatusChangeRecord[]
  comments: TaskCommentRecord[]
  allowedTransitions: readonly TaskStatus[]
}

export class TaskUseCases {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly notifications: NotificationRepository,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  async list(
    user: AuthenticatedUser,
    filters: TaskFilters,
    page: Partial<PageParams>,
    sort: TaskSort = 'dueDate',
  ): Promise<Page<TaskRecord>> {
    const scoped: TaskFilters = Permissions.canSeeEverything(user.role)
      ? filters
      : { ...filters, assigneeId: user.id }

    if (filters.period && !TaxPeriod.isValid(filters.period)) {
      throw new ValidationError('El periodo debe tener el formato YYYY-MM')
    }

    return this.tasks.list(scoped, normalizePage(page), sort, this.clock.now())
  }

  async getDetail(user: AuthenticatedUser, id: string): Promise<TaskDetail> {
    const task = await this.requireVisibleTask(user, id)

    // Dos consultas en paralelo: son independientes, no hay razon para
    // encadenarlas y pagar dos round-trips en serie.
    const [history, comments] = await Promise.all([
      this.tasks.listStatusChanges(id),
      this.tasks.listComments(id),
    ])

    return {
      ...task,
      history,
      comments,
      allowedTransitions: TaskStatusService.allowedTransitions(task.status),
    }
  }

  async create(user: AuthenticatedUser, input: Omit<CreateTaskInput, 'createdById'>): Promise<TaskRecord> {
    Permissions.assert(user, 'task:write')

    if (!input.title?.trim()) throw new ValidationError('El titulo es obligatorio')
    if (input.period && !TaxPeriod.isValid(input.period)) {
      throw new ValidationError('El periodo debe tener el formato YYYY-MM')
    }
    if (input.assigneeId && input.assigneeId !== user.id) {
      Permissions.assert(user, 'task:assign')
    }

    const task = await this.tasks.create({
      ...input,
      title: input.title.trim(),
      createdById: user.id,
    })

    // La creacion NO se escribe en la bitacora de cambios de estado: crear no
    // es cambiar de estado, y la tarea ya guarda `createdAt` y `createdById`.
    // Escribirla ademas como transicion obligaria a generar 1000 filas extra
    // en cada corrida del job mensual, y dejaria historiales distintos segun
    // la tarea fuera manual o automatica. La UI compone el hito de creacion a
    // partir de la propia tarea, igual para ambos casos.
    await this.notifyAssignment(task, user)

    await this.audit.record({
      action: 'task.create',
      entity: 'Task',
      entityId: task.id,
      userId: user.id,
      metadata: { clientId: task.clientId, period: task.period },
    })

    return task
  }

  async changeStatus(
    user: AuthenticatedUser,
    taskId: string,
    to: TaskStatus,
    note?: string,
  ): Promise<TaskRecord> {
    const task = await this.requireVisibleTask(user, taskId)

    // Un asistente solo mueve SUS tareas. Un supervisor mueve cualquiera.
    if (!Permissions.canSeeEverything(user.role) && task.assigneeId !== user.id) {
      throw new ForbiddenError('Solo puede cambiar el estado de las tareas asignadas a usted')
    }

    // Toda la regla de transicion vive en el dominio.
    TaskStatusService.assertTransition(task.status, to, user.role)

    const now = this.clock.now()
    const updated = await this.tasks.update(taskId, {
      status: to,
      // startedAt se fija la PRIMERA vez que entra en proceso y no se pisa al
      // reabrir: mide el arranque real, no el ultimo toque.
      startedAt: to === 'EN_PROCESO' && !task.startedAt ? now : task.startedAt,
      completedAt: to === 'TERMINADA' ? now : null,
    })

    await this.tasks.recordStatusChange({
      taskId,
      from: task.status,
      to,
      userId: user.id,
      note: note ?? null,
    })

    // Avisar a quien corresponde segun el nuevo estado.
    if (to === 'EN_REVISION' && task.assigneeId && task.assigneeId !== user.id) {
      await this.notifications.create({
        userId: task.assigneeId,
        type: 'TAREA_EN_REVISION',
        title: 'Tarea enviada a revision',
        body: `${task.title} - ${task.clientName}`,
        link: `/tareas/${taskId}`,
      })
    }
    if (to === 'EN_PROCESO' && task.status === 'EN_REVISION' && task.assigneeId) {
      await this.notifications.create({
        userId: task.assigneeId,
        type: 'TAREA_DEVUELTA',
        title: 'Tarea devuelta con observaciones',
        body: note ?? `${task.title} - ${task.clientName}`,
        link: `/tareas/${taskId}`,
      })
    }

    await this.audit.record({
      action: 'task.status_change',
      entity: 'Task',
      entityId: taskId,
      userId: user.id,
      metadata: { from: task.status, to, note: note ?? null },
    })

    return updated
  }

  async assign(user: AuthenticatedUser, taskId: string, assigneeId: string | null): Promise<TaskRecord> {
    Permissions.assert(user, 'task:assign')
    const task = await this.requireVisibleTask(user, taskId)

    if (task.assigneeId === assigneeId) return task // no-op, no ensucia la auditoria

    const updated = await this.tasks.update(taskId, { assigneeId })
    if (assigneeId) await this.notifyAssignment(updated, user)

    await this.audit.record({
      action: 'task.assign',
      entity: 'Task',
      entityId: taskId,
      userId: user.id,
      metadata: { from: task.assigneeId, to: assigneeId },
    })

    return updated
  }

  async addComment(user: AuthenticatedUser, taskId: string, body: string): Promise<TaskCommentRecord> {
    const task = await this.requireVisibleTask(user, taskId)
    const text = body?.trim()
    if (!text) throw new ValidationError('El comentario no puede estar vacio')
    if (text.length > 5000) throw new ValidationError('El comentario excede los 5000 caracteres')

    const comment = await this.tasks.addComment({ taskId, body: text, authorId: user.id })

    // Al responsable se le avisa; a uno mismo no.
    if (task.assigneeId && task.assigneeId !== user.id) {
      await this.notifications.create({
        userId: task.assigneeId,
        type: 'SISTEMA',
        title: `Nuevo comentario de ${user.fullName}`,
        body: text.slice(0, 140),
        link: `/tareas/${taskId}`,
      })
    }

    return comment
  }

  /** Carga la tarea y verifica que el usuario tenga derecho a verla. */
  private async requireVisibleTask(user: AuthenticatedUser, id: string): Promise<TaskRecord> {
    const task = await this.tasks.findById(id)
    if (!task) throw new NotFoundError('la tarea', id)
    if (!Permissions.canSeeEverything(user.role) && task.assigneeId !== user.id) {
      throw new NotFoundError('la tarea', id)
    }
    return task
  }

  private async notifyAssignment(task: TaskRecord, actor: AuthenticatedUser): Promise<void> {
    if (!task.assigneeId || task.assigneeId === actor.id) return
    await this.notifications.create({
      userId: task.assigneeId,
      type: 'TAREA_ASIGNADA',
      title: 'Nueva tarea asignada',
      body: `${task.title} - ${task.clientName}`,
      link: `/tareas/${task.id}`,
      // Una asignacion por tarea: si se reasigna ida y vuelta no se duplica.
      dedupeKey: `assigned:${task.id}:${task.assigneeId}`,
    })
  }
}
