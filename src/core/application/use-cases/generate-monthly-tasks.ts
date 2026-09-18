import { DueDateService } from '@/core/domain/services/due-date'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'
import type { Recurrence } from '@/core/domain/types'
import type {
  ClientRepository,
  Clock,
  CreateTaskInput,
  SunatScheduleRepository,
  TaskRepository,
  TemplateRepository,
} from '../ports'

/**
 * Expansion de plantillas recurrentes en tareas concretas.
 *
 * Es el proceso que hace util al sistema: 200 clientes x 5 obligaciones = 1000
 * tareas que nadie va a cargar a mano cada mes.
 *
 * Tres propiedades no negociables:
 *
 *  1. IDEMPOTENTE. Se puede correr diez veces el mismo dia sin duplicar nada.
 *     Lo garantiza el indice unico (clientId, templateId, period) en la base,
 *     no un `if` en el codigo: dos ejecuciones simultaneas del cron no pueden
 *     ganarle a una restriccion de integridad, pero si a un chequeo previo.
 *
 *  2. EN LOTE. Un INSERT masivo, no 1000 inserts. Con 1000 tareas la version
 *     fila-por-fila tarda minutos y mantiene una transaccion abierta todo ese
 *     tiempo.
 *
 *  3. SIN N+1. El cronograma SUNAT se carga UNA vez como Map y se consulta en
 *     memoria. La version ingenua consulta la fecha por cada cliente: 1000
 *     consultas identicas.
 */

export interface GenerationSummary {
  period: string
  created: number
  skipped: number
  templatesEvaluated: number
  clientsEvaluated: number
  /** Tareas cuya fecha limite es estimada por falta de cronograma oficial. */
  estimatedDueDates: number
  warnings: string[]
}

export class GenerateMonthlyTasksUseCase {
  constructor(
    private readonly templates: TemplateRepository,
    private readonly clients: ClientRepository,
    private readonly tasks: TaskRepository,
    private readonly schedule: SunatScheduleRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * @param periodValue Periodo tributario "YYYY-MM". Por defecto, el mes
   *   anterior al actual: en octubre se generan las obligaciones de setiembre.
   * @param actorId Usuario al que se atribuye la creacion (el admin del cron).
   */
  async execute(periodValue: string | undefined, actorId: string): Promise<GenerationSummary> {
    const period = periodValue
      ? TaxPeriod.create(periodValue)
      : TaxPeriod.fromDate(this.clock.now()).previous()

    const warnings: string[] = []

    // Tres cargas independientes -> en paralelo.
    const [templates, clients, scheduleMap] = await Promise.all([
      this.templates.listActive(),
      this.clients.listActiveForGeneration(),
      this.schedule.getScheduleMap(period.value),
    ])

    if (scheduleMap.size === 0) {
      warnings.push(
        `No hay cronograma SUNAT cargado para ${period.value}. ` +
          'Las fechas limite seran estimadas y deben corregirse al publicarse la resolucion.',
      )
    }

    const applicable = templates.filter((t) => appliesToPeriod(t.recurrence, period))
    const clientsById = new Map(clients.map((c) => [c.id, c]))

    const inputs: CreateTaskInput[] = []
    let estimatedDueDates = 0

    for (const template of applicable) {
      // Plantilla de un solo cliente vs. plantilla global.
      const targets = template.clientId
        ? [clientsById.get(template.clientId)].filter(isDefined)
        : clients.filter(
            (c) =>
              template.appliesToRegimes.length === 0 ||
              template.appliesToRegimes.includes(c.taxRegime),
          )

      for (const client of targets) {
        let resolved
        try {
          resolved = DueDateService.resolve({
            rule: template.dueDateRule,
            period,
            rucLastDigit: client.rucLastDigit,
            dayOfMonth: template.dueDayOfMonth,
            fixedDate: template.fixedDueDate,
            sunatSchedule: scheduleMap,
          })
        } catch (error) {
          // Una plantilla mal configurada no puede abortar la generacion de
          // las otras 999 tareas. Se reporta y se sigue.
          warnings.push(
            `Plantilla "${template.name}" omitida para ${client.businessName}: ${
              error instanceof Error ? error.message : 'error desconocido'
            }`,
          )
          continue
        }

        if (resolved.isEstimated) estimatedDueDates++

        inputs.push({
          title: `${template.name} - ${period.label()}`,
          description: template.description,
          category: template.category,
          priority: template.priority,
          period: period.value,
          dueDate: resolved.dueDate,
          clientId: client.id,
          // Si la plantilla no fija responsable, hereda el contador del cliente.
          assigneeId: template.defaultAssigneeId ?? client.accountantId,
          createdById: actorId,
          templateId: template.id,
        })
      }
    }

    const created = inputs.length > 0 ? await this.tasks.createManyIgnoringDuplicates(inputs) : 0

    return {
      period: period.value,
      created,
      skipped: inputs.length - created, // ya existian: la corrida fue idempotente
      templatesEvaluated: applicable.length,
      clientsEvaluated: clients.length,
      estimatedDueDates,
      warnings,
    }
  }
}

/** Una plantilla trimestral solo aplica en marzo/junio/setiembre/diciembre. */
function appliesToPeriod(recurrence: Recurrence, period: TaxPeriod): boolean {
  switch (recurrence) {
    case 'MENSUAL':
      return true
    case 'TRIMESTRAL':
      return period.isQuarterEnd()
    case 'ANUAL':
      return period.isYearEnd()
    case 'UNICA':
      return false // se crean a mano, no las expande el job
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}
