import { ValidationError } from '../errors'
import { Money } from '../value-objects/money'
import {
  assertParameters,
  type PayrollParameters,
  type PensionParameters,
} from './parameters'

/**
 * Calculo de una boleta de pago.
 *
 * Todo el resultado incluye un `breakdown` con cada paso intermedio. No es
 * decoracion: cuando un trabajador reclama su boleta o SUNAFIL pide el
 * sustento, hay que poder mostrar de donde sale cada cifra. Un calculo que
 * solo devuelve el neto es un calculo que no se puede defender.
 */

export interface PayslipInput {
  employee: {
    fullName: string
    basicSalary: Money
    /** Asignacion familiar: 10% de la remuneracion minima. */
    hasFamilyAllowance: boolean
    highRisk: boolean
    pension: PensionParameters
  }
  workedDays: number
  absentDays: number
  /** Horas extras con recargo del 25% (las dos primeras de cada dia). */
  overtimeHours25: number
  /** Horas extras con recargo del 35% (a partir de la tercera). */
  overtimeHours35: number
  bonuses: Money
  otherDeductions: Money
  /**
   * Renta de quinta ya retenida en el ejercicio, para no volver a
   * descontarla al proyectar.
   */
  incomeTaxWithheldToDate: Money
  /** Mes del periodo (1-12). Define cuantos meses quedan por proyectar. */
  month: number
  parameters: PayrollParameters
}

export interface PayslipResult {
  earnings: {
    basicPay: Money
    familyAllowance: Money
    overtimePay: Money
    bonuses: Money
    gross: Money
  }
  deductions: {
    pensionContribution: Money
    pensionCommission: Money
    pensionInsurance: Money
    incomeTax5th: Money
    other: Money
    total: Money
  }
  employer: {
    essalud: Money
    sctr: Money
    total: Money
  }
  netPay: Money
  breakdown: Record<string, string>
  warnings: string[]
}

/** Jornada legal peruana: 30 dias al mes, 8 horas al dia. */
const DAYS_PER_MONTH = 30
const HOURS_PER_DAY = 8

/** Gratificaciones de julio y diciembre: dos sueldos adicionales al anio. */
const BONUS_MONTHS = 2

export const PayslipService = {
  compute(input: PayslipInput): PayslipResult {
    assertParameters(input.parameters)

    const warnings: string[] = []
    const breakdown: Record<string, string> = {}
    const zero = Money.zero()

    // -----------------------------------------------------------------------
    // Ingresos
    // -----------------------------------------------------------------------

    if (input.workedDays < 0 || input.workedDays > DAYS_PER_MONTH) {
      throw new ValidationError(
        `Los dias trabajados deben estar entre 0 y ${DAYS_PER_MONTH}`,
        { workedDays: input.workedDays },
      )
    }

    // El sueldo se prorratea por dias efectivamente laborados.
    //
    // El prorrateo se calcula desde el sueldo base en una sola operacion
    // (sueldo x dias / 30) y NO como "sueldo diario redondeado x dias": lo
    // segundo redondea dos veces y desvia el resultado en centimos.
    // El sueldo diario se calcula aparte, solo para mostrarlo en la boleta.
    const dailyRate = input.employee.basicSalary.divideByRate(String(DAYS_PER_MONTH))
    const basicPay =
      input.workedDays === DAYS_PER_MONTH
        ? input.employee.basicSalary
        : input.employee.basicSalary.compute({
            multiplyBy: [String(input.workedDays)],
            divideBy: [String(DAYS_PER_MONTH)],
          })

    breakdown['sueldo_diario'] = dailyRate.toString()
    breakdown['dias_trabajados'] = String(input.workedDays)
    breakdown['sueldo_del_mes'] = basicPay.toString()

    // Asignacion familiar: 10% de la RMV, sin prorrateo por dias.
    const familyAllowance = input.employee.hasFamilyAllowance
      ? input.parameters.minimumWage.multiplyByRate('0.10')
      : zero
    if (input.employee.hasFamilyAllowance) {
      breakdown['asignacion_familiar'] = `10% de ${input.parameters.minimumWage.toString()}`
    }

    // Horas extras: 25% de recargo las dos primeras del dia, 35% el resto.
    // Igual que el prorrateo, se calcula desde el sueldo base en una sola
    // operacion para no redondear el valor hora y despues multiplicarlo.
    const hoursPerMonth = String(DAYS_PER_MONTH * HOURS_PER_DAY)
    const hourlyRate = dailyRate.divideByRate(String(HOURS_PER_DAY))
    const overtime25 = input.employee.basicSalary.compute({
      multiplyBy: [String(input.overtimeHours25), '1.25'],
      divideBy: [hoursPerMonth],
    })
    const overtime35 = input.employee.basicSalary.compute({
      multiplyBy: [String(input.overtimeHours35), '1.35'],
      divideBy: [hoursPerMonth],
    })
    const overtimePay = overtime25.add(overtime35)

    if (!overtimePay.isZero()) {
      breakdown['valor_hora'] = hourlyRate.toString()
      breakdown['horas_extra_25'] = `${input.overtimeHours25} x ${hourlyRate.toString()} x 1.25`
      breakdown['horas_extra_35'] = `${input.overtimeHours35} x ${hourlyRate.toString()} x 1.35`
    }

    const gross = basicPay.add(familyAllowance).add(overtimePay).add(input.bonuses)
    breakdown['total_ingresos'] = gross.toString()

    if (gross.isPositive() && gross.cents < input.parameters.minimumWage.cents && input.workedDays === DAYS_PER_MONTH) {
      warnings.push(
        `La remuneracion del mes (${gross.format()}) es menor a la remuneracion minima vital ` +
          `(${input.parameters.minimumWage.format()}) con jornada completa. Verifique el contrato.`,
      )
    }

    // -----------------------------------------------------------------------
    // Descuentos al trabajador
    // -----------------------------------------------------------------------

    const pension = computePension(gross, input.employee.pension, breakdown)

    // La renta de quinta se calcula sobre el ingreso SIN descontar pensiones:
    // el aporte previsional no es deducible de la renta de quinta.
    const incomeTax5th = computeIncomeTax({
      monthlyGross: gross,
      month: input.month,
      withheldToDate: input.incomeTaxWithheldToDate,
      parameters: input.parameters,
      breakdown,
    })

    const totalDeductions = pension.contribution
      .add(pension.commission)
      .add(pension.insurance)
      .add(incomeTax5th)
      .add(input.otherDeductions)

    const netPay = gross.subtract(totalDeductions)
    breakdown['total_descuentos'] = totalDeductions.toString()
    breakdown['neto_a_pagar'] = netPay.toString()

    if (netPay.isNegative()) {
      warnings.push(
        'Los descuentos superan los ingresos del mes. Revise los descuentos de terceros.',
      )
    }

    // -----------------------------------------------------------------------
    // Aportes de cargo del empleador
    // -----------------------------------------------------------------------

    // EsSalud se calcula sobre la remuneracion, pero nunca sobre una base
    // menor a la remuneracion minima: ese piso es una regla del regimen, no
    // una decision del sistema.
    const essaludBase = gross.cents < input.parameters.minimumWage.cents
      ? input.parameters.minimumWage
      : gross
    const essalud = essaludBase.multiplyByRate(input.parameters.essaludRate)
    breakdown['base_essalud'] = essaludBase.toString()
    breakdown['essalud'] = `${input.parameters.essaludRate} de ${essaludBase.toString()}`

    const sctr = input.employee.highRisk
      ? gross.multiplyByRate(input.parameters.sctrRate)
      : zero
    if (input.employee.highRisk) {
      breakdown['sctr'] = `${input.parameters.sctrRate} de ${gross.toString()}`
    }

    return {
      earnings: { basicPay, familyAllowance, overtimePay, bonuses: input.bonuses, gross },
      deductions: {
        pensionContribution: pension.contribution,
        pensionCommission: pension.commission,
        pensionInsurance: pension.insurance,
        incomeTax5th,
        other: input.otherDeductions,
        total: totalDeductions,
      },
      employer: { essalud, sctr, total: essalud.add(sctr) },
      netPay,
      breakdown,
      warnings,
    }
  },
}

/**
 * Aporte previsional.
 *
 * ONP: un solo descuento, el aporte al fondo.
 * AFP: tres conceptos distintos —aporte al fondo, comision de la
 * administradora y prima del seguro previsional— que en la boleta van
 * separados porque el trabajador tiene derecho a ver cuanto se lleva cada uno.
 */
function computePension(
  gross: Money,
  pension: PensionParameters,
  breakdown: Record<string, string>,
): { contribution: Money; commission: Money; insurance: Money } {
  const zero = Money.zero()

  const contribution = gross.multiplyByRate(pension.contributionRate)
  breakdown['aporte_pension'] = `${pension.contributionRate} de ${gross.toString()}`

  if (pension.system === 'ONP') {
    return { contribution, commission: zero, insurance: zero }
  }

  const commissionRate = pension.commissionFlowRate ?? pension.commissionMixedRate
  const commission = commissionRate ? gross.multiplyByRate(commissionRate) : zero
  if (commissionRate) {
    breakdown['comision_afp'] = `${commissionRate} de ${gross.toString()}`
  }

  // La prima del seguro se calcula sobre la remuneracion asegurable, que
  // tiene un tope: lo que exceda ese tope no paga prima.
  const insuranceBase =
    pension.insuranceCap && gross.greaterThan(pension.insuranceCap)
      ? pension.insuranceCap
      : gross
  const insurance = pension.insuranceRate
    ? insuranceBase.multiplyByRate(pension.insuranceRate)
    : zero
  if (pension.insuranceRate) {
    breakdown['prima_seguro'] = `${pension.insuranceRate} de ${insuranceBase.toString()}`
  }

  return { contribution, commission, insurance }
}

/**
 * Renta de quinta categoria.
 *
 * El metodo es de proyeccion anual: se estima cuanto ganara el trabajador en
 * todo el ejercicio, se aplica la deduccion de 7 UIT y la escala progresiva
 * acumulativa, y el impuesto resultante se reparte entre los meses que
 * quedan, descontando lo ya retenido.
 *
 * SIMPLIFICACION QUE CONVIENE CONOCER: se proyecta la remuneracion del mes
 * como constante hasta diciembre y se agregan dos gratificaciones. Es el
 * metodo estandar y da el resultado correcto en la gran mayoria de casos,
 * pero no contempla los ajustes por ingresos extraordinarios del articulo 41
 * del reglamento. Para un trabajador con bonos variables altos, el contador
 * debe revisar el calculo del ultimo trimestre.
 */
function computeIncomeTax(input: {
  monthlyGross: Money
  month: number
  withheldToDate: Money
  parameters: PayrollParameters
  breakdown: Record<string, string>
}): Money {
  const { parameters, breakdown } = input
  const zero = Money.zero()

  const remainingMonths = Math.max(0, 12 - input.month + 1)
  // Proyeccion: lo que falta del anio mas las dos gratificaciones.
  const projectedAnnual = input.monthlyGross.multiplyByRate(
    String(remainingMonths + BONUS_MONTHS),
  )
  // Lo ya percibido en los meses anteriores, estimado al mismo nivel.
  const earnedSoFar = input.monthlyGross.multiplyByRate(String(input.month - 1))
  const annualIncome = projectedAnnual.add(earnedSoFar)

  const deduction = parameters.uit.multiplyByRate(String(parameters.incomeTaxDeductionUit))
  const taxableIncome = annualIncome.subtract(deduction)

  breakdown['renta_proyeccion_anual'] = annualIncome.toString()
  breakdown['renta_deduccion_7uit'] = deduction.toString()

  if (!taxableIncome.isPositive()) {
    // El caso mas comun: quien gana menos de 7 UIT al anio no retiene nada.
    breakdown['renta_quinta'] = 'No afecto: la proyeccion anual no supera las 7 UIT'
    return zero
  }

  const annualTax = applyBrackets(taxableIncome, parameters, breakdown)
  const pending = annualTax.subtract(input.withheldToDate)

  if (!pending.isPositive()) {
    breakdown['renta_quinta'] = 'Ya se retuvo el impuesto proyectado del ejercicio'
    return zero
  }

  // El saldo se reparte entre los meses que quedan, el actual incluido.
  const monthly = remainingMonths > 0 ? pending.divideByRate(String(remainingMonths)) : pending

  breakdown['renta_impuesto_anual'] = annualTax.toString()
  breakdown['renta_retenido_a_la_fecha'] = input.withheldToDate.toString()
  breakdown['renta_meses_restantes'] = String(remainingMonths)
  breakdown['renta_quinta'] = monthly.toString()

  return monthly
}

/** Escala progresiva acumulativa: cada tramo grava solo su porcion. */
function applyBrackets(
  taxableIncome: Money,
  parameters: PayrollParameters,
  breakdown: Record<string, string>,
): Money {
  let tax = Money.zero()
  let previousLimit = Money.zero()

  for (const bracket of parameters.incomeTaxBrackets) {
    const limit =
      bracket.upToUit === null
        ? null
        : parameters.uit.multiplyByRate(String(bracket.upToUit))

    // Porcion del ingreso que cae dentro de este tramo.
    const upper = limit && limit.cents < taxableIncome.cents ? limit : taxableIncome
    const portion = upper.subtract(previousLimit)

    if (!portion.isPositive()) break

    const bracketTax = portion.multiplyByRate(bracket.rate)
    tax = tax.add(bracketTax)

    breakdown[`renta_tramo_${bracket.rate}`] =
      `${portion.toString()} x ${bracket.rate} = ${bracketTax.toString()}`

    if (!limit || taxableIncome.cents <= limit.cents) break
    previousLimit = limit
  }

  return tax
}
