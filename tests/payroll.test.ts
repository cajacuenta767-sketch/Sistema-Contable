import { describe, expect, it } from 'vitest'
import { Money } from '@/core/domain/value-objects/money'
import { PayslipService } from '@/core/domain/payroll/payslip'
import type { PayrollParameters, PensionParameters } from '@/core/domain/payroll/parameters'
import { PayrollEntryService } from '@/core/domain/payroll/payroll-entry'
import { JournalService } from '@/core/domain/accounting/journal'
import { PlameGenerator } from '@/core/domain/payroll/plame/generator'

/**
 * Los parametros son de referencia y sirven para probar la MECANICA del
 * calculo: prorrateo, recargos de horas extras, topes, escala progresiva.
 * Las cifras vigentes se cargan en base de datos, nunca en el codigo.
 */
const PARAMS: PayrollParameters = {
  year: 2026,
  uit: Money.fromString('5350.00'),
  minimumWage: Money.fromString('1130.00'),
  essaludRate: '0.09',
  sctrRate: '0.0153',
  incomeTaxDeductionUit: 7,
  incomeTaxBrackets: [
    { upToUit: 5, rate: '0.08' },
    { upToUit: 20, rate: '0.14' },
    { upToUit: 35, rate: '0.17' },
    { upToUit: 45, rate: '0.20' },
    { upToUit: null, rate: '0.30' },
  ],
}

const ONP: PensionParameters = { system: 'ONP', contributionRate: '0.13' }

const AFP: PensionParameters = {
  system: 'AFP',
  afpCode: 'INTEGRA',
  contributionRate: '0.10',
  commissionFlowRate: '0.0155',
  insuranceRate: '0.0174',
  insuranceCap: Money.fromString('12000.00'),
}

function base(overrides: Partial<Parameters<typeof PayslipService.compute>[0]> = {}) {
  return PayslipService.compute({
    employee: {
      fullName: 'Trabajador de Prueba',
      basicSalary: Money.fromString('3000.00'),
      hasFamilyAllowance: false,
      highRisk: false,
      pension: ONP,
    },
    workedDays: 30,
    absentDays: 0,
    overtimeHours25: 0,
    overtimeHours35: 0,
    bonuses: Money.zero(),
    otherDeductions: Money.zero(),
    incomeTaxWithheldToDate: Money.zero(),
    month: 1,
    parameters: PARAMS,
    ...overrides,
  })
}

describe('Boleta de pago - ingresos', () => {
  it('paga el sueldo completo con el mes completo', () => {
    expect(base().earnings.basicPay.toString()).toBe('3000.00')
  })

  it('prorratea por dias efectivamente trabajados', () => {
    // 3000 / 30 = 100 diario; 15 dias = 1500
    expect(base({ workedDays: 15 }).earnings.basicPay.toString()).toBe('1500.00')
  })

  it('agrega la asignacion familiar como 10% de la remuneracion minima', () => {
    const result = base({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('3000.00'),
        hasFamilyAllowance: true,
        highRisk: false,
        pension: ONP,
      },
    })
    expect(result.earnings.familyAllowance.toString()).toBe('113.00')
    expect(result.earnings.gross.toString()).toBe('3113.00')
  })

  it('aplica 25% de recargo a las dos primeras horas extras y 35% al resto', () => {
    // valor hora = 3000 / 30 / 8 = 12.50
    // 2h al 125% = 31.25 ; 3h al 135% = 50.625 -> 50.63
    const result = base({ overtimeHours25: 2, overtimeHours35: 3 })
    expect(result.breakdown['valor_hora']).toBe('12.50')
    expect(result.earnings.overtimePay.toString()).toBe('81.88')
  })

  it('rechaza mas dias de los que tiene el mes laboral', () => {
    expect(() => base({ workedDays: 45 })).toThrow(/entre 0 y 30/)
  })

  it('advierte si la remuneracion con jornada completa cae bajo el minimo', () => {
    const result = base({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('800.00'),
        hasFamilyAllowance: false,
        highRisk: false,
        pension: ONP,
      },
    })
    expect(result.warnings.some((w) => w.includes('minima vital'))).toBe(true)
  })
})

describe('Boleta de pago - pensiones', () => {
  it('ONP descuenta un solo concepto', () => {
    const result = base()
    expect(result.deductions.pensionContribution.toString()).toBe('390.00') // 13%
    expect(result.deductions.pensionCommission.isZero()).toBe(true)
    expect(result.deductions.pensionInsurance.isZero()).toBe(true)
  })

  it('AFP separa aporte, comision y prima', () => {
    const result = base({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('3000.00'),
        hasFamilyAllowance: false,
        highRisk: false,
        pension: AFP,
      },
    })
    expect(result.deductions.pensionContribution.toString()).toBe('300.00') // 10%
    expect(result.deductions.pensionCommission.toString()).toBe('46.50') // 1.55%
    expect(result.deductions.pensionInsurance.toString()).toBe('52.20') // 1.74%
  })

  it('topea la prima del seguro en la remuneracion asegurable maxima', () => {
    const result = base({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('20000.00'),
        hasFamilyAllowance: false,
        highRisk: false,
        pension: AFP,
      },
      month: 12, // para aislar el efecto del tope
    })
    // La prima se calcula sobre 12000, no sobre 20000: 12000 * 1.74% = 208.80
    expect(result.deductions.pensionInsurance.toString()).toBe('208.80')
    // El aporte al fondo NO tiene tope: 20000 * 10% = 2000
    expect(result.deductions.pensionContribution.toString()).toBe('2000.00')
  })
})

describe('Boleta de pago - renta de quinta categoria', () => {
  it('no retiene a quien proyecta menos de 7 UIT al anio', () => {
    // 2000 x 14 = 28,000 contra 7 UIT = 37,450
    const result = base({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('2000.00'),
        hasFamilyAllowance: false,
        highRisk: false,
        pension: ONP,
      },
    })
    expect(result.deductions.incomeTax5th.isZero()).toBe(true)
    expect(result.breakdown['renta_quinta']).toContain('No afecto')
  })

  it('retiene a quien supera las 7 UIT', () => {
    // 8000 x 14 = 112,000 ; menos 37,450 = 74,550 imponible
    const result = base({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('8000.00'),
        hasFamilyAllowance: false,
        highRisk: false,
        pension: ONP,
      },
    })
    expect(result.deductions.incomeTax5th.isPositive()).toBe(true)
  })

  it('aplica la escala de forma progresiva, no la tasa marginal a todo', () => {
    // Imponible 74,550 = 13.93 UIT.
    //   tramo 1: 5 UIT (26,750) al 8%  = 2,140.00
    //   tramo 2: 47,800 al 14%         = 6,692.00
    //   total anual                    = 8,832.00
    // Repartido en 12 meses = 736.00
    const result = base({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('8000.00'),
        hasFamilyAllowance: false,
        highRisk: false,
        pension: ONP,
      },
    })
    expect(result.breakdown['renta_impuesto_anual']).toBe('8832.00')
    expect(result.deductions.incomeTax5th.toString()).toBe('736.00')
  })

  it('descuenta lo ya retenido en el ejercicio', () => {
    const sinRetencion = base({
      employee: {
        fullName: 'X', basicSalary: Money.fromString('8000.00'),
        hasFamilyAllowance: false, highRisk: false, pension: ONP,
      },
      month: 6,
    })
    const conRetencion = base({
      employee: {
        fullName: 'X', basicSalary: Money.fromString('8000.00'),
        hasFamilyAllowance: false, highRisk: false, pension: ONP,
      },
      month: 6,
      incomeTaxWithheldToDate: Money.fromString('4000.00'),
    })
    expect(conRetencion.deductions.incomeTax5th.cents).toBeLessThan(
      sinRetencion.deductions.incomeTax5th.cents,
    )
  })

  it('no retiene mas si ya se retuvo todo el impuesto proyectado', () => {
    const result = base({
      employee: {
        fullName: 'X', basicSalary: Money.fromString('8000.00'),
        hasFamilyAllowance: false, highRisk: false, pension: ONP,
      },
      month: 12,
      incomeTaxWithheldToDate: Money.fromString('99000.00'),
    })
    expect(result.deductions.incomeTax5th.isZero()).toBe(true)
  })
})

describe('Boleta de pago - aportes del empleador', () => {
  it('calcula EsSalud al 9%', () => {
    expect(base().employer.essalud.toString()).toBe('270.00')
  })

  it('nunca calcula EsSalud sobre una base menor a la remuneracion minima', () => {
    // Trabajador a tiempo parcial con 500 de remuneracion: la base es la RMV.
    const result = base({
      employee: {
        fullName: 'X', basicSalary: Money.fromString('500.00'),
        hasFamilyAllowance: false, highRisk: false, pension: ONP,
      },
    })
    expect(result.breakdown['base_essalud']).toBe('1130.00')
    expect(result.employer.essalud.toString()).toBe('101.70')
  })

  it('agrega SCTR solo en trabajo de riesgo', () => {
    expect(base().employer.sctr.isZero()).toBe(true)
    const riesgo = base({
      employee: {
        fullName: 'X', basicSalary: Money.fromString('3000.00'),
        hasFamilyAllowance: false, highRisk: true, pension: ONP,
      },
    })
    expect(riesgo.employer.sctr.toString()).toBe('45.90')
  })
})

describe('Boleta de pago - neto y trazabilidad', () => {
  it('neto = ingresos menos descuentos', () => {
    const result = base()
    const esperado = result.earnings.gross.subtract(result.deductions.total)
    expect(result.netPay.equals(esperado)).toBe(true)
    // 3000 de ingresos, menos 390 de ONP (13%) y 30.33 de renta de quinta:
    // con 3000 mensuales la proyeccion anual (3000 x 14 = 42,000) SI supera
    // las 7 UIT (37,450), asi que hay retencion.
    expect(result.deductions.pensionContribution.toString()).toBe('390.00')
    expect(result.deductions.incomeTax5th.toString()).toBe('30.33')
    expect(result.netPay.toString()).toBe('2579.67')
  })

  it('deja el detalle de cada paso del calculo', () => {
    // Sin esto no se puede sustentar la boleta ante el trabajador ni ante
    // una fiscalizacion.
    const result = base({ overtimeHours25: 2 })
    expect(result.breakdown['sueldo_diario']).toBe('100.00')
    expect(result.breakdown['valor_hora']).toBe('12.50')
    expect(result.breakdown['aporte_pension']).toContain('0.13')
    expect(result.breakdown['neto_a_pagar']).toBeDefined()
  })

  it('advierte si los descuentos superan los ingresos', () => {
    const result = base({ otherDeductions: Money.fromString('5000.00') })
    expect(result.netPay.isNegative()).toBe(true)
    expect(result.warnings.some((w) => w.includes('superan los ingresos'))).toBe(true)
  })

  it('rechaza calcular sin parametros del ejercicio', () => {
    expect(() =>
      base({ parameters: { ...PARAMS, incomeTaxBrackets: [] } }),
    ).toThrow(/tramos de renta/)
  })
})

describe('precision del calculo', () => {
  it('no redondea dos veces al prorratear ni al calcular horas extras', () => {
    // Sueldo que no divide exacto entre 30: 3333.33 / 30 = 111.111
    // Prorrateo correcto: 3333.33 x 17 / 30 = 1888.887 -> 1888.89
    // Si se redondeara el sueldo diario primero (111.11) daria 1888.87.
    const result = PayslipService.compute({
      employee: {
        fullName: 'X',
        basicSalary: Money.fromString('3333.33'),
        hasFamilyAllowance: false,
        highRisk: false,
        pension: ONP,
      },
      workedDays: 17,
      absentDays: 13,
      overtimeHours25: 0,
      overtimeHours35: 0,
      bonuses: Money.zero(),
      otherDeductions: Money.zero(),
      incomeTaxWithheldToDate: Money.zero(),
      month: 1,
      parameters: PARAMS,
    })
    expect(result.earnings.basicPay.toString()).toBe('1888.89')
  })
})

describe('Asiento de provision de planilla', () => {
  const totals = {
    gross: Money.fromString('14426.00'),
    onpContributions: Money.fromString('195.00'),
    afpContributions: Money.fromString('1723.09'),
    incomeTax: Money.fromString('2373.61'),
    otherDeductions: Money.zero(),
    netPay: Money.fromString('10134.30'),
    employerEssalud: Money.fromString('1275.39'),
    employerSctr: Money.fromString('45.90'),
  }
  const context = { date: new Date('2026-08-31T12:00:00Z'), period: '2026-08', periodLabel: 'Agosto 2026' }

  it('carga el gasto de personal y los aportes del empleador', () => {
    const asiento = PayrollEntryService.build(totals, context)
    const debe = asiento.lines.filter((l) => !l.debit.isZero())
    expect(debe.map((l) => l.accountCode)).toEqual(['6211', '6271', '6274'])
    expect(debe[0]?.debit.toString()).toBe('14426.00')
  })

  it('abona lo retenido, lo aportado y el neto por separado', () => {
    const asiento = PayrollEntryService.build(totals, context)
    const haber = new Map(
      asiento.lines.filter((l) => !l.credit.isZero()).map((l) => [l.accountCode, l.credit.toString()]),
    )
    expect(haber.get('4032')).toBe('195.00') // ONP
    expect(haber.get('4071')).toBe('1723.09') // AFP
    expect(haber.get('40173')).toBe('2373.61') // renta de quinta
    expect(haber.get('4111')).toBe('10134.30') // neto a depositar
  })

  it('cuadra: el debe es bruto mas aportes del empleador', () => {
    const asiento = PayrollEntryService.build(totals, context)
    const sumas = JournalService.totals(asiento.lines)
    expect(sumas.balanced).toBe(true)
    // 14426.00 + 1275.39 + 45.90
    expect(sumas.debit.toString()).toBe('15747.29')
  })

  it('omite las lineas en cero', () => {
    // Una empresa sin afiliados a AFP no debe tener una linea de AFP en cero.
    const sinAfp = PayrollEntryService.build(
      {
        ...totals,
        afpContributions: Money.zero(),
        // Se rebalancea moviendo esa retencion al neto.
        netPay: totals.netPay.add(totals.afpContributions),
      },
      context,
    )
    expect(sinAfp.lines.some((l) => l.accountCode === '4071')).toBe(false)
    expect(JournalService.totals(sinAfp.lines).balanced).toBe(true)
  })

  it('permite cambiar las cuentas sin tocar el codigo', () => {
    const asiento = PayrollEntryService.build(totals, context, { salaryExpense: '6212' })
    expect(asiento.lines[0]?.accountCode).toBe('6212')
  })
})

describe('Generacion PLAME', () => {
  const trabajador = {
    docType: '01',
    docNumber: '41000000',
    fullName: 'Rosa Huaman Vega',
    pensionSystem: 'AFP' as const,
    workedDays: 30,
    absentDays: 0,
    overtimeHours: 0,
    basicPay: Money.fromString('4200.00'),
    familyAllowance: Money.fromString('113.00'),
    overtimePay: Money.zero(),
    bonuses: Money.zero(),
    pensionContribution: Money.fromString('431.30'),
    pensionCommission: Money.fromString('66.85'),
    pensionInsurance: Money.fromString('75.05'),
    incomeTax5th: Money.fromString('366.91'),
    otherDeductions: Money.zero(),
    employerEssalud: Money.fromString('388.17'),
    employerSctr: Money.zero(),
  }

  const base = { ruc: '20100070970', period: '2026-08', employees: [trabajador] }

  it('genera los dos archivos con la nomenclatura del PDT', () => {
    const result = PlameGenerator.generate(base)
    expect(result.files.map((f) => f.fileName)).toEqual([
      '060120100070970202608.jor',
      '060120100070970202608.rem',
    ])
  })

  it('la jornada lleva dias y horas ordinarias derivadas', () => {
    const jornada = PlameGenerator.generate(base).files[0]!
    // 30 dias x 8 horas = 240
    expect(jornada.content.trim()).toBe('01|41000000|30|0|0|240.00|0.00|')
  })

  it('usa los codigos de AFP para un afiliado a AFP', () => {
    const conceptos = PlameGenerator.generate(base).files[1]!
    expect(conceptos.content).toContain('|0605|431.30|') // aporte obligatorio
    expect(conceptos.content).toContain('|0606|66.85|') // comision
    expect(conceptos.content).toContain('|0607|75.05|') // prima
    expect(conceptos.content).not.toContain('|0601|') // no lleva codigo de ONP
  })

  it('usa el codigo de ONP para un afiliado a ONP', () => {
    // Codificar lo retenido a un afiliado a ONP con el codigo de AFP produce
    // una declaracion con bases equivocadas.
    const conceptos = PlameGenerator.generate({
      ...base,
      employees: [{ ...trabajador, pensionSystem: 'ONP' as const }],
    }).files[1]!
    expect(conceptos.content).toContain('|0601|431.30|')
    expect(conceptos.content).not.toContain('|0605|')
  })

  it('omite los conceptos en cero', () => {
    const conceptos = PlameGenerator.generate(base).files[1]!
    // No hay horas extras ni SCTR: esos codigos no deben aparecer.
    expect(conceptos.content).not.toContain('|0302|')
    expect(conceptos.content).not.toContain('|0806|')
  })

  it('cierra cada linea con el separador y usa CRLF', () => {
    const conceptos = PlameGenerator.generate(base).files[1]!
    const lineas = conceptos.content.split('\r\n').filter(Boolean)
    expect(lineas.every((l) => l.endsWith('|'))).toBe(true)
    expect(conceptos.content).toContain('\r\n')
  })

  it('advierte sobre la version de la estructura y sobre quien presenta', () => {
    const result = PlameGenerator.generate(base)
    expect(result.warnings.some((w) => w.includes('PDT PLAME'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('no presenta ante SUNAT'))).toBe(true)
  })

  it('genera archivos vacios y avisa cuando no hay trabajadores', () => {
    const result = PlameGenerator.generate({ ...base, employees: [] })
    expect(result.files.every((f) => f.content === '')).toBe(true)
    expect(result.warnings.some((w) => w.includes('sin trabajadores'))).toBe(true)
  })

  it('rechaza un RUC invalido', () => {
    expect(() => PlameGenerator.generate({ ...base, ruc: '123' })).toThrow(/RUC invalido/)
  })
})
