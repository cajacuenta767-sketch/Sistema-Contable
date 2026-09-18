import { ValidationError } from '../errors'
import { TaxPeriod } from '../value-objects/tax-period'
import type { DueDateRule } from '../types'

/**
 * Calculo de fechas limite.
 *
 * Regla de oro: TODO se guarda en UTC, pero la fecha limite representa el
 * *final del dia habil en Lima*. Se normaliza a las 23:59:59 hora de Lima
 * (UTC-5, sin horario de verano) para que una tarea que vence "el 15" no
 * aparezca vencida a las 19:00 del 14 por un desfase de zona horaria. Ese
 * bug es clasico y aqui cuesta multas.
 */

/** Peru no aplica horario de verano: el offset es constante. */
const LIMA_UTC_OFFSET_HOURS = 5

/** Fin del dia en Lima expresado como instante UTC. */
export function endOfBusinessDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 23 + LIMA_UTC_OFFSET_HOURS, 59, 59, 0))
}

/** Inicio del dia en Lima expresado como instante UTC. */
export function startOfBusinessDay(date: Date): Date {
  const lima = toLimaParts(date)
  return new Date(Date.UTC(lima.year, lima.month - 1, lima.day, LIMA_UTC_OFFSET_HOURS, 0, 0, 0))
}

/** Descompone un instante UTC en las partes de calendario que ve Lima. */
export function toLimaParts(date: Date): { year: number; month: number; day: number } {
  const shifted = new Date(date.getTime() - LIMA_UTC_OFFSET_HOURS * 3_600_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000
  const a = startOfBusinessDay(from).getTime()
  const b = startOfBusinessDay(to).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}

/** Ultimo dia del mes; evita generar un 31 de febrero. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export interface DueDateInput {
  rule: DueDateRule
  period: TaxPeriod
  /** Ultimo digito del RUC. Requerido por SUNAT_MONTHLY. */
  rucLastDigit?: number
  /** Dia del mes siguiente al periodo. Requerido por DAY_OF_MONTH. */
  dayOfMonth?: number | null
  /** Requerido por FIXED_DATE. */
  fixedDate?: Date | null
  /**
   * Cronograma oficial cargado en base de datos, indexado por
   * `${period}:${lastDigit}`. Si falta la entrada se usa el fallback.
   */
  sunatSchedule?: ReadonlyMap<string, Date>
}

export const DueDateService = {
  scheduleKey(period: string, lastDigit: number): string {
    return `${period}:${lastDigit}`
  },

  /**
   * Fallback cuando el cronograma oficial del periodo todavia no se cargo.
   *
   * Aproxima la practica de SUNAT: los vencimientos caen en la segunda
   * quincena del mes SIGUIENTE al periodo, escalonados por ultimo digito de
   * RUC. NO es el cronograma oficial y no debe usarse para declarar: sirve
   * para que el estudio vea una fecha tentativa y no se quede sin planificar.
   * El caso de uso marca estas tareas para que la UI las muestre como
   * "fecha estimada".
   */
  approximateSunatDueDate(period: TaxPeriod, rucLastDigit: number): Date {
    if (!Number.isInteger(rucLastDigit) || rucLastDigit < 0 || rucLastDigit > 9) {
      throw new ValidationError('El ultimo digito del RUC debe estar entre 0 y 9', { rucLastDigit })
    }
    const filing = period.next() // se declara el mes siguiente
    // Digito 0 -> 14, 1 -> 15, ... 9 -> 23 (aproximacion escalonada).
    const day = Math.min(14 + rucLastDigit, lastDayOfMonth(filing.year, filing.month))
    return endOfBusinessDay(filing.year, filing.month, day)
  },

  /** Resuelve la fecha limite segun la regla de la plantilla. */
  resolve(input: DueDateInput): { dueDate: Date; isEstimated: boolean } {
    switch (input.rule) {
      case 'SUNAT_MONTHLY': {
        const { rucLastDigit, period, sunatSchedule } = input
        if (rucLastDigit === undefined) {
          throw new ValidationError('SUNAT_MONTHLY requiere el ultimo digito del RUC')
        }
        const official = sunatSchedule?.get(DueDateService.scheduleKey(period.value, rucLastDigit))
        if (official) return { dueDate: official, isEstimated: false }
        return {
          dueDate: DueDateService.approximateSunatDueDate(period, rucLastDigit),
          isEstimated: true,
        }
      }

      case 'DAY_OF_MONTH': {
        const day = input.dayOfMonth
        if (!day || day < 1 || day > 31) {
          throw new ValidationError('DAY_OF_MONTH requiere un dia entre 1 y 31', { day })
        }
        const filing = input.period.next()
        const safeDay = Math.min(day, lastDayOfMonth(filing.year, filing.month))
        return { dueDate: endOfBusinessDay(filing.year, filing.month, safeDay), isEstimated: false }
      }

      case 'FIXED_DATE': {
        if (!input.fixedDate) {
          throw new ValidationError('FIXED_DATE requiere una fecha')
        }
        return { dueDate: input.fixedDate, isEstimated: false }
      }
    }
  },
}
