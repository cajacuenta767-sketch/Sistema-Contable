import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  DashboardMetrics,
  MetricsRepository,
  StaffProgress,
} from '@/core/application/ports'
import type { Role } from '@/core/domain/types'

/**
 * Agregaciones del dashboard en SQL crudo.
 *
 * Por que no el query builder de Prisma: los KPIs de la cabecera son siete
 * conteos sobre la MISMA tabla con distintos filtros. Con Prisma serian siete
 * `count()`, es decir siete escaneos. Con `COUNT(*) FILTER (WHERE ...)` de
 * Postgres es UN solo escaneo que resuelve los siete. Con ~12.000 tareas al
 * anio la diferencia ya se nota; a tres anios de operacion es la diferencia
 * entre un dashboard instantaneo y uno que tarda segundos.
 *
 * Todas las consultas usan parametros ($1, $2...) via Prisma.sql: no hay
 * concatenacion de strings y por lo tanto no hay superficie de inyeccion SQL.
 */

/** Offset fijo de Lima. Define donde corta "el dia" en el grafico de tendencia. */
const LIMA_OFFSET = Prisma.sql`interval '5 hours'`

export class PrismaMetricsRepository implements MetricsRepository {
  constructor(private readonly db: PrismaClient) {}

  async dashboard(scope: { assigneeId?: string }, now: Date): Promise<DashboardMetrics> {
    const scopeFilter = scope.assigneeId
      ? Prisma.sql`WHERE "assigneeId" = ${scope.assigneeId}`
      : Prisma.empty

    const [taskRows, clientRows] = await Promise.all([
      this.db.$queryRaw<
        {
          total: number
          completed: number
          pending: number
          in_progress: number
          in_review: number
          overdue: number
          pending_on_time: number
          in_progress_on_time: number
          in_review_on_time: number
        }[]
      >`
        SELECT
          COUNT(*)::int                                                       AS total,
          COUNT(*) FILTER (WHERE status = 'TERMINADA')::int                   AS completed,
          COUNT(*) FILTER (WHERE status = 'PENDIENTE')::int                   AS pending,
          COUNT(*) FILTER (WHERE status = 'EN_PROCESO')::int                  AS in_progress,
          COUNT(*) FILTER (WHERE status = 'EN_REVISION')::int                 AS in_review,
          COUNT(*) FILTER (
            WHERE status <> 'TERMINADA' AND "dueDate" < ${now}
          )::int                                                              AS overdue,
          -- Conteos disjuntos para el grafico: cada estado abierto SIN sus
          -- vencidas, que se agrupan aparte en "overdue".
          COUNT(*) FILTER (
            WHERE status = 'PENDIENTE'  AND "dueDate" >= ${now}
          )::int                                                              AS pending_on_time,
          COUNT(*) FILTER (
            WHERE status = 'EN_PROCESO' AND "dueDate" >= ${now}
          )::int                                                              AS in_progress_on_time,
          COUNT(*) FILTER (
            WHERE status = 'EN_REVISION' AND "dueDate" >= ${now}
          )::int                                                              AS in_review_on_time
        FROM tasks
        ${scopeFilter}
      `,
      // La cartera de clientes no depende del alcance del usuario en la
      // cabecera: es el tamanio del estudio.
      this.db.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM clients WHERE status = 'ACTIVE'
      `,
    ])

    const t = taskRows[0]
    return {
      clients: clientRows[0]?.count ?? 0,
      totalTasks: t?.total ?? 0,
      completedTasks: t?.completed ?? 0,
      pendingTasks: t?.pending ?? 0,
      inProgressTasks: t?.in_progress ?? 0,
      inReviewTasks: t?.in_review ?? 0,
      overdueTasks: t?.overdue ?? 0,
      pendingOnTime: t?.pending_on_time ?? 0,
      inProgressOnTime: t?.in_progress_on_time ?? 0,
      inReviewOnTime: t?.in_review_on_time ?? 0,
    }
  }

  /**
   * Avance por trabajador.
   *
   * Definiciones (importan, porque el porcentaje se muestra como verdad):
   *  - asignadas: tareas del trabajador que siguen abiertas MAS las que cerro
   *    dentro del rango. Es "la carga que tuvo en el periodo", no el historico
   *    completo, que haria que el porcentaje solo suba con el tiempo.
   *  - terminadas: cerradas dentro del rango.
   *  - atrasadas: abiertas con fecha limite ya pasada, sin importar el rango.
   */
  async staffProgress(range: { from: Date; to: Date }, now: Date): Promise<StaffProgress[]> {
    const rows = await this.db.$queryRaw<
      {
        userId: string
        fullName: string
        role: Role
        capacity: number
        assigned: number
        completed: number
        overdue: number
      }[]
    >`
      SELECT
        u.id         AS "userId",
        u."fullName" AS "fullName",
        u.role       AS role,
        u.capacity   AS capacity,
        COUNT(t.id) FILTER (
          WHERE t.status <> 'TERMINADA'
             OR (t."completedAt" >= ${range.from} AND t."completedAt" <= ${range.to})
        )::int AS assigned,
        COUNT(t.id) FILTER (
          WHERE t."completedAt" >= ${range.from} AND t."completedAt" <= ${range.to}
        )::int AS completed,
        COUNT(t.id) FILTER (
          WHERE t.status <> 'TERMINADA' AND t."dueDate" < ${now}
        )::int AS overdue
      FROM users u
      LEFT JOIN tasks t ON t."assigneeId" = u.id
      WHERE u.status = 'ACTIVE' AND u.role <> 'ADMIN'
      GROUP BY u.id, u."fullName", u.role, u.capacity
      ORDER BY u."fullName" ASC
    `
    return rows
  }

  async completionTrend(
    range: { from: Date; to: Date },
    scope: { assigneeId?: string },
  ): Promise<{ date: string; count: number }[]> {
    const scopeFilter = scope.assigneeId
      ? Prisma.sql`AND "assigneeId" = ${scope.assigneeId}`
      : Prisma.empty

    // Se agrupa por dia LOCAL (Lima), no por dia UTC: si no, todo lo cerrado
    // despues de las 19:00 hora peruana contaria como del dia siguiente.
    return this.db.$queryRaw<{ date: string; count: number }[]>`
      SELECT
        to_char(date_trunc('day', "completedAt" - ${LIMA_OFFSET}), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count
      FROM tasks
      WHERE "completedAt" IS NOT NULL
        AND "completedAt" >= ${range.from}
        AND "completedAt" <= ${range.to}
        ${scopeFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `
  }
}
