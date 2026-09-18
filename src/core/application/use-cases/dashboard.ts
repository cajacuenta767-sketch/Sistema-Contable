import { startOfBusinessDay, toLimaParts } from '@/core/domain/services/due-date'
import { Permissions } from '@/core/domain/services/permissions'
import { ProductivityService, type WorkloadResult } from '@/core/domain/services/productivity'
import type { AuthenticatedUser } from '@/core/domain/types'
import type { Clock, DashboardMetrics, MetricsRepository, TaskRepository } from '../ports'

export interface StaffProgressView extends WorkloadResult {
  userId: string
  fullName: string
  role: string
}

export interface DashboardView {
  metrics: DashboardMetrics
  /** Distribucion por estado, lista para el grafico de dona. */
  statusBreakdown: { key: string; label: string; value: number }[]
  staff: StaffProgressView[]
  trend: { date: string; count: number }[]
  upcoming: {
    id: string
    title: string
    clientName: string
    dueDate: string
    daysRemaining: number
    assigneeName: string | null
  }[]
  scope: 'all' | 'own'
}

export type ReportRange = 'daily' | 'weekly' | 'monthly'

export class DashboardUseCases {
  constructor(
    private readonly metrics: MetricsRepository,
    private readonly tasks: TaskRepository,
    private readonly clock: Clock,
  ) {}

  async getOverview(user: AuthenticatedUser): Promise<DashboardView> {
    const now = this.clock.now()
    const seesAll = Permissions.canSeeEverything(user.role)
    const scope = seesAll ? {} : { assigneeId: user.id }

    const trendFrom = new Date(now.getTime() - 13 * 86_400_000)
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000)

    // Todo lo del dashboard se pide en paralelo. En serie serian ~4 viajes a
    // la base encadenados y el primer render se sentiria lento.
    const [metrics, staffRaw, trend, upcomingTasks] = await Promise.all([
      this.metrics.dashboard(scope, now),
      seesAll
        ? this.metrics.staffProgress({ from: startOfBusinessDay(now), to: now }, now)
        : Promise.resolve([]),
      this.metrics.completionTrend({ from: trendFrom, to: now }, scope),
      this.tasks.findDueBetween(now, weekAhead),
    ])

    const staff: StaffProgressView[] = staffRaw
      .map((s) => ({
        userId: s.userId,
        fullName: s.fullName,
        role: s.role,
        ...ProductivityService.evaluate({
          assigned: s.assigned,
          completed: s.completed,
          overdue: s.overdue,
          capacity: s.capacity,
        }),
      }))
      // Quien esta peor, primero: el dashboard existe para detectar problemas.
      .sort((a, b) => b.overdue - a.overdue || a.progressPct - b.progressPct)

    const visibleUpcoming = seesAll
      ? upcomingTasks
      : upcomingTasks.filter((t) => t.assigneeId === user.id)

    return {
      metrics,
      // Categorias DISJUNTAS: los tres estados abiertos cuentan solo sus
      // tareas dentro de plazo, y todas las vencidas van al segmento
      // "Atrasadas". Asi los segmentos suman exactamente el total de tareas,
      // que es lo unico que hace legible un grafico de partes de un todo.
      statusBreakdown: [
        { key: 'TERMINADA', label: 'Terminadas', value: metrics.completedTasks },
        { key: 'EN_PROCESO', label: 'En proceso', value: metrics.inProgressOnTime },
        { key: 'EN_REVISION', label: 'En revision', value: metrics.inReviewOnTime },
        { key: 'PENDIENTE', label: 'Pendientes', value: metrics.pendingOnTime },
        { key: 'ATRASADA', label: 'Atrasadas', value: metrics.overdueTasks },
      ].filter((s) => s.value > 0),
      staff,
      trend,
      upcoming: visibleUpcoming.slice(0, 8).map((t) => ({
        id: t.id,
        title: t.title,
        clientName: t.clientName,
        dueDate: t.dueDate.toISOString(),
        daysRemaining: Math.max(
          0,
          Math.ceil((t.dueDate.getTime() - now.getTime()) / 86_400_000),
        ),
        assigneeName: t.assigneeName,
      })),
      scope: seesAll ? 'all' : 'own',
    }
  }

  /** Reporte diario / semanal / mensual de productividad. */
  async getProductivityReport(user: AuthenticatedUser, range: ReportRange) {
    Permissions.assert(
      user,
      Permissions.canSeeEverything(user.role) ? 'report:read:all' : 'report:read:own',
    )

    const now = this.clock.now()
    const from = rangeStart(now, range)

    const [staffRaw, trend] = await Promise.all([
      this.metrics.staffProgress({ from, to: now }, now),
      this.metrics.completionTrend(
        { from, to: now },
        Permissions.canSeeEverything(user.role) ? {} : { assigneeId: user.id },
      ),
    ])

    const rows = staffRaw
      .filter((s) => Permissions.canSeeEverything(user.role) || s.userId === user.id)
      .map((s) => ({
        userId: s.userId,
        fullName: s.fullName,
        role: s.role,
        ...ProductivityService.evaluate({
          assigned: s.assigned,
          completed: s.completed,
          overdue: s.overdue,
          capacity: s.capacity,
        }),
      }))
      .sort((a, b) => b.completed - a.completed)

    const totals = rows.reduce(
      (acc, r) => ({
        assigned: acc.assigned + r.assigned,
        completed: acc.completed + r.completed,
        overdue: acc.overdue + r.overdue,
      }),
      { assigned: 0, completed: 0, overdue: 0 },
    )

    return {
      range,
      from: from.toISOString(),
      to: now.toISOString(),
      rows,
      trend,
      totals: {
        ...totals,
        progressPct: ProductivityService.progressPct(totals.completed, totals.assigned),
      },
    }
  }
}

function rangeStart(now: Date, range: ReportRange): Date {
  if (range === 'daily') return startOfBusinessDay(now)
  if (range === 'weekly') return new Date(startOfBusinessDay(now).getTime() - 6 * 86_400_000)
  const { year, month } = toLimaParts(now)
  return startOfBusinessDay(new Date(Date.UTC(year, month - 1, 1, 12)))
}
