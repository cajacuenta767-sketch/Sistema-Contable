import { ValidationError } from '../errors'
import { Money } from '../value-objects/money'

/**
 * Parametros normativos de la planilla.
 *
 * Ninguno esta fijo en el codigo. Todos cambian por norma —la UIT y la
 * remuneracion minima cada pocos anios, las comisiones de AFP varias veces al
 * anio— y, sobre todo, recalcular una planilla de hace seis meses exige los
 * valores que regian ENTONCES. Constantes en el codigo harian que reprocesar
 * el pasado diera cifras distintas a las que se pagaron, que es exactamente
 * lo que una fiscalizacion detecta.
 *
 * Por eso viajan como parametro en cada calculo y viven en base de datos.
 */

export interface IncomeTaxBracket {
  /** Limite superior del tramo, expresado en UIT. `null` = sin limite. */
  upToUit: number | null
  /** Tasa como cadena decimal: "0.08". */
  rate: string
}

export interface PayrollParameters {
  year: number
  /** Unidad Impositiva Tributaria del ejercicio. */
  uit: Money
  /** Remuneracion minima vital. */
  minimumWage: Money
  /** Aporte del empleador a EsSalud, normalmente "0.09". */
  essaludRate: string
  /** Seguro complementario de trabajo de riesgo. */
  sctrRate: string
  /** Tramos de renta de quinta categoria. */
  incomeTaxBrackets: IncomeTaxBracket[]
  /** Deduccion fija de la renta de quinta, en UIT (historicamente 7). */
  incomeTaxDeductionUit: number
}

export interface PensionParameters {
  system: 'ONP' | 'AFP'
  afpCode?: string | null
  afpName?: string | null
  /** Aporte obligatorio al fondo: ONP "0.13", AFP "0.10". */
  contributionRate: string
  /** Comision sobre el flujo (solo AFP). */
  commissionFlowRate?: string | null
  /** Comision mixta sobre el flujo (solo AFP, modalidad mixta). */
  commissionMixedRate?: string | null
  /** Prima del seguro previsional (solo AFP). */
  insuranceRate?: string | null
  /** Tope de remuneracion asegurable sobre el que se calcula la prima. */
  insuranceCap?: Money | null
}

export function assertParameters(parameters: PayrollParameters): void {
  if (parameters.incomeTaxBrackets.length === 0) {
    throw new ValidationError(
      `No hay tramos de renta de quinta categoria cargados para el anio ${parameters.year}`,
    )
  }
  if (parameters.uit.isZero()) {
    throw new ValidationError(`No hay UIT cargada para el anio ${parameters.year}`)
  }
}
