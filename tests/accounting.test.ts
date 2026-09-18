import { describe, expect, it } from 'vitest'
import { Money } from '@/core/domain/value-objects/money'
import { AccountCode } from '@/core/domain/accounting/account-code'
import { DetractionService, TaxService } from '@/core/domain/accounting/tax'
import { JournalService } from '@/core/domain/accounting/journal'
import { EntryBuilderService } from '@/core/domain/accounting/entry-builder'
import { TrialBalanceService } from '@/core/domain/accounting/trial-balance'
import { FinancialStatementsService } from '@/core/domain/accounting/financial-statements'
import { PleGenerator, buildFileName } from '@/core/domain/accounting/ple/generator'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'
import { ValidationError } from '@/core/domain/errors'

describe('Money', () => {
  it('no arrastra el error del punto flotante', () => {
    // En `number`, 0.1 + 0.2 da 0.30000000000000004. Sobre cientos de
    // comprobantes ese error descuadra el libro.
    const result = Money.fromString('0.10').add(Money.fromString('0.20'))
    expect(result.toString()).toBe('0.30')
  })

  it('suma mil importes sin perder un centimo', () => {
    const items = Array.from({ length: 1000 }, () => Money.fromString('0.01'))
    expect(Money.sum(items).toString()).toBe('10.00')
  })

  it('redondea a la media unidad hacia arriba', () => {
    expect(Money.fromString('1.005').toString()).toBe('1.01')
    expect(Money.fromString('1.004').toString()).toBe('1.00')
    expect(Money.fromString('-1.005').toString()).toBe('-1.01')
  })

  it('multiplica por una tasa con redondeo unico al final', () => {
    // 1000.00 * 0.18 = 180.00 exacto
    expect(Money.fromString('1000.00').multiplyByRate('0.18').toString()).toBe('180.00')
    // 33.33 * 0.18 = 5.9994, que a dos decimales redondea a 6.00.
    expect(Money.fromString('33.33').multiplyByRate('0.18').toString()).toBe('6.00')
    // 10.03 * 0.18 = 1.8054 -> 1.81
    expect(Money.fromString('10.03').multiplyByRate('0.18').toString()).toBe('1.81')
    // 8.50 * 0.18 = 1.53 exacto: no se altera.
    expect(Money.fromString('8.50').multiplyByRate('0.18').toString()).toBe('1.53')
  })

  it('rechaza operar monedas distintas', () => {
    const soles = Money.fromString('100.00', 'PEN')
    const dolares = Money.fromString('100.00', 'USD')
    expect(() => soles.add(dolares)).toThrow(ValidationError)
  })

  it('convierte con tipo de cambio', () => {
    const dolares = Money.fromString('100.00', 'USD')
    expect(dolares.convert('3.752', 'PEN').toString()).toBe('375.20')
  })

  it('formatea para pantalla con separador de miles', () => {
    expect(Money.fromString('1234567.89').format()).toBe('S/ 1,234,567.89')
    expect(Money.fromString('-50.00').format()).toBe('-S/ 50.00')
  })

  it('rechaza cadenas que no son importes', () => {
    expect(() => Money.fromString('abc')).toThrow(ValidationError)
    expect(() => Money.fromString('')).toThrow(ValidationError)
  })
})

describe('AccountCode (PCGE)', () => {
  it('deriva el nivel del largo del codigo', () => {
    expect(AccountCode.create('6').level).toBe(1)
    expect(AccountCode.create('60').level).toBe(2)
    expect(AccountCode.create('6011').level).toBe(4)
  })

  it('deriva la naturaleza del elemento', () => {
    expect(AccountCode.create('1011').nature).toBe('DEUDORA') // caja
    expect(AccountCode.create('4011').nature).toBe('ACREEDORA') // tributos por pagar
    expect(AccountCode.create('6011').nature).toBe('DEUDORA') // compras
    expect(AccountCode.create('7011').nature).toBe('ACREEDORA') // ventas
  })

  it('clasifica por estado financiero', () => {
    expect(AccountCode.create('1011').section).toBe('ACTIVO')
    expect(AccountCode.create('4212').section).toBe('PASIVO')
    expect(AccountCode.create('5011').section).toBe('PATRIMONIO')
    expect(AccountCode.create('6011').section).toBe('GASTO')
    expect(AccountCode.create('7011').section).toBe('INGRESO')
  })

  it('distingue cuentas de resultado de cuentas de balance', () => {
    // Las de resultado se cancelan al cierre; las de balance arrastran saldo.
    expect(AccountCode.create('7011').isResultAccount).toBe(true)
    expect(AccountCode.create('1011').isBalanceAccount).toBe(true)
    expect(AccountCode.create('1011').isResultAccount).toBe(false)
  })

  it('reconoce la jerarquia', () => {
    expect(AccountCode.create('60').contains(AccountCode.create('6011'))).toBe(true)
    expect(AccountCode.create('60').contains(AccountCode.create('7011'))).toBe(false)
    expect(AccountCode.create('6011').parent).toBe('601')
  })
})

describe('IGV', () => {
  it('calcula el IGV sobre la base', () => {
    expect(TaxService.igvFromBase(Money.fromString('1000.00')).toString()).toBe('180.00')
  })

  it('despeja la base desde un total que ya incluye IGV, sin descuadre', () => {
    const total = Money.fromString('118.00')
    const { base, igv } = TaxService.splitFromTotal(total)

    expect(base.toString()).toBe('100.00')
    expect(igv.toString()).toBe('18.00')
    // La propiedad que importa: base + igv reconstruye EXACTAMENTE el total.
    expect(base.add(igv).equals(total)).toBe(true)
  })

  it('reconstruye el total exacto tambien en importes que no son redondos', () => {
    for (const value of ['0.01', '33.33', '7.77', '999.99', '1234.56']) {
      const total = Money.fromString(value)
      const { base, igv } = TaxService.splitFromTotal(total)
      expect(base.add(igv).toString()).toBe(total.toString())
    }
  })

  it('usa la tasa que se le indica, no una constante', () => {
    // Reprocesar un periodo de 2010 exige la tasa de entonces (19%).
    expect(TaxService.igvFromBase(Money.fromString('1000.00'), '0.19').toString()).toBe('190.00')
  })

  it('arma el desglose y calcula el total', () => {
    const breakdown = TaxService.build({
      taxableBase: Money.fromString('1000.00'),
      exemptAmount: Money.fromString('200.00'),
    })
    expect(breakdown.igv.toString()).toBe('180.00')
    expect(breakdown.total.toString()).toBe('1380.00')
  })

  it('tolera un centimo de diferencia pero no mas', () => {
    const base = Money.fromString('1000.00')
    expect(() => TaxService.assertIgvConsistent(base, Money.fromString('180.01'))).not.toThrow()
    expect(() => TaxService.assertIgvConsistent(base, Money.fromString('185.00'))).toThrow(
      ValidationError,
    )
  })
})

describe('Detracciones', () => {
  it('aplica solo por encima del monto minimo', () => {
    expect(DetractionService.applies(Money.fromString('700.00'))).toBe(false)
    expect(DetractionService.applies(Money.fromString('700.01'))).toBe(true)
  })

  it('redondea el importe detraido al entero superior', () => {
    // 1180.00 * 12% = 141.60 -> 142.00
    expect(DetractionService.compute(Money.fromString('1180.00'), '0.12').toString()).toBe('142.00')
    // Un resultado exacto no se altera.
    expect(DetractionService.compute(Money.fromString('1000.00'), '0.10').toString()).toBe('100.00')
  })
})

describe('Partida doble', () => {
  const venta = {
    date: new Date('2026-08-15T12:00:00Z'),
    period: '2026-08',
    glossa: 'Venta segun factura F001-123',
    lines: [
      { accountCode: '1212', debit: Money.fromString('1180.00'), credit: Money.zero() },
      { accountCode: '4011', debit: Money.zero(), credit: Money.fromString('180.00') },
      { accountCode: '7011', debit: Money.zero(), credit: Money.fromString('1000.00') },
    ],
  }

  it('acepta un asiento cuadrado', () => {
    expect(() => JournalService.assertValid(venta)).not.toThrow()
    expect(JournalService.totals(venta.lines).balanced).toBe(true)
  })

  it('rechaza un asiento descuadrado diciendo por cuanto', () => {
    const descuadrado = {
      ...venta,
      lines: [...venta.lines.slice(0, 2), { ...venta.lines[2]!, credit: Money.fromString('999.00') }],
    }
    expect(() => JournalService.assertValid(descuadrado)).toThrow(/no cuadra/)
    expect(() => JournalService.assertValid(descuadrado)).toThrow(/1\.00/)
  })

  it('rechaza una linea con importe en el debe y en el haber a la vez', () => {
    const mixta = {
      ...venta,
      lines: [
        { accountCode: '1212', debit: Money.fromString('10.00'), credit: Money.fromString('10.00') },
        { accountCode: '7011', debit: Money.fromString('10.00'), credit: Money.fromString('10.00') },
      ],
    }
    expect(() => JournalService.assertValid(mixta)).toThrow(/debe y en el haber/)
  })

  it('rechaza importes negativos', () => {
    const negativo = {
      ...venta,
      lines: [
        { accountCode: '1212', debit: Money.fromString('-100.00'), credit: Money.zero() },
        { accountCode: '7011', debit: Money.zero(), credit: Money.fromString('-100.00') },
      ],
    }
    expect(() => JournalService.assertValid(negativo)).toThrow(/negativos/)
  })

  it('exige glosa y al menos dos lineas', () => {
    expect(() => JournalService.assertValid({ ...venta, glossa: '' })).toThrow(/glosa/)
    expect(() =>
      JournalService.assertValid({ ...venta, lines: [venta.lines[0]!] }),
    ).toThrow(/dos lineas/)
  })

  it('extorna invirtiendo debe y haber, sin borrar el original', () => {
    const extorno = JournalService.reverse(venta)
    expect(extorno.glossa).toContain('EXTORNO')
    expect(extorno.lines[0]?.credit.toString()).toBe('1180.00')
    expect(extorno.lines[0]?.debit.toString()).toBe('0.00')
    expect(() => JournalService.assertValid(extorno)).not.toThrow()
  })
})

describe('Balance de comprobacion', () => {
  const movimientos = [
    { accountCode: '1011', accountName: 'Caja', debit: Money.fromString('5000.00'), credit: Money.fromString('1200.00') },
    { accountCode: '1212', accountName: 'Facturas por cobrar', debit: Money.fromString('1180.00'), credit: Money.zero() },
    { accountCode: '4011', accountName: 'IGV por pagar', debit: Money.zero(), credit: Money.fromString('180.00') },
    { accountCode: '5011', accountName: 'Capital social', debit: Money.zero(), credit: Money.fromString('4000.00') },
    { accountCode: '6011', accountName: 'Compras de mercaderias', debit: Money.fromString('1200.00'), credit: Money.zero() },
    { accountCode: '7011', accountName: 'Ventas de mercaderias', debit: Money.zero(), credit: Money.fromString('2000.00') },
  ]

  it('cuadra cuando los asientos cuadran', () => {
    const balance = TrialBalanceService.build(movimientos)
    expect(balance.balanced).toBe(true)
    expect(balance.totals.debit.toString()).toBe('7380.00')
    expect(balance.totals.credit.toString()).toBe('7380.00')
  })

  it('separa balance de resultados', () => {
    const balance = TrialBalanceService.build(movimientos)
    // Resultado del ejercicio = ingresos (2000) - gastos (1200) = 800
    expect(balance.netIncome.toString()).toBe('800.00')
  })

  it('detecta el descuadre en vez de disimularlo', () => {
    const roto = [...movimientos.slice(0, 5), { ...movimientos[5]!, credit: Money.fromString('1999.00') }]
    const balance = TrialBalanceService.build(roto)
    expect(balance.balanced).toBe(false)
  })

  it('agrupa al nivel pedido', () => {
    const porCuenta = TrialBalanceService.build(movimientos, 2)
    expect(porCuenta.rows.map((r) => r.accountCode)).toEqual(['10', '12', '40', '50', '60', '70'])
  })

  it('muestra un saldo acreedor en una cuenta de activo sin corregirlo', () => {
    // Un banco en sobregiro es real y tiene que verse tal cual.
    const sobregiro = TrialBalanceService.build([
      { accountCode: '1041', accountName: 'Cuentas corrientes', debit: Money.fromString('100.00'), credit: Money.fromString('500.00') },
      { accountCode: '4511', accountName: 'Prestamos', debit: Money.zero(), credit: Money.fromString('0.00') },
    ])
    expect(sobregiro.rows[0]?.creditBalance.toString()).toBe('400.00')
    expect(sobregiro.rows[0]?.debitBalance.toString()).toBe('0.00')
  })
})

describe('Estados financieros', () => {
  const balance = TrialBalanceService.build([
    { accountCode: '1011', accountName: 'Caja', debit: Money.fromString('5000.00'), credit: Money.fromString('1200.00') },
    { accountCode: '1212', accountName: 'Facturas por cobrar', debit: Money.fromString('1180.00'), credit: Money.zero() },
    { accountCode: '4011', accountName: 'IGV por pagar', debit: Money.zero(), credit: Money.fromString('180.00') },
    { accountCode: '5011', accountName: 'Capital social', debit: Money.zero(), credit: Money.fromString('4000.00') },
    { accountCode: '6011', accountName: 'Compras', debit: Money.fromString('1200.00'), credit: Money.zero() },
    { accountCode: '7011', accountName: 'Ventas', debit: Money.zero(), credit: Money.fromString('2000.00') },
  ])

  it('cuadra activo contra pasivo mas patrimonio mas resultado', () => {
    const esf = FinancialStatementsService.balanceSheet(balance)
    // Activo 3800 + 1180 = 4980 ; Pasivo 180 ; Patrimonio 4000 ; Resultado 800
    expect(esf.totalAssets.toString()).toBe('4980.00')
    expect(esf.totalLiabilities.toString()).toBe('180.00')
    expect(esf.totalEquity.toString()).toBe('4000.00')
    expect(esf.netIncome.toString()).toBe('800.00')
    expect(esf.balanced).toBe(true)
  })

  it('siempre advierte sobre la clasificacion corriente / no corriente', () => {
    const esf = FinancialStatementsService.balanceSheet(balance)
    expect(esf.warnings.some((w) => w.includes('corriente'))).toBe(true)
  })

  it('avisa de una cuenta sin clasificar en vez de perderla en silencio', () => {
    const conCuentaRara = TrialBalanceService.build([
      { accountCode: '1511', accountName: 'Cuenta no mapeada', debit: Money.fromString('100.00'), credit: Money.zero() },
      { accountCode: '5011', accountName: 'Capital', debit: Money.zero(), credit: Money.fromString('100.00') },
    ])
    const esf = FinancialStatementsService.balanceSheet(conCuentaRara)
    expect(esf.warnings.some((w) => w.includes('1511'))).toBe(true)
  })

  it('arma el estado de resultados por naturaleza', () => {
    const er = FinancialStatementsService.incomeStatement(balance)
    expect(er.totalRevenue.toString()).toBe('2000.00')
    expect(er.totalExpenses.toString()).toBe('1200.00')
    expect(er.netIncome.toString()).toBe('800.00')
  })
})

describe('Generacion PLE', () => {
  const fila = {
    period: '2026-08',
    cuo: 'V0001',
    correlative: 'M0001',
    issueDate: new Date('2026-08-15T12:00:00Z'),
    docType: '01',
    serie: 'F001',
    number: '123',
    customerDocType: '6',
    customerDocNumber: '20100070970',
    customerName: 'Cliente Demo SAC',
    taxableBase: Money.fromString('1000.00'),
    igv: Money.fromString('180.00'),
    total: Money.fromString('1180.00'),
    currency: 'PEN',
    exchangeRate: 1,
    accountingState: '1',
  }

  it('separa campos con barra vertical y cierra la linea con una mas', () => {
    const file = PleGenerator.generate({
      bookCode: '140100',
      ruc: '20100070970',
      period: '2026-08',
      rows: [fila],
    })
    const linea = file.content.split('\r\n')[0] ?? ''
    expect(linea.startsWith('20260800|')).toBe(true)
    expect(linea.endsWith('|')).toBe(true)
  })

  it('termina las lineas en CRLF', () => {
    const file = PleGenerator.generate({
      bookCode: '140100',
      ruc: '20100070970',
      period: '2026-08',
      rows: [fila, fila],
    })
    expect(file.content).toContain('\r\n')
    expect(file.lineCount).toBe(2)
  })

  it('escribe los importes vacios como 0.00 y no en blanco', () => {
    const file = PleGenerator.generate({
      bookCode: '140100',
      ruc: '20100070970',
      period: '2026-08',
      rows: [fila],
    })
    // El campo 20 (ISC) no se envio: debe salir como 0.00
    const campos = (file.content.split('\r\n')[0] ?? '').split('|')
    expect(campos[19]).toBe('0.00')
  })

  it('neutraliza una barra vertical dentro de la razon social', () => {
    // Sin esto, el separador dentro del dato corre todas las columnas
    // siguientes y corrompe el archivo entero.
    const file = PleGenerator.generate({
      bookCode: '140100',
      ruc: '20100070970',
      period: '2026-08',
      rows: [{ ...fila, customerName: 'Empresa | Rara SAC' }],
    })
    const campos = (file.content.split('\r\n')[0] ?? '').split('|')
    expect(campos[11]).toBe('Empresa   Rara SAC')
    expect(campos).toHaveLength(34) // 33 campos + el cierre
  })

  it('exige los campos obligatorios diciendo cual falta', () => {
    expect(() =>
      PleGenerator.generate({
        bookCode: '140100',
        ruc: '20100070970',
        period: '2026-08',
        rows: [{ ...fila, serie: null }],
      }),
    ).toThrow(/Serie del comprobante/)
  })

  it('formatea la fecha como DD/MM/AAAA en hora de Lima', () => {
    const file = PleGenerator.generate({
      bookCode: '140100',
      ruc: '20100070970',
      period: '2026-08',
      // 03:00Z del 16 es todavia el 15 a las 22:00 en Lima.
      rows: [{ ...fila, issueDate: new Date('2026-08-16T03:00:00Z') }],
    })
    expect((file.content.split('|')[3] ?? '')).toBe('15/08/2026')
  })

  it('arma el nombre del archivo segun la nomenclatura', () => {
    const name = buildFileName({
      ruc: '20100070970',
      period: TaxPeriod.create('2026-08'),
      bookCode: '140100',
      hasOperations: true,
      currencyIndicator: '1',
    })
    expect(name).toBe('LE20100070970202608001401000000' + '1111.TXT')
    expect(name).toHaveLength(39) // 35 + ".TXT"
  })

  it('marca el libro sin operaciones con indicador 0', () => {
    const file = PleGenerator.generate({
      bookCode: '140100',
      ruc: '20100070970',
      period: '2026-08',
      rows: [],
    })
    // Un periodo sin movimientos igual se presenta.
    expect(file.content).toBe('')
    expect(file.fileName).toContain('0111.TXT')
  })

  it('advierte siempre sobre la version de la estructura', () => {
    const file = PleGenerator.generate({
      bookCode: '140100',
      ruc: '20100070970',
      period: '2026-08',
      rows: [fila],
    })
    expect(file.warnings.some((w) => w.includes('resolucion'))).toBe(true)
  })

  it('convierte a Latin-1 conservando la enie', () => {
    const buffer = PleGenerator.toBuffer('COMPANIA ÑANDU SAC')
    expect(buffer.toString('latin1')).toContain('Ñ')
  })

  it('rechaza un libro sin estructura definida', () => {
    expect(() =>
      PleGenerator.generate({ bookCode: '999999', ruc: '20100070970', period: '2026-08', rows: [] }),
    ).toThrow(/No hay estructura definida/)
  })
})

describe('Asiento automatico desde comprobante', () => {
  const venta = {
    kind: 'VENTA' as const,
    docType: '01',
    serie: 'F001',
    number: '123',
    issueDate: new Date('2026-08-15T12:00:00Z'),
    period: '2026-08',
    counterpartyDocType: '6',
    counterpartyDocNumber: '20100070970',
    counterpartyName: 'Cliente Demo SAC',
    taxableBase: Money.fromString('1000.00'),
    exemptAmount: Money.zero(),
    unaffectedAmount: Money.zero(),
    igv: Money.fromString('180.00'),
    total: Money.fromString('1180.00'),
  }

  it('arma la venta: cobrar al debe, IGV e ingreso al haber', () => {
    const asiento = EntryBuilderService.build(venta)
    expect(asiento.lines).toHaveLength(3)
    expect(asiento.lines[0]).toMatchObject({ accountCode: '1212' })
    expect(asiento.lines[0]?.debit.toString()).toBe('1180.00')
    expect(asiento.lines[1]?.credit.toString()).toBe('180.00')
    expect(asiento.lines[2]?.credit.toString()).toBe('1000.00')
  })

  it('arma la compra al reves: gasto e IGV al debe, pagar al haber', () => {
    const asiento = EntryBuilderService.build({ ...venta, kind: 'COMPRA' })
    expect(asiento.lines[0]).toMatchObject({ accountCode: '6011' })
    expect(asiento.lines[0]?.debit.toString()).toBe('1000.00')
    expect(asiento.lines[2]?.credit.toString()).toBe('1180.00')
  })

  it('el asiento generado siempre cuadra', () => {
    for (const kind of ['VENTA', 'COMPRA'] as const) {
      const asiento = EntryBuilderService.build({ ...venta, kind })
      expect(JournalService.totals(asiento.lines).balanced).toBe(true)
    }
  })

  it('invierte el asiento en una nota de credito', () => {
    const nota = EntryBuilderService.build({ ...venta, docType: '07' })
    // Lo que en la factura iba al debe, aqui va al haber.
    expect(nota.lines[0]?.credit.toString()).toBe('1180.00')
    expect(nota.lines[0]?.debit.toString()).toBe('0.00')
    expect(nota.glossa).toContain('Nota de credito')
  })

  it('omite la linea de IGV en una operacion exonerada', () => {
    const exonerada = EntryBuilderService.build({
      ...venta,
      taxableBase: Money.zero(),
      exemptAmount: Money.fromString('1000.00'),
      igv: Money.zero(),
      total: Money.fromString('1000.00'),
    })
    // Sin IGV quedan dos lineas: una linea en cero no aporta y el PLE la rechaza.
    expect(exonerada.lines).toHaveLength(2)
    expect(JournalService.totals(exonerada.lines).balanced).toBe(true)
  })

  it('permite cambiar las cuentas sin tocar el codigo', () => {
    const asiento = EntryBuilderService.build(venta, { revenue: '7012', receivable: '1213' })
    expect(asiento.lines[0]?.accountCode).toBe('1213')
    expect(asiento.lines[2]?.accountCode).toBe('7012')
  })

  it('arrastra el documento del tercero, que el PLE exige', () => {
    const asiento = EntryBuilderService.build(venta)
    expect(asiento.lines.every((l) => l.counterpartyDoc === '20100070970')).toBe(true)
    expect(asiento.lines.every((l) => l.documentRef === 'F001-123')).toBe(true)
  })
})
