import { ValidationError } from '../errors'

/**
 * Periodo tributario en formato "YYYY-MM".
 *
 * Se eligio string y no Date a proposito: un periodo es un mes calendario,
 * no un instante. Guardarlo como Date obliga a decidir "que dia del mes" y
 * arrastra bugs de zona horaria (un `new Date('2026-09-01')` en UTC-5 puede
 * caer en agosto). Ademas "YYYY-MM" ordena lexicograficamente igual que
 * cronologicamente, asi que los indices y los rangos funcionan directo.
 */

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

export class TaxPeriod {
  private constructor(
    readonly year: number,
    readonly month: number, // 1-12
  ) {}

  static create(value: string): TaxPeriod {
    const match = PERIOD_RE.exec(value)
    if (!match) {
      throw new ValidationError('El periodo debe tener el formato YYYY-MM', { period: value })
    }
    return new TaxPeriod(Number(match[1]), Number(match[2]))
  }

  static fromParts(year: number, month: number): TaxPeriod {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new ValidationError('Anio de periodo fuera de rango', { year })
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError('Mes de periodo fuera de rango', { month })
    }
    return new TaxPeriod(year, month)
  }

  /** Periodo al que corresponde una fecha dada. */
  static fromDate(date: Date): TaxPeriod {
    return new TaxPeriod(date.getUTCFullYear(), date.getUTCMonth() + 1)
  }

  static isValid(value: string): boolean {
    return PERIOD_RE.test(value)
  }

  get value(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}`
  }

  /** Periodo anterior. El de setiembre se declara en octubre, etc. */
  previous(): TaxPeriod {
    return this.month === 1
      ? new TaxPeriod(this.year - 1, 12)
      : new TaxPeriod(this.year, this.month - 1)
  }

  next(): TaxPeriod {
    return this.month === 12
      ? new TaxPeriod(this.year + 1, 1)
      : new TaxPeriod(this.year, this.month + 1)
  }

  /** Solo los periodos de cierre trimestral (marzo, junio, setiembre, diciembre). */
  isQuarterEnd(): boolean {
    return this.month % 3 === 0
  }

  isYearEnd(): boolean {
    return this.month === 12
  }

  equals(other: TaxPeriod): boolean {
    return this.year === other.year && this.month === other.month
  }

  /** Etiqueta para la UI: "Setiembre 2026". */
  label(): string {
    const names = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ]
    return `${names[this.month - 1]} ${this.year}`
  }

  toString(): string {
    return this.value
  }
}
