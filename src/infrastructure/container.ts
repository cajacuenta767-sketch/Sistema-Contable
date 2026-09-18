import { prisma } from './db/prisma'
import { getEnv } from './config/env'
import { BcryptHasher } from './auth/bcrypt-hasher'
import { JwtTokenService } from './auth/jwt-token-service'
import { SystemClock } from './system-clock'
import { PrismaClientRepository } from './repositories/prisma-client.repository'
import { PrismaMetricsRepository } from './repositories/prisma-metrics.repository'
import { PrismaTaskRepository } from './repositories/prisma-task.repository'
import { PrismaUserRepository } from './repositories/prisma-user.repository'
import {
  PrismaAccountRepository,
  PrismaAccountingPeriodRepository,
  PrismaJournalRepository,
  PrismaPleExportRepository,
  PrismaTaxDocumentRepository,
  PrismaTaxReturnRepository,
} from './repositories/prisma-accounting.repositories'
import {
  PrismaEmployeeRepository,
  PrismaPayrollRunRepository,
  PrismaPensionRateRepository,
  PrismaTaxParameterRepository,
} from './repositories/prisma-payroll.repositories'
import {
  PrismaAuditLogRepository,
  PrismaNotificationRepository,
  PrismaSunatScheduleRepository,
  PrismaTemplateRepository,
} from './repositories/prisma-support.repositories'
import { AuthUseCases } from '@/core/application/use-cases/auth'
import { ClientUseCases } from '@/core/application/use-cases/clients'
import { DashboardUseCases } from '@/core/application/use-cases/dashboard'
import { GenerateDueAlertsUseCase } from '@/core/application/use-cases/alerts'
import { GenerateMonthlyTasksUseCase } from '@/core/application/use-cases/generate-monthly-tasks'
import { NotificationUseCases } from '@/core/application/use-cases/notifications'
import { TaskUseCases } from '@/core/application/use-cases/tasks'
import { TemplateUseCases } from '@/core/application/use-cases/templates'
import { UserUseCases } from '@/core/application/use-cases/users'
import { AccountingUseCases } from '@/core/application/use-cases/accounting'
import { AccountingReportsUseCases } from '@/core/application/use-cases/accounting-reports'
import { PayrollUseCases } from '@/core/application/use-cases/payroll'

/**
 * Raiz de composicion: el UNICO lugar donde se decide que implementacion
 * concreta recibe cada caso de uso.
 *
 * Cambiar Prisma por otro ORM, o bcrypt por argon2, se hace aqui y en ningun
 * otro archivo. Los casos de uso jamas importan `prisma`.
 *
 * Se construye perezosamente y se cachea en el objeto global por el mismo
 * motivo que el cliente de Prisma: el hot-reload de Next reevalua modulos.
 *
 * A proposito NO lleva `import 'server-only'`: este modulo tambien lo cargan
 * los scripts de linea de comandos (scripts/generate-monthly-tasks.ts), que
 * corren en Node puro y no en el empaquetador de Next. La guardia contra el
 * uso desde el cliente vive donde corresponde: en `src/lib/session.ts`, que
 * es lo unico que un componente podria importar por error.
 */

function build() {
  const env = getEnv()

  const clock = new SystemClock()
  const hasher = new BcryptHasher()
  const tokens = new JwtTokenService(env.AUTH_SECRET)

  const users = new PrismaUserRepository(prisma)
  const clients = new PrismaClientRepository(prisma)
  const tasks = new PrismaTaskRepository(prisma)
  const templates = new PrismaTemplateRepository(prisma)
  const schedule = new PrismaSunatScheduleRepository(prisma)
  const notifications = new PrismaNotificationRepository(prisma)
  const audit = new PrismaAuditLogRepository(prisma)
  const metrics = new PrismaMetricsRepository(prisma)

  // Fase 2 - contabilidad
  const accounts = new PrismaAccountRepository(prisma)
  const taxDocuments = new PrismaTaxDocumentRepository(prisma)
  const journal = new PrismaJournalRepository(prisma)
  const accountingPeriods = new PrismaAccountingPeriodRepository(prisma)
  const taxReturns = new PrismaTaxReturnRepository(prisma)
  const pleExports = new PrismaPleExportRepository(prisma)

  // Fase 3 - planillas
  const employees = new PrismaEmployeeRepository(prisma)
  const payrollRuns = new PrismaPayrollRunRepository(prisma)
  const taxParameters = new PrismaTaxParameterRepository(prisma)
  const pensionRates = new PrismaPensionRateRepository(prisma)

  return {
    env,
    clock,
    auth: new AuthUseCases(users, hasher, tokens, env.SESSION_TTL_SECONDS),
    clients: new ClientUseCases(clients, audit, clock),
    tasks: new TaskUseCases(tasks, notifications, audit, clock),
    dashboard: new DashboardUseCases(metrics, tasks, clock),
    notifications: new NotificationUseCases(notifications),
    templates: new TemplateUseCases(templates, audit),
    accounting: new AccountingUseCases(
      accounts,
      taxDocuments,
      journal,
      accountingPeriods,
      audit,
      clock,
    ),
    accountingReports: new AccountingReportsUseCases(
      journal,
      taxDocuments,
      clients,
      taxReturns,
      pleExports,
      audit,
      clock,
    ),
    payroll: new PayrollUseCases(
      employees,
      payrollRuns,
      taxParameters,
      pensionRates,
      journal,
      accounts,
      accountingPeriods,
      clients,
      audit,
    ),
    users: new UserUseCases(users, hasher, audit),
    /**
     * Actor al que se atribuyen las acciones de los jobs automaticos.
     * Se usa el primer administrador activo: la auditoria siempre queda
     * ligada a una persona real y responsable del estudio.
     */
    async resolveSystemActorId(): Promise<string | null> {
      const admin = await prisma.user.findFirst({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      return admin?.id ?? null
    },
    jobs: {
      generateMonthlyTasks: new GenerateMonthlyTasksUseCase(
        templates,
        clients,
        tasks,
        schedule,
        clock,
      ),
      generateDueAlerts: new GenerateDueAlertsUseCase(tasks, notifications, clock),
    },
  }
}

export type Container = ReturnType<typeof build>

const globalForContainer = globalThis as unknown as { container?: Container }

export function getContainer(): Container {
  if (!globalForContainer.container) globalForContainer.container = build()
  return globalForContainer.container
}
