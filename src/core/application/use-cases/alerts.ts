import { daysBetween } from '@/core/domain/services/due-date'
import type {
  Clock,
  CreateNotificationInput,
  NotificationRepository,
  TaskRepository,
} from '../ports'

/**
 * Generacion de alertas de vencimiento (canal: dentro del sistema).
 *
 * La deduplicacion es por `dedupeKey`, no por "ya corri hoy": el job puede
 * ejecutarse cada hora, reintentarse tras un fallo o solaparse, y el usuario
 * seguira recibiendo exactamente una alerta por tarea y umbral.
 *
 * La capa de notificacion esta detras de un puerto para que agregar correo o
 * WhatsApp mas adelante sea implementar el puerto, no reescribir esto.
 */

/** Dias de anticipacion con los que se avisa. */
const WARNING_THRESHOLDS = [5, 2, 0] as const

export interface AlertSummary {
  scanned: number
  created: number
}

export class GenerateDueAlertsUseCase {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<AlertSummary> {
    const now = this.clock.now()

    // Ventana: desde 30 dias atras (vencidas) hasta 5 dias adelante.
    const from = new Date(now.getTime() - 30 * 86_400_000)
    const to = new Date(now.getTime() + WARNING_THRESHOLDS[0] * 86_400_000)

    const tasks = await this.tasks.findDueBetween(from, to)
    const inputs: CreateNotificationInput[] = []

    for (const task of tasks) {
      if (!task.assigneeId) continue // sin responsable no hay a quien avisar

      const remaining = daysBetween(now, task.dueDate)

      if (remaining < 0) {
        inputs.push({
          userId: task.assigneeId,
          type: 'TAREA_VENCIDA',
          title: `Tarea vencida hace ${Math.abs(remaining)} dia(s)`,
          body: `${task.title} - ${task.clientName}`,
          link: `/tareas/${task.id}`,
          // Una alerta de vencido por tarea y por dia: insiste, pero no satura.
          dedupeKey: `overdue:${task.id}:${dayKey(now)}`,
        })
        continue
      }

      const threshold = WARNING_THRESHOLDS.find((t) => remaining === t)
      if (threshold === undefined) continue

      inputs.push({
        userId: task.assigneeId,
        type: 'TAREA_POR_VENCER',
        title: threshold === 0 ? 'Vence hoy' : `Vence en ${threshold} dias`,
        body: `${task.title} - ${task.clientName}`,
        link: `/tareas/${task.id}`,
        dedupeKey: `due-soon:${task.id}:${threshold}d`,
      })
    }

    const created = inputs.length > 0
      ? await this.notifications.createManyIgnoringDuplicates(inputs)
      : 0

    return { scanned: tasks.length, created }
  }
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}
