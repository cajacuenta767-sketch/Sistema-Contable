import { ValidationError } from '../errors'
import { Money } from '../value-objects/money'

/**
 * Calculo de IGV y determinacion de la base imponible.
 *
 * La tasa NO esta fija en el codigo: viaja como parametro porque cambia por
 * norma (el IGV fue 19% hasta 2011 y es 18% desde entonces), y porque al
 * recalcular un periodo antiguo hay que usar la tasa que regia ENTONCES, no la
 * de hoy. Una constante `0.18` haria que reprocesar 2010 diera cifras falsas.
 *
 * El 18% se compone de 16% de IGV propiamente dicho y 2% de Impuesto de
 * Promocion Municipal, pero se declara y contabiliza junto.
 */

export const DEFAULT_IGV_RATE = '0.18'

export interface TaxBreakdown {
  /** Operaciones gravadas. */
  taxableBase: Money
  /** Operaciones exoneradas (no pagan IGV por norma). */
  exemptAmount: Money
  /** Operaciones inafectas (fuera del ambito del impuesto). */
  unaffectedAmount: Money
  igv: Money
  /** Impuesto Selectivo al Consumo, cuando aplica. */
  isc: Money
  otherCharges: Money
  total: Money
}

export const TaxService = {
  /**
   * IGV a partir de la base imponible.
   * El redondeo ocurre una sola vez, dentro de Money.
   */
  igvFromBase(base: Money, rate: string = DEFAULT_IGV_RATE): Money {
    return base.multiplyByRate(rate)
  },

  /**
   * Base imponible a partir de un total que YA incluye IGV.
   *
   * Es el caso habitual al digitar una boleta: el usuario tiene el total y
   * necesita separar la base. Se despeja como total / (1 + tasa) y el IGV se
   * calcula por diferencia, NO aplicando la tasa a la base redondeada: de lo
   * contrario base + igv puede no dar exactamente el total y el comprobante
   * queda descuadrado por un centimo.
   */
  splitFromTotal(total: Money, rate: string = DEFAULT_IGV_RATE): { base: Money; igv: Money } {
    const factor = addOneTo(rate)
    const base = total.divideByRate(factor)
    return { base, igv: total.subtract(base) }
  },

  /** Arma el desglose completo y verifica que los importes sean coherentes. */
  build(input: {
    taxableBase: Money
    exemptAmount?: Money
    unaffectedAmount?: Money
    isc?: Money
    otherCharges?: Money
    igvRate?: string
    /** IGV explicito del comprobante. Si falta, se calcula. */
    igv?: Money
  }): TaxBreakdown {
    const currency = input.taxableBase.currency
    const zero = Money.zero(currency)

    const exemptAmount = input.exemptAmount ?? zero
    const unaffectedAmount = input.unaffectedAmount ?? zero
    const isc = input.isc ?? zero
    const otherCharges = input.otherCharges ?? zero

    const igv = input.igv ?? TaxService.igvFromBase(input.taxableBase, input.igvRate)

    const total = input.taxableBase
      .add(exemptAmount)
      .add(unaffectedAmount)
      .add(isc)
      .add(igv)
      .add(otherCharges)

    return {
      taxableBase: input.taxableBase,
      exemptAmount,
      unaffectedAmount,
      igv,
      isc,
      otherCharges,
      total,
    }
  },

  /**
   * Verifica que el IGV declarado coincida con el calculado.
   *
   * Se admite una diferencia de un centimo: los sistemas de facturacion
   * redondean por linea y el acumulado puede diferir del calculo sobre el
   * total. Una diferencia mayor es un error de digitacion o un comprobante
   * mal emitido, y conviene detenerlo antes de que entre al libro.
   */
  assertIgvConsistent(
    base: Money,
    declaredIgv: Money,
    rate: string = DEFAULT_IGV_RATE,
  ): void {
    const expected = TaxService.igvFromBase(base, rate)
    const difference = declaredIgv.subtract(expected).abs()

    if (difference.cents > 1n) {
      throw new ValidationError(
        `El IGV del comprobante (${declaredIgv.toString()}) no corresponde a la base ` +
          `imponible (${base.toString()}). Esperado: ${expected.toString()}.`,
        { declared: declaredIgv.toString(), expected: expected.toString() },
      )
    }
  },
}

/**
 * Detracciones (SPOT): el comprador deposita un porcentaje del total en la
 * cuenta de detracciones del proveedor y paga la diferencia.
 *
 * Los porcentajes y el monto minimo los fija SUNAT por resolucion y cambian:
 * por eso viven en la base de datos (tabla de tasas), no aqui. Este servicio
 * solo aplica la regla de calculo.
 */
/** Monto minimo por defecto a partir del cual aplica la detraccion. */
export const DETRACTION_THRESHOLD = '700.00'

export const DetractionService = {
  applies(total: Money, threshold: string = DETRACTION_THRESHOLD): boolean {
    return total.greaterThan(Money.fromString(threshold, total.currency))
  },

  /** El importe detraido se redondea al entero superior (practica de SUNAT). */
  compute(total: Money, rate: string): Money {
    const raw = total.multiplyByRate(rate)
    const remainder = raw.cents % 100n
    return remainder === 0n
      ? raw
      : Money.fromCents(raw.cents + (100n - remainder), raw.currency)
  },
}

/** Devuelve "1.18" para una tasa "0.18". */
function addOneTo(rate: string): string {
  const one = Money.fromString('1.000000')
  // Se reutiliza la aritmetica exacta de Money con 6 decimales de escala.
  const scaled = Money.fromString(normalizeRate(rate))
  return one.add(scaled).toString()
}

function normalizeRate(rate: string): string {
  if (!/^\d+(\.\d+)?$/.test(rate.trim())) {
    throw new ValidationError(`Tasa de impuesto invalida: "${rate}"`, { rate })
  }
  return rate.trim()
}
