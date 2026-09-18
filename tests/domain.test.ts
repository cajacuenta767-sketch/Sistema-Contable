import { describe, expect, it } from 'vitest'
import { Ruc } from '@/core/domain/value-objects/ruc'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'
import {
  DueDateService,
  daysBetween,
  lastDayOfMonth,
  toLimaParts,
} from '@/core/domain/services/due-date'
import { TaskStatusService } from '@/core/domain/services/task-status'
import { ProductivityService } from '@/core/domain/services/productivity'
import { Permissions } from '@/core/domain/services/permissions'
import { ValidationError, ConflictError, ForbiddenError } from '@/core/domain/errors'

/**
 * Tests del dominio.
 *
 * No tocan base de datos ni HTTP: son puras. Por eso corren en milisegundos y
 * se pueden ejecutar en cada guardado. Es la contraparte practica de haber
 * dejado el nucleo sin dependencias.
 */

describe('Ruc', () => {
  it('acepta un RUC con digito verificador correcto', () => {
    expect(Ruc.create('20100070970').value).toBe('20100070970')
    expect(Ruc.create('10421234561').value).toBe('10421234561')
  })

  it('rechaza un digito verificador incorrecto', () => {
    // Mismo RUC valido con el ultimo digito alterado.
    expect(() => Ruc.create('20100070971')).toThrow(ValidationError)
  })

  it('rechaza longitudes distintas de 11', () => {
    expect(() => Ruc.create('2010007097')).toThrow(ValidationError)
    expect(() => Ruc.create('201000709700')).toThrow(ValidationError)
  })

  it('rechaza prefijos que no corresponden a un tipo de contribuyente', () => {
    expect(() => Ruc.create('30100070970')).toThrow(ValidationError)
  })

  it('ignora separadores al normalizar', () => {
    expect(Ruc.create('20-100070970').value).toBe('20100070970')
  })

  it('expone el ultimo digito, que gobierna el cronograma SUNAT', () => {
    expect(Ruc.create('20100070970').lastDigit).toBe(0)
    expect(Ruc.create('20500001233').lastDigit).toBe(3)
  })
})

describe('TaxPeriod', () => {
  it('parsea y normaliza el formato YYYY-MM', () => {
    const period = TaxPeriod.create('2026-09')
    expect(period.year).toBe(2026)
    expect(period.month).toBe(9)
    expect(period.value).toBe('2026-09')
  })

  it('rechaza meses fuera de rango', () => {
    expect(() => TaxPeriod.create('2026-13')).toThrow(ValidationError)
    expect(() => TaxPeriod.create('2026-00')).toThrow(ValidationError)
    expect(() => TaxPeriod.create('202609')).toThrow(ValidationError)
  })

  it('cruza el cambio de anio hacia atras y hacia adelante', () => {
    expect(TaxPeriod.create('2026-01').previous().value).toBe('2025-12')
    expect(TaxPeriod.create('2026-12').next().value).toBe('2027-01')
  })

  it('identifica cierres de trimestre y de anio', () => {
    expect(TaxPeriod.create('2026-03').isQuarterEnd()).toBe(true)
    expect(TaxPeriod.create('2026-04').isQuarterEnd()).toBe(false)
    expect(TaxPeriod.create('2026-12').isYearEnd()).toBe(true)
  })
})

describe('DueDateService', () => {
  it('usa el cronograma oficial cuando existe', () => {
    const official = new Date('2026-10-16T04:59:59.000Z')
    const schedule = new Map([[DueDateService.scheduleKey('2026-09', 5), official]])

    const result = DueDateService.resolve({
      rule: 'SUNAT_MONTHLY',
      period: TaxPeriod.create('2026-09'),
      rucLastDigit: 5,
      sunatSchedule: schedule,
    })

    expect(result.dueDate).toEqual(official)
    expect(result.isEstimated).toBe(false)
  })

  it('marca la fecha como estimada cuando el cronograma no esta cargado', () => {
    const result = DueDateService.resolve({
      rule: 'SUNAT_MONTHLY',
      period: TaxPeriod.create('2026-09'),
      rucLastDigit: 5,
      sunatSchedule: new Map(),
    })

    // El periodo de setiembre vence en octubre: el mes SIGUIENTE.
    expect(result.dueDate.getUTCMonth() + 1).toBe(10)
    expect(result.isEstimated).toBe(true)
  })

  it('escalona el vencimiento estimado por ultimo digito de RUC', () => {
    const period = TaxPeriod.create('2026-09')
    const forDigit0 = DueDateService.approximateSunatDueDate(period, 0)
    const forDigit9 = DueDateService.approximateSunatDueDate(period, 9)
    expect(forDigit9.getTime()).toBeGreaterThan(forDigit0.getTime())
  })

  it('recorta el dia del mes al ultimo dia valido', () => {
    // Dia 31 aplicado a un periodo cuyo mes de presentacion es febrero.
    const result = DueDateService.resolve({
      rule: 'DAY_OF_MONTH',
      period: TaxPeriod.create('2026-01'), // se presenta en febrero
      dayOfMonth: 31,
    })

    // 2026 no es bisiesto: febrero tiene 28 dias.
    expect(lastDayOfMonth(2026, 2)).toBe(28)

    // La fecha se interpreta en el calendario de LIMA, no en UTC. El instante
    // guardado es el 1 de marzo 04:59:59Z, que en Lima sigue siendo el 28 de
    // febrero a las 23:59:59. Leer el mes en UTC daria marzo y haria creer que
    // el vencimiento se corrio: es justo el error que este diseno evita.
    const lima = toLimaParts(result.dueDate)
    expect(lima.month).toBe(2)
    expect(lima.day).toBe(28)
  })

  it('exige el ultimo digito para la regla SUNAT', () => {
    expect(() =>
      DueDateService.resolve({ rule: 'SUNAT_MONTHLY', period: TaxPeriod.create('2026-09') }),
    ).toThrow(ValidationError)
  })

  it('cuenta los dias segun el calendario de Lima, no el UTC', () => {
    // 23:00 hora de Lima del dia 15 (04:00Z del 16) sigue siendo el dia 15.
    const lateNightLima = new Date('2026-09-16T04:00:00.000Z')
    const nextMorningLima = new Date('2026-09-16T14:00:00.000Z')
    expect(daysBetween(lateNightLima, nextMorningLima)).toBe(1)
  })
})

describe('TaskStatusService', () => {
  it('permite el flujo normal de trabajo', () => {
    expect(TaskStatusService.canTransition('PENDIENTE', 'EN_PROCESO')).toBe(true)
    expect(TaskStatusService.canTransition('EN_PROCESO', 'EN_REVISION')).toBe(true)
    expect(TaskStatusService.canTransition('EN_REVISION', 'TERMINADA')).toBe(true)
  })

  it('bloquea saltos ilegales', () => {
    expect(TaskStatusService.canTransition('PENDIENTE', 'TERMINADA')).toBe(false)
    expect(() => TaskStatusService.assertTransition('PENDIENTE', 'TERMINADA', 'ADMIN')).toThrow(
      ConflictError,
    )
  })

  it('rechaza una transicion al mismo estado', () => {
    expect(() => TaskStatusService.assertTransition('EN_PROCESO', 'EN_PROCESO', 'ADMIN')).toThrow(
      ConflictError,
    )
  })

  it('impide que un asistente apruebe lo que esta en revision', () => {
    expect(() =>
      TaskStatusService.assertTransition('EN_REVISION', 'TERMINADA', 'ASISTENTE'),
    ).toThrow(ConflictError)
    expect(() =>
      TaskStatusService.assertTransition('EN_REVISION', 'TERMINADA', 'SUPERVISOR'),
    ).not.toThrow()
  })

  it('permite devolver una tarea observada y reabrir una terminada', () => {
    expect(TaskStatusService.canTransition('EN_REVISION', 'EN_PROCESO')).toBe(true)
    expect(TaskStatusService.canTransition('TERMINADA', 'EN_PROCESO')).toBe(true)
  })

  describe('estado derivado', () => {
    const now = new Date('2026-09-18T12:00:00.000Z')
    const past = new Date('2026-09-10T12:00:00.000Z')
    const future = new Date('2026-09-25T12:00:00.000Z')

    it('marca como atrasada una tarea abierta y vencida', () => {
      expect(TaskStatusService.derive('PENDIENTE', past, now)).toBe('ATRASADA')
      expect(TaskStatusService.derive('EN_PROCESO', past, now)).toBe('ATRASADA')
    })

    it('nunca marca como atrasada una tarea terminada', () => {
      // Aunque se haya cerrado tarde: ya esta cerrada, no es un pendiente.
      expect(TaskStatusService.derive('TERMINADA', past, now)).toBe('TERMINADA')
    })

    it('conserva el estado cuando aun no vence', () => {
      expect(TaskStatusService.derive('PENDIENTE', future, now)).toBe('PENDIENTE')
    })
  })
})

describe('ProductivityService', () => {
  it('calcula el avance como terminadas sobre asignadas', () => {
    expect(ProductivityService.progressPct(9, 10)).toBe(90)
    expect(ProductivityService.progressPct(1, 3)).toBe(33)
  })

  it('devuelve 100% cuando no hay tareas asignadas', () => {
    // Sin carga no hay nada pendiente: mostrar 0% castigaria a quien no tuvo
    // trabajo asignado ese dia.
    expect(ProductivityService.progressPct(0, 0)).toBe(100)
  })

  it('no supera el 100% aunque se cierren mas de las asignadas', () => {
    expect(ProductivityService.progressPct(12, 10)).toBe(100)
  })

  it('considera sobrecargado a quien tiene tareas atrasadas, aunque su carga sea baja', () => {
    const result = ProductivityService.evaluate({
      assigned: 5,
      completed: 4,
      overdue: 1,
      capacity: 40,
    })
    expect(result.level).toBe('sobrecargado')
  })

  it('escala el nivel segun la utilizacion', () => {
    // 5 abiertas sobre capacidad 40 = 13%.
    expect(
      ProductivityService.evaluate({ assigned: 10, completed: 5, overdue: 0, capacity: 40 }).level,
    ).toBe('ok')
    // 35 abiertas sobre 40 = 88%: por encima del 80% es carga alta.
    expect(
      ProductivityService.evaluate({ assigned: 40, completed: 5, overdue: 0, capacity: 40 }).level,
    ).toBe('alto')
    // 45 abiertas sobre 40 = 113%: por encima de su capacidad declarada.
    expect(
      ProductivityService.evaluate({ assigned: 50, completed: 5, overdue: 0, capacity: 40 }).level,
    ).toBe('sobrecargado')
  })

  it('evita dividir entre cero cuando la capacidad es cero', () => {
    expect(ProductivityService.utilizationPct(5, 0)).toBe(0)
  })
})

describe('Permissions', () => {
  it('da acceso total al administrador', () => {
    expect(Permissions.has('ADMIN', 'user:write')).toBe(true)
    expect(Permissions.has('ADMIN', 'audit:read')).toBe(true)
  })

  it('limita al asistente a lo suyo', () => {
    expect(Permissions.has('ASISTENTE', 'task:read:own')).toBe(true)
    expect(Permissions.has('ASISTENTE', 'task:read:all')).toBe(false)
    expect(Permissions.has('ASISTENTE', 'client:write')).toBe(false)
  })

  it('distingue quien ve toda la cartera', () => {
    expect(Permissions.canSeeEverything('SUPERVISOR')).toBe(true)
    expect(Permissions.canSeeEverything('CONTADOR')).toBe(false)
  })

  it('lanza ForbiddenError al exigir un permiso ausente', () => {
    const user = { id: 'u1', email: 'a@b.pe', fullName: 'Asistente', role: 'ASISTENTE' as const }
    expect(() => Permissions.assert(user, 'user:write')).toThrow(ForbiddenError)
  })
})
