import { ConflictError, NotFoundError, ValidationError } from '@/core/domain/errors'
import { Permissions } from '@/core/domain/services/permissions'
import type { AuthenticatedUser } from '@/core/domain/types'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'
import { Money } from '@/core/domain/value-objects/money'
import { AccountCode } from '@/core/domain/accounting/account-code'
import { TaxService } from '@/core/domain/accounting/tax'
import { JournalService } from '@/core/domain/accounting/journal'
import { EntryBuilderService } from '@/core/domain/accounting/entry-builder'
import type {
  AccountRecord,
  AccountRepository,
  AccountingPeriodRepository,
  CreateTaxDocumentInput,
  DocumentKind,
  JournalEntryRecord,
  JournalRepository,
  TaxDocumentFilters,
  TaxDocumentRecord,
  TaxDocumentRepository,
} from '../ports/accounting'
import type { AuditLogRepository, Clock, Page, PageParams } from '../ports'
import { normalizePage } from './clients'

/**
 * Casos de uso del motor contable.
 *
 * Dos invariantes que se verifican SIEMPRE, sin excepcion configurable:
 *
 *  1. No se graba nada en un periodo CERRADO. Un periodo cerrado es un periodo
 *     ya declarado; si se le agregan asientos, los libros dejan de coincidir
 *     con la declaracion presentada y eso es exactamente lo que una
 *     fiscalizacion busca.
 *
 *  2. Ningun asiento entra descuadrado. La validacion esta en el dominio y se
 *     aplica igual al asiento manual que al automatico.
 */
export class AccountingUseCases {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly documents: TaxDocumentRepository,
    private readonly journal: JournalRepository,
    private readonly periods: AccountingPeriodRepository,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  // -------------------------------------------------------------------------
  // Plan de cuentas
  // -------------------------------------------------------------------------

  async chart(user: AuthenticatedUser, clientId: string): Promise<AccountRecord[]> {
    Permissions.assert(user, 'client:read:own')
    return this.accounts.chartFor(clientId)
  }

  async createAccount(
    user: AuthenticatedUser,
    clientId: string,
    input: { code: string; name: string; isPosting: boolean },
  ): Promise<AccountRecord> {
    Permissions.assert(user, 'client:write')

    const code = AccountCode.create(input.code)
    if (!input.name.trim()) throw new ValidationError('El nombre de la cuenta es obligatorio')

    const existing = await this.accounts.findByCode(clientId, code.value)
    if (existing?.clientId === clientId) {
      throw new ConflictError(`La cuenta ${code.value} ya existe en el plan de este cliente`)
    }

    // La cuenta debe colgar de una existente: un plan con huecos jerarquicos
    // no se puede totalizar por elemento ni presentar.
    if (code.parent) {
      const parent = await this.accounts.findByCode(clientId, code.parent)
      if (!parent) {
        throw new ValidationError(
          `No existe la cuenta superior ${code.parent}. Creela antes de ${code.value}.`,
        )
      }
    }

    const created = await this.accounts.create({
      code: code.value,
      name: input.name.trim(),
      level: code.level,
      element: code.element,
      parent: code.parent,
      nature: code.nature,
      isPosting: input.isPosting,
      active: true,
      clientId,
    })

    await this.audit.record({
      action: 'account.create',
      entity: 'Account',
      entityId: created.id,
      userId: user.id,
      metadata: { clientId, code: created.code },
    })

    return created
  }

  // -------------------------------------------------------------------------
  // Comprobantes
  // -------------------------------------------------------------------------

  async listDocuments(
    user: AuthenticatedUser,
    filters: TaxDocumentFilters,
    page: Partial<PageParams>,
  ): Promise<Page<TaxDocumentRecord>> {
    Permissions.assert(user, 'client:read:own')
    return this.documents.list(filters, normalizePage(page))
  }

  async getDocument(user: AuthenticatedUser, id: string): Promise<TaxDocumentRecord> {
    Permissions.assert(user, 'client:read:own')
    const document = await this.documents.findById(id)
    if (!document) throw new NotFoundError('el comprobante', id)
    return document
  }

  /**
   * Registra un comprobante y genera su asiento en BORRADOR.
   *
   * El asiento nace en borrador y no confirmado a proposito: el automatismo
   * acierta en el caso normal, pero la cuenta de destino de una compra
   * (mercaderia, servicio, activo fijo) la decide el contador. Confirmar es un
   * acto deliberado.
   */
  async registerDocument(
    user: AuthenticatedUser,
    input: Omit<CreateTaxDocumentInput, 'period'> & { period?: string },
  ): Promise<{ document: TaxDocumentRecord; entry: JournalEntryRecord | null; warnings: string[] }> {
    Permissions.assert(user, 'client:write')

    const warnings: string[] = []
    const period = input.period ?? TaxPeriod.fromDate(input.issueDate).value
    TaxPeriod.create(period) // valida el formato

    await this.assertPeriodOpen(input.clientId, period)

    // El IGV declarado tiene que corresponder a la base. Un centimo de
    // tolerancia por el redondeo por linea de los sistemas de facturacion;
    // mas que eso es un error que no debe entrar al libro.
    if (input.taxableBase.isPositive()) {
      TaxService.assertIgvConsistent(input.taxableBase, input.igv)
    }

    const expectedTotal = input.taxableBase
      .add(input.exemptAmount)
      .add(input.unaffectedAmount)
      .add(input.igv)
      .add(input.isc)
      .add(input.otherCharges)

    if (!expectedTotal.equals(input.total)) {
      throw new ValidationError(
        `El importe total (${input.total.toString()}) no coincide con la suma de los ` +
          `conceptos (${expectedTotal.toString()})`,
      )
    }

    if (input.currency !== 'PEN' && input.exchangeRate === '1') {
      warnings.push(
        'El comprobante esta en moneda extranjera con tipo de cambio 1. ' +
          'Verifique el tipo de cambio de la fecha de emision.',
      )
    }

    const document = await this.documents.create({ ...input, period })

    let entry: JournalEntryRecord | null = null
    try {
      entry = await this.buildEntryFor(document, user)
      await this.documents.linkEntry(document.id, entry.id)
    } catch (error) {
      // Si el asiento no sale, el comprobante YA quedo registrado: no se
      // pierde el trabajo de digitacion. Se avisa y se puede asentar a mano.
      warnings.push(
        `El comprobante se registro, pero no se pudo generar su asiento automatico: ${
          error instanceof Error ? error.message : 'error desconocido'
        }. Registrelo manualmente.`,
      )
    }

    await this.audit.record({
      action: 'document.register',
      entity: 'TaxDocument',
      entityId: document.id,
      userId: user.id,
      metadata: {
        clientId: input.clientId,
        kind: input.kind,
        reference: `${input.serie}-${input.number}`,
        total: input.total.toString(),
      },
    })

    return { document, entry, warnings }
  }

  /** Importacion masiva. Devuelve cuantos entraron y cuantos ya existian. */
  async importDocuments(
    user: AuthenticatedUser,
    clientId: string,
    inputs: CreateTaxDocumentInput[],
  ): Promise<{ received: number; created: number; skipped: number; errors: string[] }> {
    Permissions.assert(user, 'client:write')

    const errors: string[] = []
    const valid: CreateTaxDocumentInput[] = []

    for (const [index, input] of inputs.entries()) {
      try {
        TaxPeriod.create(input.period)
        if (input.taxableBase.isPositive()) {
          TaxService.assertIgvConsistent(input.taxableBase, input.igv)
        }
        valid.push({ ...input, clientId })
      } catch (error) {
        // Una fila mala no aborta la importacion de las otras mil.
        errors.push(
          `Fila ${index + 1} (${input.serie}-${input.number}): ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
        )
      }
    }

    const created = await this.documents.createManyIgnoringDuplicates(valid)

    await this.audit.record({
      action: 'document.import',
      entity: 'Client',
      entityId: clientId,
      userId: user.id,
      metadata: { received: inputs.length, created, errors: errors.length },
    })

    return {
      received: inputs.length,
      created,
      skipped: valid.length - created,
      errors,
    }
  }

  /**
   * Genera (o regenera) el asiento de un comprobante ya registrado.
   *
   * Lo necesita la importacion masiva: al traer miles de comprobantes de SIRE
   * o de un Excel no se asienta uno por uno en el momento —seria lentisimo—,
   * sino que se asientan despues, en bloque o a demanda.
   */
  async generateEntryForDocument(
    user: AuthenticatedUser,
    documentId: string,
  ): Promise<JournalEntryRecord> {
    Permissions.assert(user, 'client:write')

    const document = await this.getDocument(user, documentId)
    await this.assertPeriodOpen(document.clientId, document.period)

    if (document.entryId) {
      throw new ConflictError(
        'El comprobante ya tiene un asiento. Extornelo antes de volver a generarlo.',
      )
    }
    if (document.status === 'ANULADO') {
      throw new ConflictError('Un comprobante anulado no genera asiento')
    }

    const entry = await this.buildEntryFor(document, user)
    await this.documents.linkEntry(document.id, entry.id)
    return entry
  }

  async voidDocument(user: AuthenticatedUser, id: string): Promise<TaxDocumentRecord> {
    Permissions.assert(user, 'client:write')
    const document = await this.getDocument(user, id)
    await this.assertPeriodOpen(document.clientId, document.period)

    const voided = await this.documents.void_(id)

    await this.audit.record({
      action: 'document.void',
      entity: 'TaxDocument',
      entityId: id,
      userId: user.id,
      metadata: { reference: `${document.serie}-${document.number}` },
    })

    return voided
  }

  // -------------------------------------------------------------------------
  // Asientos
  // -------------------------------------------------------------------------

  async listEntries(
    user: AuthenticatedUser,
    filters: { clientId: string; period?: string; status?: JournalEntryRecord['status'] },
    page: Partial<PageParams>,
  ): Promise<Page<JournalEntryRecord>> {
    Permissions.assert(user, 'client:read:own')
    return this.journal.list(filters, normalizePage(page))
  }

  async getEntry(user: AuthenticatedUser, id: string): Promise<JournalEntryRecord> {
    Permissions.assert(user, 'client:read:own')
    const entry = await this.journal.findById(id)
    if (!entry) throw new NotFoundError('el asiento', id)
    return entry
  }

  async createManualEntry(
    user: AuthenticatedUser,
    input: {
      clientId: string
      date: Date
      period: string
      glossa: string
      source?: 'MANUAL' | 'AJUSTE'
      lines: { accountCode: string; debit: Money; credit: Money; glossa?: string | null }[]
    },
  ): Promise<JournalEntryRecord> {
    Permissions.assert(user, 'client:write')
    await this.assertPeriodOpen(input.clientId, input.period)

    // Toda la regla de partida doble vive en el dominio.
    JournalService.assertValid({
      date: input.date,
      period: input.period,
      glossa: input.glossa,
      lines: input.lines,
    })

    const chart = await this.accounts.chartFor(input.clientId)
    const byCode = new Map(chart.map((a) => [a.code, a]))

    const lines = input.lines.map((line, index) => {
      const account = byCode.get(line.accountCode)
      if (!account) {
        throw new ValidationError(
          `Linea ${index + 1}: la cuenta ${line.accountCode} no existe en el plan de cuentas`,
        )
      }
      // Las cuentas agrupadoras no reciben movimiento: cargar en "60 Compras"
      // en vez de en una divisionaria impide analizar y rompe el PLE.
      if (!account.isPosting) {
        throw new ValidationError(
          `Linea ${index + 1}: la cuenta ${account.code} (${account.name}) es de agrupacion ` +
            'y no admite movimiento. Use una divisionaria de ultimo nivel.',
        )
      }
      return {
        order: index + 1,
        accountCode: account.code,
        accountName: account.name,
        debit: line.debit,
        credit: line.credit,
        glossa: line.glossa ?? null,
        counterpartyDocType: null,
        counterpartyDocNumber: null,
        docType: null,
        serie: null,
        docNumber: null,
      }
    })

    const entry = await this.journal.create({
      clientId: input.clientId,
      date: input.date,
      period: input.period,
      glossa: input.glossa.trim(),
      source: input.source ?? 'MANUAL',
      status: 'BORRADOR',
      createdById: user.id,
      lines,
    })

    await this.audit.record({
      action: 'entry.create',
      entity: 'JournalEntry',
      entityId: entry.id,
      userId: user.id,
      metadata: { clientId: input.clientId, period: input.period, number: entry.number },
    })

    return entry
  }

  async confirmEntry(user: AuthenticatedUser, id: string): Promise<JournalEntryRecord> {
    Permissions.assert(user, 'client:write')
    const entry = await this.getEntry(user, id)

    if (entry.status !== 'BORRADOR') {
      throw new ConflictError(`El asiento ya esta ${entry.status.toLowerCase()}`)
    }
    await this.assertPeriodOpen(entry.clientId, entry.period)

    // Se revalida al confirmar: entre la creacion y la confirmacion pudo
    // editarse, y un asiento confirmado descuadrado envenena todo el mayor.
    if (!entry.totalDebit.equals(entry.totalCredit)) {
      throw new ConflictError(
        `El asiento no cuadra: debe ${entry.totalDebit.toString()} contra haber ` +
          `${entry.totalCredit.toString()}`,
      )
    }

    await this.journal.setStatus(id, 'CONFIRMADO')

    await this.audit.record({
      action: 'entry.confirm',
      entity: 'JournalEntry',
      entityId: id,
      userId: user.id,
      metadata: { number: entry.number, period: entry.period },
    })

    return { ...entry, status: 'CONFIRMADO' }
  }

  /**
   * Extorna un asiento confirmado.
   *
   * No se borra: se crea el asiento inverso y ambos quedan. Borrar un asiento
   * confirmado destruye el rastro, y en contabilidad el rastro es el punto.
   */
  async reverseEntry(
    user: AuthenticatedUser,
    id: string,
    reason: string,
  ): Promise<JournalEntryRecord> {
    Permissions.assert(user, 'client:write')
    const entry = await this.getEntry(user, id)

    if (entry.status !== 'CONFIRMADO') {
      throw new ConflictError('Solo se puede extornar un asiento confirmado')
    }
    if (entry.reversedById) {
      throw new ConflictError('Este asiento ya fue extornado')
    }
    if (!reason.trim()) {
      throw new ValidationError('El motivo del extorno es obligatorio')
    }

    await this.assertPeriodOpen(entry.clientId, entry.period)

    const reversal = await this.journal.create({
      clientId: entry.clientId,
      date: this.clock.now(),
      period: entry.period,
      glossa: `EXTORNO asiento ${entry.number}: ${reason.trim()}`.slice(0, 200),
      source: 'AJUSTE',
      status: 'CONFIRMADO',
      createdById: user.id,
      reversesId: entry.id,
      lines: entry.lines.map((line, index) => ({
        order: index + 1,
        accountCode: line.accountCode,
        accountName: line.accountName,
        // La inversion: lo que estaba al debe va al haber.
        debit: line.credit,
        credit: line.debit,
        glossa: line.glossa,
        counterpartyDocType: line.counterpartyDocType,
        counterpartyDocNumber: line.counterpartyDocNumber,
        docType: line.docType,
        serie: line.serie,
        docNumber: line.docNumber,
      })),
    })

    await this.journal.linkReversal(entry.id, reversal.id)

    await this.audit.record({
      action: 'entry.reverse',
      entity: 'JournalEntry',
      entityId: entry.id,
      userId: user.id,
      metadata: { reversalId: reversal.id, reason },
    })

    return reversal
  }

  // -------------------------------------------------------------------------
  // Periodos
  // -------------------------------------------------------------------------

  async listPeriods(user: AuthenticatedUser, clientId: string) {
    Permissions.assert(user, 'client:read:own')
    return this.periods.list(clientId, 24)
  }

  async closePeriod(user: AuthenticatedUser, clientId: string, period: string) {
    Permissions.assert(user, 'client:write')
    TaxPeriod.create(period)

    // No se cierra con asientos en borrador: quedarian fuera de los libros y
    // el periodo cerrado no admitiria confirmarlos despues.
    const drafts = await this.journal.list(
      { clientId, period, status: 'BORRADOR' },
      { page: 1, pageSize: 1 },
    )
    if (drafts.total > 0) {
      throw new ConflictError(
        `No se puede cerrar ${period}: hay ${drafts.total} asiento(s) en borrador. ` +
          'Confirmelos o eliminelos antes de cerrar.',
      )
    }

    const closed = await this.periods.close(clientId, period, user.id)

    await this.audit.record({
      action: 'period.close',
      entity: 'AccountingPeriod',
      entityId: closed.id,
      userId: user.id,
      metadata: { clientId, period },
    })

    return closed
  }

  /** Reabrir es excepcional y queda registrado con nombre y hora. */
  async reopenPeriod(user: AuthenticatedUser, clientId: string, period: string) {
    Permissions.assert(user, 'client:archive') // permiso mas alto que escribir
    const reopened = await this.periods.reopen(clientId, period)

    await this.audit.record({
      action: 'period.reopen',
      entity: 'AccountingPeriod',
      entityId: reopened.id,
      userId: user.id,
      metadata: { clientId, period },
    })

    return reopened
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private async assertPeriodOpen(clientId: string, period: string): Promise<void> {
    const record = await this.periods.find(clientId, period)
    if (record?.status === 'CERRADO') {
      throw new ConflictError(
        `El periodo ${period} esta cerrado. Reabralo si necesita modificarlo.`,
      )
    }
  }

  private async buildEntryFor(
    document: TaxDocumentRecord,
    user: AuthenticatedUser,
  ): Promise<JournalEntryRecord> {
    const draft = EntryBuilderService.build({
      kind: document.kind as DocumentKind,
      docType: document.docType,
      serie: document.serie,
      number: document.number,
      issueDate: document.issueDate,
      period: document.period,
      counterpartyDocType: document.counterpartyDocType,
      counterpartyDocNumber: document.counterpartyDocNumber,
      counterpartyName: document.counterpartyName,
      taxableBase: document.taxableBase,
      exemptAmount: document.exemptAmount,
      unaffectedAmount: document.unaffectedAmount,
      igv: document.igv,
      total: document.total,
    })

    const chart = await this.accounts.chartFor(document.clientId)
    const names = new Map(chart.map((a) => [a.code, a.name]))

    return this.journal.create({
      clientId: document.clientId,
      date: draft.date,
      period: draft.period,
      glossa: draft.glossa,
      source: 'AUTOMATICO',
      status: 'BORRADOR',
      createdById: user.id,
      lines: draft.lines.map((line, index) => ({
        order: index + 1,
        accountCode: line.accountCode,
        accountName: names.get(line.accountCode) ?? line.accountCode,
        debit: line.debit,
        credit: line.credit,
        glossa: draft.glossa,
        counterpartyDocType: document.counterpartyDocType,
        counterpartyDocNumber: document.counterpartyDocNumber,
        docType: document.docType,
        serie: document.serie,
        docNumber: document.number,
      })),
    })
  }
}
