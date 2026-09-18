import { ValidationError } from '../errors'

/**
 * RUC peruano: 11 digitos con digito verificador modulo 11.
 *
 * Validarlo aqui evita que un tipeo se propague hasta el cronograma de
 * vencimientos: el ultimo digito del RUC determina la fecha limite de todas
 * las declaraciones del cliente, asi que un RUC mal cargado desplaza fechas
 * reales.
 */

const RUC_LENGTH = 11
// Pesos oficiales del algoritmo de SUNAT para los 10 primeros digitos.
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

/** Prefijos validos de tipo de contribuyente. */
const VALID_PREFIXES = ['10', '15', '16', '17', '20'] as const

export class Ruc {
  private constructor(readonly value: string) {}

  static create(input: string): Ruc {
    const digits = input.replace(/\D/g, '')

    if (digits.length !== RUC_LENGTH) {
      throw new ValidationError(`El RUC debe tener ${RUC_LENGTH} digitos`, { ruc: input })
    }
    if (!VALID_PREFIXES.some((p) => digits.startsWith(p))) {
      throw new ValidationError(
        `El RUC debe empezar con uno de: ${VALID_PREFIXES.join(', ')}`,
        { ruc: input },
      )
    }
    if (!Ruc.hasValidCheckDigit(digits)) {
      throw new ValidationError('El digito verificador del RUC no es valido', { ruc: input })
    }
    return new Ruc(digits)
  }

  /** Valida sin lanzar. Util en importaciones masivas donde se acumulan errores. */
  static isValid(input: string): boolean {
    try {
      Ruc.create(input)
      return true
    } catch {
      return false
    }
  }

  private static hasValidCheckDigit(digits: string): boolean {
    let sum = 0
    for (let i = 0; i < WEIGHTS.length; i++) {
      // `digits` ya fue validado en longitud, pero noUncheckedIndexedAccess
      // obliga a ser explicitos.
      const digit = Number(digits[i])
      const weight = WEIGHTS[i]
      if (weight === undefined || Number.isNaN(digit)) return false
      sum += digit * weight
    }
    const remainder = 11 - (sum % 11)
    const expected = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder
    return expected === Number(digits[RUC_LENGTH - 1])
  }

  /**
   * Ultimo digito: discriminante del cronograma SUNAT.
   * Se denormaliza en la tabla `clients` porque se consulta en cada
   * generacion mensual de tareas (200+ clientes x N plantillas).
   */
  get lastDigit(): number {
    return Number(this.value[RUC_LENGTH - 1])
  }

  toString(): string {
    return this.value
  }
}
