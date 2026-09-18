import { beforeEach, describe, expect, it } from 'vitest'
import { GenerateMonthlyTasksUseCase } from '@/core/application/use-cases/generate-monthly-tasks'
import type {
  ClientRepository,
  CreateTaskInput,
  SunatScheduleRepository,
  TaskRepository,
  TemplateRecord,
  TemplateRepository,
} from '@/core/application/ports'
import { FixedClock } from '@/infrastructure/system-clock'
import { DueDateService } from '@/core/domain/services/due-date'

/**
 * Tests del job mensual con dobles en memoria.
 *
 * No hace falta Postgres para probar la regla de negocio, y eso es
 * precisamente lo que compra la arquitectura de puertos: el caso de uso
 * depende de interfaces, asi que aqui se le pasan implementaciones triviales.
 *
 * El doble de TaskRepository replica la restriccion unica real
 * (clientId + templateId + period) para que la prueba de idempotencia valga
 * algo: si el doble aceptara duplicados, el test pasaria y produccion fallaria.
 */

class FakeTaskRepo {
  readonly created: CreateTaskInput[] = []
  private readonly keys = new Set<string>()

  async createManyIgnoringDuplicates(inputs: CreateTaskInput[]): Promise<number> {
    let count = 0
    for (const input of inputs) {
      const key = `${input.clientId}|${input.templateId}|${input.period}`
      if (this.keys.has(key)) continue // el indice unico de la base
      this.keys.add(key)
      this.created.push(input)
      count++
    }
    return count
  }
}

function makeTemplate(overrides: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    id: 'tpl-1',
    name: 'Declaracion mensual',
    description: null,
    category: 'DECLARACION',
    recurrence: 'MENSUAL',
    priority: 'ALTA',
    active: true,
    dueDateRule: 'SUNAT_MONTHLY',
    dueDayOfMonth: null,
    fixedDueDate: null,
    appliesToRegimes: [],
    defaultAssigneeId: null,
    clientId: null,
    ...overrides,
  }
}

const CLIENTS = [
  { id: 'c1', rucLastDigit: 3, taxRegime: 'GENERAL' as const, accountantId: 'u-ana', businessName: 'Alfa' },
  { id: 'c2', rucLastDigit: 7, taxRegime: 'NRUS' as const, accountantId: 'u-luis', businessName: 'Beta' },
  { id: 'c3', rucLastDigit: 3, taxRegime: 'MYPE' as const, accountantId: null, businessName: 'Gamma' },
]

function buildUseCase(templates: TemplateRecord[], schedule = new Map<string, Date>()) {
  const taskRepo = new FakeTaskRepo()

  // Dobles parciales: el caso de uso solo llama a estos metodos, asi que
  // implementar el resto de la interfaz seria ruido. El cast pasa por
  // `unknown` porque TypeScript, con razon, avisa de que el objeto no cubre
  // toda la interfaz.
  const templateRepo = { listActive: async () => templates } as unknown as TemplateRepository
  const clientRepo = {
    listActiveForGeneration: async () => CLIENTS,
  } as unknown as ClientRepository
  const scheduleRepo = {
    getScheduleMap: async () => schedule,
  } as unknown as SunatScheduleRepository

  const useCase = new GenerateMonthlyTasksUseCase(
    templateRepo,
    clientRepo,
    taskRepo as unknown as TaskRepository,
    scheduleRepo,
    // Reloj fijo: los tests de fechas tienen que ser deterministas.
    new FixedClock(new Date('2026-10-05T12:00:00.000Z')),
  )

  return { useCase, taskRepo }
}

describe('GenerateMonthlyTasksUseCase', () => {
  let subject: ReturnType<typeof buildUseCase>

  beforeEach(() => {
    subject = buildUseCase([makeTemplate()])
  })

  it('genera una tarea por cliente activo', async () => {
    const summary = await subject.useCase.execute('2026-09', 'u-admin')

    expect(summary.created).toBe(3)
    expect(summary.period).toBe('2026-09')
    expect(subject.taskRepo.created).toHaveLength(3)
  })

  it('por defecto genera el periodo ANTERIOR al mes en curso', async () => {
    // El reloj esta en octubre: en octubre se declara setiembre.
    const summary = await subject.useCase.execute(undefined, 'u-admin')
    expect(summary.period).toBe('2026-09')
  })

  it('es idempotente: una segunda corrida no duplica nada', async () => {
    await subject.useCase.execute('2026-09', 'u-admin')
    const second = await subject.useCase.execute('2026-09', 'u-admin')

    expect(second.created).toBe(0)
    expect(second.skipped).toBe(3)
    expect(subject.taskRepo.created).toHaveLength(3)
  })

  it('respeta el filtro por regimen tributario', async () => {
    const { useCase, taskRepo } = buildUseCase([
      makeTemplate({ appliesToRegimes: ['GENERAL', 'MYPE'] }),
    ])
    const summary = await useCase.execute('2026-09', 'u-admin')

    expect(summary.created).toBe(2) // se excluye el cliente NRUS
    expect(taskRepo.created.map((t) => t.clientId).sort()).toEqual(['c1', 'c3'])
  })

  it('una plantilla de cliente unico solo alcanza a ese cliente', async () => {
    const { useCase, taskRepo } = buildUseCase([makeTemplate({ clientId: 'c2' })])
    await useCase.execute('2026-09', 'u-admin')

    expect(taskRepo.created).toHaveLength(1)
    expect(taskRepo.created[0]?.clientId).toBe('c2')
  })

  it('hereda el contador del cliente cuando la plantilla no fija responsable', async () => {
    await subject.useCase.execute('2026-09', 'u-admin')
    const byClient = new Map(subject.taskRepo.created.map((t) => [t.clientId, t.assigneeId]))

    expect(byClient.get('c1')).toBe('u-ana')
    expect(byClient.get('c2')).toBe('u-luis')
    expect(byClient.get('c3')).toBeNull() // sin contador asignado
  })

  it('el responsable por defecto de la plantilla gana sobre el contador del cliente', async () => {
    const { useCase, taskRepo } = buildUseCase([makeTemplate({ defaultAssigneeId: 'u-carla' })])
    await useCase.execute('2026-09', 'u-admin')

    expect(taskRepo.created.every((t) => t.assigneeId === 'u-carla')).toBe(true)
  })

  it('omite las plantillas trimestrales en un periodo que no cierra trimestre', async () => {
    const { useCase } = buildUseCase([makeTemplate({ recurrence: 'TRIMESTRAL' })])

    expect((await useCase.execute('2026-08', 'u-admin')).created).toBe(0)
    expect((await useCase.execute('2026-09', 'u-admin')).created).toBe(3) // setiembre si cierra
  })

  it('nunca expande plantillas de recurrencia unica', async () => {
    const { useCase } = buildUseCase([makeTemplate({ recurrence: 'UNICA' })])
    expect((await useCase.execute('2026-09', 'u-admin')).created).toBe(0)
  })

  it('avisa y estima cuando falta el cronograma SUNAT del periodo', async () => {
    const summary = await subject.useCase.execute('2026-09', 'u-admin')

    expect(summary.estimatedDueDates).toBe(3)
    expect(summary.warnings[0]).toContain('No hay cronograma SUNAT cargado')
  })

  it('usa la fecha oficial y no avisa cuando el cronograma esta cargado', async () => {
    const official = new Date('2026-10-19T04:59:59.000Z')
    const schedule = new Map([
      [DueDateService.scheduleKey('2026-09', 3), official],
      [DueDateService.scheduleKey('2026-09', 7), official],
    ])

    const { useCase, taskRepo } = buildUseCase([makeTemplate()], schedule)
    const summary = await useCase.execute('2026-09', 'u-admin')

    expect(summary.estimatedDueDates).toBe(0)
    expect(summary.warnings).toHaveLength(0)
    expect(taskRepo.created.every((t) => t.dueDate.getTime() === official.getTime())).toBe(true)
  })

  it('una plantilla mal configurada no aborta la generacion de las demas', async () => {
    const { useCase, taskRepo } = buildUseCase([
      makeTemplate(),
      // dueDayOfMonth ausente para la regla DAY_OF_MONTH: configuracion invalida.
      makeTemplate({ id: 'tpl-rota', name: 'Rota', dueDateRule: 'DAY_OF_MONTH', dueDayOfMonth: null }),
    ])

    const summary = await useCase.execute('2026-09', 'u-admin')

    expect(summary.created).toBe(3) // las de la plantilla sana si se crearon
    expect(summary.warnings.length).toBeGreaterThan(0)
    expect(summary.warnings.some((w) => w.includes('Rota'))).toBe(true)
    expect(taskRepo.created.every((t) => t.templateId === 'tpl-1')).toBe(true)
  })

  it('etiqueta las tareas con el periodo legible', async () => {
    await subject.useCase.execute('2026-09', 'u-admin')
    expect(subject.taskRepo.created[0]?.title).toBe('Declaracion mensual - Setiembre 2026')
  })
})
