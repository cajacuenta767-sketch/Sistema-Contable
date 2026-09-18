import { createHash } from 'node:crypto'
import { ConflictError, NotFoundError, ValidationError } from '@/core/domain/errors'
import { Permissions } from '@/core/domain/services/permissions'
import type { AuthenticatedUser, TaxRegime } from '@/core/domain/types'
import { Money } from '@/core/domain/value-objects/money'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'
import { TrialBalanceService, type TrialBalance } from '@/core/domain/accounting/trial-balance'
import {
  FinancialStatementsService,
  type BalanceSheet,
  type IncomeStatement,
} from '@/core/domain/accounting/financial-statements'
import { PleGenerator, type PleFile, type PleRow } from '@/core/domain/accounting/ple/generator'
import type {
  JournalRepository,
  PleExportRepository,
  TaxDocumentRepository,
  TaxReturnRecord,
  TaxReturnRepository,
} from '../ports/accounting'
import type { AuditLogRepository, ClientRepository, Clock } from '../ports'

/**
 * Reportes contables: balance de comprobacion, estados financieros, libros
 * electronicos y determinacion de la declaracion mensual.
 *
 * Regla que atraviesa todo: NINGUN reporte se emite sobre un balance
 * descuadrado. Si las sumas del debe y del haber no coinciden hay un asiento
 * mal grabado, y presentar un estado financiero construido encima seria
 * presentar una cifra falsa.
 */
export class AccountingReportsUseCases {
  constructor(
    private readonly journal: JournalRepository,
    private readonly documents: TaxDocumentRepository,
    private readonly clients: ClientRepository,
    private readonly taxReturns: TaxReturnRepository,
    private readonly pleExports: PleExportRepository,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  // -------------------------------------------------------------------------
  // Balance de comprobacion y estados financieros
  // -------------------------------------------------------------------------

  async trialBalance(
    user: AuthenticatedUser,
    clientId: string,
    period: string,
    options: { cumulative?: boolean; level?: number } = {},
  ): Promise<TrialBalance> {
    Permissions.assert(user, 'client:read:own')
    TaxPeriod.create(period)

    const sums = await this.journal.accountSums(clientId, period, options.cumulative ?? true)
    return TrialBalanceService.build(sums, options.level ?? 4)
  }

  async financialStatements(
    user: AuthenticatedUser,
    clientId: string,
    period: string,
  ): Promise<{
    trialBalance: TrialBalance
    balanceSheet: BalanceSheet
    incomeStatement: IncomeStatement
  }> {
    const trialBalance = await this.trialBalance(user, clientId, period, {
      cumulative: true,
      level: 4,
    })

    if (!trialBalance.balanced) {
      throw new ConflictError(
        `No se pueden emitir estados financieros: el balance de comprobacion de ${period} ` +
          `no cuadra (debe ${trialBalance.totals.debit.toString()} contra haber ` +
          `${trialBalance.totals.credit.toString()}). Revise los asientos del periodo.`,
      )
    }

    return {
      trialBalance,
      balanceSheet: FinancialStatementsService.balanceSheet(trialBalance),
      incomeStatement: FinancialStatementsService.incomeStatement(trialBalance),
    }
  }

  /** Libro Mayor: movimientos agrupados por cuenta, con saldo corrido. */
  async ledger(user: AuthenticatedUser, clientId: string, period: string, accountCode?: string) {
    Permissions.assert(user, 'client:read:own')
    TaxPeriod.create(period)

    const lines = await this.journal.linesForPeriod(clientId, period)
    const filtered = accountCode
      ? lines.filter((l) => l.accountCode.startsWith(accountCode))
      : lines

    const byAccount = new Map<
      string,
      { accountCode: string; accountName: string; movements: typeof filtered; debit: Money; credit: Money }
    >()

    for (const line of filtered) {
      const existing = byAccount.get(line.accountCode)
      if (existing) {
        existing.movements.push(line)
        existing.debit = existing.debit.add(line.debit)
        existing.credit = existing.credit.add(line.credit)
      } else {
        byAccount.set(line.accountCode, {
          accountCode: line.accountCode,
          accountName: line.accountName,
          movements: [line],
          debit: line.debit,
          credit: line.credit,
        })
      }
    }

    return [...byAccount.values()]
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
      .map((account) => ({
        ...account,
        balance: account.debit.subtract(account.credit),
      }))
  }

  // -------------------------------------------------------------------------
  // Libros electronicos
  // -------------------------------------------------------------------------

  /**
   * Genera un libro electronico.
   *
   * Devuelve el archivo en memoria y deja constancia de la generacion con su
   * hash. Si SUNAT observa un libro meses despues, hay que poder demostrar
   * exactamente que se presento y cuando.
   */
  async generatePleBook(
    user: AuthenticatedUser,
    input: { clientId: string; period: string; bookCode: string },
  ): Promise<PleFile> {
    Permissions.assert(user, 'client:write')
    TaxPeriod.create(input.period)

    const client = await this.clients.findById(input.clientId)
    if (!client) throw new NotFoundError('el cliente', input.clientId)

    const rows = await this.buildBookRows(input.clientId, input.period, input.bookCode)

    const file = PleGenerator.generate({
      bookCode: input.bookCode,
      ruc: client.ruc,
      period: input.period,
      rows,
    })

    const checksum = createHash('sha256').update(file.content, 'utf8').digest('hex')

    await this.pleExports.record({
      clientId: input.clientId,
      period: input.period,
      bookCode: file.bookCode,
      bookName: file.bookName,
      fileName: file.fileName,
      layoutVersion: file.layoutVersion,
      lineCount: file.lineCount,
      totalDebit: file.totals ? Money.fromString(file.totals.debit) : null,
      totalCredit: file.totals ? Money.fromString(file.totals.credit) : null,
      checksum,
      generatedById: user.id,
    })

    await this.audit.record({
      action: 'ple.generate',
      entity: 'Client',
      entityId: input.clientId,
      userId: user.id,
      metadata: {
        period: input.period,
        bookCode: input.bookCode,
        fileName: file.fileName,
        lineCount: file.lineCount,
        checksum,
      },
    })

    return file
  }

  async listPleExports(user: AuthenticatedUser, clientId: string, period?: string) {
    Permissions.assert(user, 'client:read:own')
    return this.pleExports.list(clientId, period)
  }

  private async buildBookRows(
    clientId: string,
    period: string,
    bookCode: string,
  ): Promise<PleRow[]> {
    switch (bookCode) {
      case '140100':
        return this.buildSalesRows(clientId, period)
      case '080100':
        return this.buildPurchasesRows(clientId, period)
      case '050100':
        return this.buildJournalRows(clientId, period)
      case '060100':
        return this.buildLedgerRows(clientId, period)
      default:
        throw new ValidationError(`Libro no soportado: ${bookCode}`)
    }
  }

  private async buildSalesRows(clientId: string, period: string): Promise<PleRow[]> {
    const documents = await this.documents.listForBook(clientId, period, 'VENTA')

    return documents.map((document, index) => ({
      period,
      cuo: `V${String(index + 1).padStart(6, '0')}`,
      correlative: `M${String(index + 1).padStart(6, '0')}`,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      docType: document.docType,
      serie: document.serie,
      number: document.number,
      customerDocType: document.counterpartyDocType,
      customerDocNumber: document.counterpartyDocNumber,
      customerName: document.counterpartyName,
      // Un comprobante anulado va al libro con importes en cero: omitirlo
      // dejaria un salto en la numeracion, que SUNAT observa.
      taxableBase: document.status === 'ANULADO' ? Money.zero() : document.taxableBase,
      igv: document.status === 'ANULADO' ? Money.zero() : document.igv,
      exemptAmount: document.status === 'ANULADO' ? Money.zero() : document.exemptAmount,
      unaffectedAmount: document.status === 'ANULADO' ? Money.zero() : document.unaffectedAmount,
      isc: document.isc,
      otherCharges: document.otherCharges,
      total: document.status === 'ANULADO' ? Money.zero() : document.total,
      currency: document.currency,
      exchangeRate: Number(document.exchangeRate),
      refIssueDate: document.refIssueDate,
      refDocType: document.refDocType,
      refSerie: document.refSerie,
      refNumber: document.refNumber,
      // Estado 1 = anotacion oportuna. El 2 se usa para lo anotado con atraso.
      accountingState: document.status === 'ANULADO' ? '2' : '1',
    }))
  }

  private async buildPurchasesRows(clientId: string, period: string): Promise<PleRow[]> {
    const documents = await this.documents.listForBook(clientId, period, 'COMPRA')

    return documents.map((document, index) => ({
      period,
      cuo: `C${String(index + 1).padStart(6, '0')}`,
      correlative: `M${String(index + 1).padStart(6, '0')}`,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      docType: document.docType,
      serie: document.serie,
      number: document.number,
      supplierDocType: document.counterpartyDocType,
      supplierDocNumber: document.counterpartyDocNumber,
      supplierName: document.counterpartyName,
      taxableBase: document.status === 'ANULADO' ? Money.zero() : document.taxableBase,
      igv: document.status === 'ANULADO' ? Money.zero() : document.igv,
      unaffectedAmount: document.status === 'ANULADO' ? Money.zero() : document.unaffectedAmount,
      isc: document.isc,
      otherCharges: document.otherCharges,
      total: document.status === 'ANULADO' ? Money.zero() : document.total,
      currency: document.currency,
      exchangeRate: Number(document.exchangeRate),
      refIssueDate: document.refIssueDate,
      refDocType: document.refDocType,
      refSerie: document.refSerie,
      refNumber: document.refNumber,
      detractionDate: document.detractionDate,
      detractionNumber: document.detractionNumber,
      accountingState: document.status === 'ANULADO' ? '2' : '1',
    }))
  }

  private async buildJournalRows(clientId: string, period: string): Promise<PleRow[]> {
    const lines = await this.journal.linesForPeriod(clientId, period)

    return lines.map((line) => ({
      period,
      cuo: `A${String(line.entryNumber).padStart(6, '0')}`,
      correlative: String(line.entryNumber).padStart(6, '0'),
      accountCode: line.accountCode,
      counterpartyDocType: line.counterpartyDocType,
      counterpartyDocNumber: line.counterpartyDocNumber,
      docType: line.docType,
      serie: line.serie,
      number: line.docNumber,
      entryDate: line.date,
      issueDate: line.date,
      glossa: line.glossa,
      debit: line.debit,
      credit: line.credit,
      accountingState: '1',
    }))
  }

  private async buildLedgerRows(clientId: string, period: string): Promise<PleRow[]> {
    const lines = await this.journal.linesForPeriod(clientId, period)

    return lines.map((line) => ({
      period,
      cuo: `A${String(line.entryNumber).padStart(6, '0')}`,
      correlative: String(line.entryNumber).padStart(6, '0'),
      accountCode: line.accountCode,
      entryDate: line.date,
      glossa: line.glossa,
      debit: line.debit,
      credit: line.credit,
      accountingState: '1',
    }))
  }

  // -------------------------------------------------------------------------
  // Declaracion mensual
  // -------------------------------------------------------------------------

  /**
   * Determina la base de la declaracion mensual de IGV y Renta.
   *
   * IGV: debito fiscal (ventas) menos credito fiscal (compras) menos el saldo
   * a favor arrastrado del periodo anterior. Si el resultado es negativo no se
   * paga IGV y el saldo pasa al mes siguiente.
   *
   * Renta: pago a cuenta segun el regimen. Las tasas son las generales; un
   * contribuyente del Regimen General con coeficiente propio debe ajustarlas.
   *
   * ESTO NO PRESENTA LA DECLARACION. No existe API publica de SUNAT para
   * hacerlo desde un sistema externo: la presentacion se hace en SUNAT
   * Operaciones en Linea. Aqui se calcula la base y se registra la constancia.
   */
  async computeTaxReturn(
    user: AuthenticatedUser,
    clientId: string,
    period: string,
  ): Promise<{ taxReturn: TaxReturnRecord; warnings: string[] }> {
    Permissions.assert(user, 'client:write')
    const taxPeriod = TaxPeriod.create(period)

    const client = await this.clients.findById(clientId)
    if (!client) throw new NotFoundError('el cliente', clientId)

    const warnings: string[] = []

    const [sales, purchases, previous] = await Promise.all([
      this.documents.totalsByPeriod(clientId, period, 'VENTA'),
      this.documents.totalsByPeriod(clientId, period, 'COMPRA'),
      this.taxReturns.find(clientId, taxPeriod.previous().value),
    ])

    if (sales.count === 0 && purchases.count === 0) {
      warnings.push(
        `No hay comprobantes registrados en ${period}. La declaracion se calcula en cero.`,
      )
    }

    const previousCredit = previous?.carryForward ?? Money.zero()
    const netVat = sales.igv.subtract(purchases.igv).subtract(previousCredit)

    // Si el credito supera al debito no se paga: el saldo pasa al mes que viene.
    const igvToPay = netVat.isPositive() ? netVat : Money.zero()
    const carryForward = netVat.isNegative() ? netVat.negate() : Money.zero()

    const { rate, note } = incomeTaxRateFor(client.taxRegime)
    if (note) warnings.push(note)

    const incomeTaxBase = sales.taxableBase.add(sales.exemptAmount).add(sales.unaffectedAmount)
    const incomeTax = incomeTaxBase.multiplyByRate(rate)

    const taxReturn = await this.taxReturns.upsert({
      clientId,
      period,
      salesBase: sales.taxableBase,
      salesIgv: sales.igv,
      purchasesBase: purchases.taxableBase,
      purchasesIgv: purchases.igv,
      previousCredit,
      igvToPay,
      carryForward,
      incomeTaxBase,
      incomeTaxRate: rate,
      incomeTax,
      totalToPay: igvToPay.add(incomeTax),
      createdById: user.id,
    })

    warnings.push(
      'Este calculo es la base para declarar. La presentacion se realiza en SUNAT ' +
        'Operaciones en Linea: el sistema no presenta declaraciones.',
    )

    await this.audit.record({
      action: 'tax_return.compute',
      entity: 'TaxReturn',
      entityId: taxReturn.id,
      userId: user.id,
      metadata: { clientId, period, totalToPay: taxReturn.totalToPay.toString() },
    })

    return { taxReturn, warnings }
  }

  /** Registra que la declaracion se presento, con su numero de orden. */
  async markTaxReturnPresented(
    user: AuthenticatedUser,
    clientId: string,
    period: string,
    orderNumber: string,
  ): Promise<TaxReturnRecord> {
    Permissions.assert(user, 'client:write')

    const existing = await this.taxReturns.find(clientId, period)
    if (!existing) {
      throw new NotFoundError('la declaracion del periodo', period)
    }
    if (!orderNumber.trim()) {
      throw new ValidationError('El numero de orden de la constancia es obligatorio')
    }

    const presented = await this.taxReturns.markPresented(
      existing.id,
      orderNumber.trim(),
      this.clock.now(),
    )

    await this.audit.record({
      action: 'tax_return.present',
      entity: 'TaxReturn',
      entityId: existing.id,
      userId: user.id,
      metadata: { clientId, period, orderNumber },
    })

    return presented
  }

  async listTaxReturns(user: AuthenticatedUser, clientId: string) {
    Permissions.assert(user, 'client:read:own')
    return this.taxReturns.list(clientId, 24)
  }
}

/**
 * Tasa del pago a cuenta de renta segun el regimen.
 *
 * Son las tasas generales. El Regimen General admite calcular por coeficiente
 * (impuesto del ejercicio anterior sobre ingresos netos del ejercicio
 * anterior) cuando resulta mayor, y el sistema no lo hace automaticamente: se
 * avisa para que el contador lo verifique.
 */
function incomeTaxRateFor(regime: TaxRegime): { rate: string; note?: string } {
  switch (regime) {
    case 'NRUS':
      return {
        rate: '0',
        note:
          'El cliente esta en el Nuevo RUS: paga una cuota fija mensual segun su categoria, ' +
          'no un porcentaje sobre ingresos. Verifique la cuota que corresponde.',
      }
    case 'RER':
      return { rate: '0.015' }
    case 'MYPE':
      return {
        rate: '0.01',
        note:
          'Se aplico el 1% del Regimen MYPE Tributario. Superadas las 300 UIT de ingresos ' +
          'netos anuales corresponde el 1.5%: verifique el acumulado del ejercicio.',
      }
    case 'GENERAL':
      return {
        rate: '0.015',
        note:
          'Se aplico el 1.5% del Regimen General. Si el coeficiente del ejercicio anterior ' +
          'resulta mayor, corresponde usar ese coeficiente: verifiquelo.',
      }
  }
}
