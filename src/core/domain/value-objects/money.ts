import { ValidationError } from '../errors'

/**
 * Importe monetario.
 *
 * Se representa con BigInt en unidades minimas (centimos), NUNCA con `number`.
 *
 * El motivo no es purismo: en punto flotante `0.1 + 0.2 === 0.30000000000000004`.
 * Sumando cientos de comprobantes ese error se acumula y el libro deja de
 * cuadrar por centimos. Un Registro de Compras descuadrado es un libro
 * rechazado, y una base imponible mal redondeada es una declaracion mal
 * presentada. BigInt hace que la aritmetica sea exacta por construccion.
 *
 * Todas las operaciones devuelven instancias nuevas: un Money es inmutable.
 */

const SCALE = 2 // centimos
const SCALE_FACTOR = 100n

export type Currency = 'PEN' | 'USD'

export class Money {
  private constructor(
    /** Importe en unidades minimas. 1234n = S/ 12.34 */
    readonly cents: bigint,
    readonly currency: Currency,
  ) {}

  // -------------------------------------------------------------------------
  // Construccion
  // -------------------------------------------------------------------------

  static zero(currency: Currency = 'PEN'): Money {
    return new Money(0n, currency)
  }

  static fromCents(cents: bigint, currency: Currency = 'PEN'): Money {
    return new Money(cents, currency)
  }

  /**
   * Desde una cadena decimal: "1234.56".
   *
   * Es la via preferida al leer de la base (Prisma.Decimal.toString()) o de un
   * archivo importado: el valor nunca pasa por punto flotante.
   */
  static fromString(value: string, currency: Currency = 'PEN'): Money {
    const trimmed = value.trim().replace(/\s/g, '')
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new ValidationError(`Importe invalido: "${value}"`, { value })
    }

    const negative = trimmed.startsWith('-')
    const unsigned = negative ? trimmed.slice(1) : trimmed
    const [whole = '0', fraction = ''] = unsigned.split('.')

    // Se trunca al redondear la fraccion excedente, no se descarta en silencio.
    const padded = fraction.padEnd(SCALE + 1, '0')
    const keep = padded.slice(0, SCALE)
    const nextDigit = Number(padded[SCALE] ?? '0')

    let cents = BigInt(whole) * SCALE_FACTOR + BigInt(keep || '0')
    if (nextDigit >= 5) cents += 1n // redondeo comercial (media unidad hacia arriba)

    return new Money(negative ? -cents : cents, currency)
  }

  /**
   * Desde un `number`. Solo para entradas de la interfaz, donde el dato ya
   * viene de un input y su precision es la que es. Nunca para aritmetica
   * intermedia.
   */
  static fromNumber(value: number, currency: Currency = 'PEN'): Money {
    if (!Number.isFinite(value)) {
      throw new ValidationError(`Importe invalido: ${value}`, { value })
    }
    return Money.fromString(value.toFixed(SCALE), currency)
  }

  // -------------------------------------------------------------------------
  // Aritmetica
  // -------------------------------------------------------------------------

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.cents + other.cents, this.currency)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.cents - other.cents, this.currency)
  }

  negate(): Money {
    return new Money(-this.cents, this.currency)
  }

  abs(): Money {
    return new Money(this.cents < 0n ? -this.cents : this.cents, this.currency)
  }

  /**
   * Multiplica por una tasa expresada como cadena decimal ("0.18", "3.752").
   *
   * La tasa se escala a entero antes de operar, asi que el producto es exacto
   * y el unico redondeo ocurre al final, una sola vez. Multiplicar por un
   * `number` introduciria error antes de redondear.
   */
  multiplyByRate(rate: string, decimals = 6): Money {
    const scaled = scaleDecimal(rate, decimals)
    const divisor = 10n ** BigInt(decimals)
    return new Money(divideRoundHalfUp(this.cents * scaled, divisor), this.currency)
  }

  /** Divide por una tasa decimal. Util para despejar la base desde el total. */
  divideByRate(rate: string, decimals = 6): Money {
    const scaled = scaleDecimal(rate, decimals)
    if (scaled === 0n) throw new ValidationError('No se puede dividir entre cero')
    const multiplier = 10n ** BigInt(decimals)
    return new Money(divideRoundHalfUp(this.cents * multiplier, scaled), this.currency)
  }

  /**
   * Cadena de multiplicaciones y divisiones con UN SOLO redondeo al final.
   *
   * Encadenar `multiplyByRate()` redondea en cada paso y el error se acumula:
   * una hora extra calculada como (sueldo / 30 / 8) redondeado, por horas,
   * por 1.25, puede diferir en centimos del calculo directo
   * sueldo x horas x 1.25 / 240. En una planilla de cien trabajadores esa
   * diferencia se ve, y el trabajador la reclama.
   *
   * Aqui todo el producto se acumula en BigInt y solo se redondea al devolver.
   */
  compute(operations: { multiplyBy?: string[]; divideBy?: string[] }, decimals = 8): Money {
    const scale = 10n ** BigInt(decimals)

    let numerator = this.cents
    let denominator = 1n

    for (const factor of operations.multiplyBy ?? []) {
      numerator *= scaleDecimal(factor, decimals)
      denominator *= scale
    }
    for (const divisor of operations.divideBy ?? []) {
      const scaled = scaleDecimal(divisor, decimals)
      if (scaled === 0n) throw new ValidationError('No se puede dividir entre cero')
      numerator *= scale
      denominator *= scaled
    }

    return new Money(divideRoundHalfUp(numerator, denominator), this.currency)
  }

  /** Convierte a otra moneda aplicando un tipo de cambio. */
  convert(rate: string, target: Currency): Money {
    return new Money(this.multiplyByRate(rate).cents, target)
  }

  // -------------------------------------------------------------------------
  // Comparacion
  // -------------------------------------------------------------------------

  equals(other: Money): boolean {
    return this.currency === other.currency && this.cents === other.cents
  }

  isZero(): boolean {
    return this.cents === 0n
  }

  isNegative(): boolean {
    return this.cents < 0n
  }

  isPositive(): boolean {
    return this.cents > 0n
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other)
    return this.cents > other.cents
  }

  // -------------------------------------------------------------------------
  // Salida
  // -------------------------------------------------------------------------

  /** Cadena decimal plana: "1234.56". Es el formato que exige el PLE. */
  toString(): string {
    const negative = this.cents < 0n
    const absolute = negative ? -this.cents : this.cents
    const whole = absolute / SCALE_FACTOR
    const fraction = absolute % SCALE_FACTOR
    return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(SCALE, '0')}`
  }

  /** Para mostrar en pantalla: "S/ 1,234.56". */
  format(): string {
    const symbol = this.currency === 'PEN' ? 'S/' : 'US$'
    const [whole = '0', fraction = '00'] = this.toString().replace('-', '').split('.')
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return `${this.cents < 0n ? '-' : ''}${symbol} ${grouped}.${fraction}`
  }

  /**
   * `number` para serializar a JSON. Solo en el borde de salida: a partir de
   * aqui el valor ya no se usa para calcular.
   */
  toNumber(): number {
    return Number(this.toString())
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new ValidationError(
        `No se pueden operar importes de distinta moneda: ${this.currency} y ${other.currency}`,
      )
    }
  }

  /** Suma una lista. Devuelve cero si esta vacia. */
  static sum(items: Money[], currency: Currency = 'PEN'): Money {
    return items.reduce((acc, item) => acc.add(item), Money.zero(currency))
  }
}

/** Convierte "0.18" con 6 decimales a 180000n. */
function scaleDecimal(value: string, decimals: number): bigint {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new ValidationError(`Tasa invalida: "${value}"`, { value })
  }
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [whole = '0', fraction = ''] = unsigned.split('.')
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals)
  const scaled = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0')
  return negative ? -scaled : scaled
}

/**
 * Division entera con redondeo comercial (media unidad hacia arriba, en
 * valor absoluto). Es el criterio que usa SUNAT para el IGV.
 */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n
  const a = numerator < 0n ? -numerator : numerator
  const b = denominator < 0n ? -denominator : denominator

  const quotient = a / b
  const remainder = a % b
  const rounded = remainder * 2n >= b ? quotient + 1n : quotient

  return negative ? -rounded : rounded
}
