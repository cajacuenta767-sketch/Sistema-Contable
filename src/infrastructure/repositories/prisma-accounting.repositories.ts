import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  AccountRecord,
  AccountRepository,
  AccountSums,
  AccountingPeriodRecord,
  AccountingPeriodRepository,
  CreateJournalEntryInput,
  CreateTaxDocumentInput,
  DocumentKind,
  JournalEntryRecord,
  JournalFilters,
  JournalRepository,
  LedgerLine,
  PeriodTotals,
  PleExportRecord,
  PleExportRepository,
  TaxDocumentFilters,
  TaxDocumentRecord,
  TaxDocumentRepository,
  TaxReturnRecord,
  TaxReturnRepository,
} from '@/core/application/ports/accounting'
import type { Page, PageParams } from '@/core/application/ports'
import { Money } from '@/core/domain/value-objects/money'
import { ConflictError, NotFoundError } from '@/core/domain/errors'
import { rateToString, toDecimal, toDecimalOrNull, toMoney, toMoneyOrNull } from './money-mapper'

// ---------------------------------------------------------------------------
// Plan de cuentas
// ---------------------------------------------------------------------------

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * El plan efectivo es el maestro mas las cuentas del cliente, y cuando
   * ambos definen el mismo codigo gana la del cliente. Se resuelve en memoria
   * con un Map porque el plan completo son ~700 filas: traerlo entero una vez
   * es mas barato que un UNION con prioridad en SQL.
   */
  async chartFor(clientId: string): Promise<AccountRecord[]> {
    const rows = await this.db.account.findMany({
      where: { active: true, OR: [{ clientId: null }, { clientId }] },
      orderBy: [{ code: 'asc' }],
    })

    const byCode = new Map<string, AccountRecord>()
    for (const row of rows) {
      const existing = byCode.get(row.code)
      // La propia del cliente pisa a la del maestro.
      if (!existing || row.clientId !== null) byCode.set(row.code, row)
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
  }

  async findByCode(clientId: string, code: string): Promise<AccountRecord | null> {
    const rows = await this.db.account.findMany({
      where: { code, OR: [{ clientId: null }, { clientId }] },
    })
    return rows.find((r) => r.clientId === clientId) ?? rows[0] ?? null
  }

  async create(input: Omit<AccountRecord, 'id'>): Promise<AccountRecord> {
    return this.db.account.create({ data: input })
  }

  async update(id: string, input: Partial<Omit<AccountRecord, 'id'>>): Promise<AccountRecord> {
    return this.db.account.update({ where: { id }, data: input })
  }

  async seedMaster(accounts: Omit<AccountRecord, 'id' | 'clientId'>[]): Promise<number> {
    const result = await this.db.account.createMany({
      data: accounts.map((a) => ({ ...a, clientId: null })),
      skipDuplicates: true,
    })
    return result.count
  }
}

// ---------------------------------------------------------------------------
// Comprobantes
// ---------------------------------------------------------------------------

const DOCUMENT_FIELDS = {
  id: true, kind: true, status: true, docType: true, serie: true, number: true,
  issueDate: true, dueDate: true, period: true,
  counterpartyDocType: true, counterpartyDocNumber: true, counterpartyName: true,
  currency: true, exchangeRate: true,
  taxableBase: true, exemptAmount: true, unaffectedAmount: true,
  igv: true, isc: true, otherCharges: true, total: true,
  detractionRate: true, detractionAmount: true, detractionDate: true, detractionNumber: true,
  refDocType: true, refSerie: true, refNumber: true, refIssueDate: true,
  notes: true, clientId: true, entryId: true, createdAt: true,
} as const

type DocumentRow = Prisma.TaxDocumentGetPayload<{ select: typeof DOCUMENT_FIELDS }>

function toDocumentRecord(row: DocumentRow): TaxDocumentRecord {
  const currency = row.currency
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    docType: row.docType,
    serie: row.serie,
    number: row.number,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    period: row.period,
    counterpartyDocType: row.counterpartyDocType,
    counterpartyDocNumber: row.counterpartyDocNumber,
    counterpartyName: row.counterpartyName,
    currency,
    exchangeRate: rateToString(row.exchangeRate),
    taxableBase: toMoney(row.taxableBase, currency),
    exemptAmount: toMoney(row.exemptAmount, currency),
    unaffectedAmount: toMoney(row.unaffectedAmount, currency),
    igv: toMoney(row.igv, currency),
    isc: toMoney(row.isc, currency),
    otherCharges: toMoney(row.otherCharges, currency),
    total: toMoney(row.total, currency),
    detractionRate: row.detractionRate ? row.detractionRate.toString() : null,
    detractionAmount: toMoneyOrNull(row.detractionAmount, currency),
    detractionDate: row.detractionDate,
    detractionNumber: row.detractionNumber,
    refDocType: row.refDocType,
    refSerie: row.refSerie,
    refNumber: row.refNumber,
    refIssueDate: row.refIssueDate,
    notes: row.notes,
    clientId: row.clientId,
    entryId: row.entryId,
    createdAt: row.createdAt,
  }
}

function toDocumentData(input: CreateTaxDocumentInput) {
  return {
    kind: input.kind,
    docType: input.docType,
    serie: input.serie,
    number: input.number,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    period: input.period,
    counterpartyDocType: input.counterpartyDocType,
    counterpartyDocNumber: input.counterpartyDocNumber,
    counterpartyName: input.counterpartyName,
    currency: input.currency,
    exchangeRate: new Prisma.Decimal(input.exchangeRate),
    taxableBase: toDecimal(input.taxableBase),
    exemptAmount: toDecimal(input.exemptAmount),
    unaffectedAmount: toDecimal(input.unaffectedAmount),
    igv: toDecimal(input.igv),
    isc: toDecimal(input.isc),
    otherCharges: toDecimal(input.otherCharges),
    total: toDecimal(input.total),
    detractionRate: input.detractionRate ? new Prisma.Decimal(input.detractionRate) : null,
    detractionAmount: toDecimalOrNull(input.detractionAmount),
    detractionDate: input.detractionDate,
    detractionNumber: input.detractionNumber,
    refDocType: input.refDocType,
    refSerie: input.refSerie,
    refNumber: input.refNumber,
    refIssueDate: input.refIssueDate,
    notes: input.notes,
    clientId: input.clientId,
    createdById: input.createdById ?? null,
  }
}

export class PrismaTaxDocumentRepository implements TaxDocumentRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(filters: TaxDocumentFilters, page: PageParams): Promise<Page<TaxDocumentRecord>> {
    const where = this.buildWhere(filters)
    const skip = (page.page - 1) * page.pageSize

    const [total, rows] = await this.db.$transaction([
      this.db.taxDocument.count({ where }),
      this.db.taxDocument.findMany({
        where,
        skip,
        take: page.pageSize,
        orderBy: [{ issueDate: 'desc' }, { serie: 'asc' }, { number: 'desc' }],
        select: DOCUMENT_FIELDS,
      }),
    ])

    return {
      items: rows.map(toDocumentRecord),
      total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
    }
  }

  async findById(id: string): Promise<TaxDocumentRecord | null> {
    const row = await this.db.taxDocument.findUnique({ where: { id }, select: DOCUMENT_FIELDS })
    return row ? toDocumentRecord(row) : null
  }

  async create(input: CreateTaxDocumentInput): Promise<TaxDocumentRecord> {
    try {
      const row = await this.db.taxDocument.create({
        data: toDocumentData(input),
        select: DOCUMENT_FIELDS,
      })
      return toDocumentRecord(row)
    } catch (error) {
      // P2002 = violacion de unicidad. Se traduce a un error del dominio con
      // un mensaje que el usuario entienda, en vez de dejar salir el error
      // crudo de Prisma.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(
          `El comprobante ${input.serie}-${input.number} ya esta registrado para este cliente`,
        )
      }
      throw error
    }
  }

  async createManyIgnoringDuplicates(inputs: CreateTaxDocumentInput[]): Promise<number> {
    if (inputs.length === 0) return 0

    // Se trocea: una importacion de SIRE puede traer miles de comprobantes.
    const CHUNK = 500
    let created = 0
    for (let i = 0; i < inputs.length; i += CHUNK) {
      const result = await this.db.taxDocument.createMany({
        data: inputs.slice(i, i + CHUNK).map(toDocumentData),
        skipDuplicates: true,
      })
      created += result.count
    }
    return created
  }

  async listForBook(
    clientId: string,
    period: string,
    kind: DocumentKind,
  ): Promise<TaxDocumentRecord[]> {
    const rows = await this.db.taxDocument.findMany({
      // Los anulados SI van al libro, con importes en cero y estado distinto:
      // omitirlos dejaria un salto en la numeracion que SUNAT observa.
      where: { clientId, period, kind },
      orderBy: [{ issueDate: 'asc' }, { serie: 'asc' }, { number: 'asc' }],
      select: DOCUMENT_FIELDS,
    })
    return rows.map(toDocumentRecord)
  }

  async totalsByPeriod(
    clientId: string,
    period: string,
    kind: DocumentKind,
  ): Promise<PeriodTotals> {
    const result = await this.db.taxDocument.aggregate({
      where: { clientId, period, kind, status: 'REGISTRADO' },
      _sum: {
        taxableBase: true,
        exemptAmount: true,
        unaffectedAmount: true,
        igv: true,
        total: true,
      },
      _count: { _all: true },
    })

    return {
      taxableBase: toMoney(result._sum.taxableBase),
      exemptAmount: toMoney(result._sum.exemptAmount),
      unaffectedAmount: toMoney(result._sum.unaffectedAmount),
      igv: toMoney(result._sum.igv),
      total: toMoney(result._sum.total),
      count: result._count._all,
    }
  }

  async void_(id: string): Promise<TaxDocumentRecord> {
    const row = await this.db.taxDocument.update({
      where: { id },
      data: { status: 'ANULADO' },
      select: DOCUMENT_FIELDS,
    })
    return toDocumentRecord(row)
  }

  async linkEntry(documentId: string, entryId: string): Promise<void> {
    await this.db.taxDocument.update({ where: { id: documentId }, data: { entryId } })
  }

  private buildWhere(filters: TaxDocumentFilters): Prisma.TaxDocumentWhereInput {
    const where: Prisma.TaxDocumentWhereInput = { clientId: filters.clientId }
    if (filters.period) where.period = filters.period
    if (filters.kind) where.kind = filters.kind
    if (filters.status) where.status = filters.status
    if (filters.from || filters.to) {
      where.issueDate = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      }
    }
    const search = filters.search?.trim()
    if (search) {
      where.OR = [
        { counterpartyName: { contains: search, mode: 'insensitive' } },
        { counterpartyDocNumber: { startsWith: search } },
        { serie: { startsWith: search.toUpperCase() } },
        { number: { startsWith: search } },
      ]
    }
    return where
  }
}

// ---------------------------------------------------------------------------
// Asientos contables
// ---------------------------------------------------------------------------

const ENTRY_FIELDS = {
  id: true, number: true, date: true, period: true, glossa: true,
  source: true, status: true, totalDebit: true, totalCredit: true,
  clientId: true, reversesId: true, reversedById: true, createdAt: true,
  lines: {
    orderBy: { order: 'asc' },
    select: {
      id: true, order: true, accountCode: true, accountName: true,
      debit: true, credit: true, glossa: true,
      counterpartyDocType: true, counterpartyDocNumber: true,
      docType: true, serie: true, docNumber: true,
    },
  },
} as const

type EntryRow = Prisma.JournalEntryGetPayload<{ select: typeof ENTRY_FIELDS }>

function toEntryRecord(row: EntryRow): JournalEntryRecord {
  return {
    id: row.id,
    number: row.number,
    date: row.date,
    period: row.period,
    glossa: row.glossa,
    source: row.source,
    status: row.status,
    totalDebit: toMoney(row.totalDebit),
    totalCredit: toMoney(row.totalCredit),
    clientId: row.clientId,
    reversesId: row.reversesId,
    reversedById: row.reversedById,
    createdAt: row.createdAt,
    lines: row.lines.map((line) => ({
      id: line.id,
      order: line.order,
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: toMoney(line.debit),
      credit: toMoney(line.credit),
      glossa: line.glossa,
      counterpartyDocType: line.counterpartyDocType,
      counterpartyDocNumber: line.counterpartyDocNumber,
      docType: line.docType,
      serie: line.serie,
      docNumber: line.docNumber,
    })),
  }
}

export class PrismaJournalRepository implements JournalRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(filters: JournalFilters, page: PageParams): Promise<Page<JournalEntryRecord>> {
    const where: Prisma.JournalEntryWhereInput = { clientId: filters.clientId }
    if (filters.period) where.period = filters.period
    if (filters.source) where.source = filters.source
    if (filters.status) where.status = filters.status
    const search = filters.search?.trim()
    if (search) where.glossa = { contains: search, mode: 'insensitive' }

    const skip = (page.page - 1) * page.pageSize
    const [total, rows] = await this.db.$transaction([
      this.db.journalEntry.count({ where }),
      this.db.journalEntry.findMany({
        where,
        skip,
        take: page.pageSize,
        orderBy: [{ period: 'desc' }, { number: 'desc' }],
        select: ENTRY_FIELDS,
      }),
    ])

    return {
      items: rows.map(toEntryRecord),
      total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
    }
  }

  async findById(id: string): Promise<JournalEntryRecord | null> {
    const row = await this.db.journalEntry.findUnique({ where: { id }, select: ENTRY_FIELDS })
    return row ? toEntryRecord(row) : null
  }

  /**
   * Crea el asiento con sus lineas en UNA transaccion.
   *
   * El correlativo se calcula dentro de la misma transaccion y se reintenta si
   * choca: dos usuarios grabando a la vez pueden pedir el mismo numero, y el
   * unique (clientId, period, number) lo rechaza. Reintentar es mas simple y
   * mas rapido que serializar la transaccion entera.
   */
  async create(input: CreateJournalEntryInput): Promise<JournalEntryRecord> {
    const totalDebit = Money.sum(input.lines.map((l) => l.debit))
    const totalCredit = Money.sum(input.lines.map((l) => l.credit))

    const MAX_ATTEMPTS = 5
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const number = await this.nextNumber(input.clientId, input.period)
      try {
        const row = await this.db.journalEntry.create({
          data: {
            number,
            date: input.date,
            period: input.period,
            glossa: input.glossa,
            source: input.source,
            status: input.status,
            totalDebit: toDecimal(totalDebit),
            totalCredit: toDecimal(totalCredit),
            clientId: input.clientId,
            createdById: input.createdById,
            reversesId: input.reversesId ?? null,
            lines: {
              create: input.lines.map((line, index) => ({
                order: line.order || index + 1,
                accountCode: line.accountCode,
                accountName: line.accountName,
                debit: toDecimal(line.debit),
                credit: toDecimal(line.credit),
                glossa: line.glossa,
                counterpartyDocType: line.counterpartyDocType,
                counterpartyDocNumber: line.counterpartyDocNumber,
                docType: line.docType,
                serie: line.serie,
                docNumber: line.docNumber,
              })),
            },
          },
          select: ENTRY_FIELDS,
        })
        return toEntryRecord(row)
      } catch (error) {
        const isDuplicateNumber =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
        if (!isDuplicateNumber || attempt === MAX_ATTEMPTS) throw error
        // Otro proceso tomo el numero: se vuelve a pedir el siguiente.
      }
    }

    throw new ConflictError('No se pudo asignar un numero de asiento. Intente nuevamente.')
  }

  async nextNumber(clientId: string, period: string): Promise<number> {
    const last = await this.db.journalEntry.findFirst({
      where: { clientId, period },
      orderBy: { number: 'desc' },
      select: { number: true },
    })
    return (last?.number ?? 0) + 1
  }

  async setStatus(id: string, status: JournalEntryRecord['status']): Promise<void> {
    await this.db.journalEntry.update({ where: { id }, data: { status } })
  }

  async linkReversal(originalId: string, reversalId: string): Promise<void> {
    await this.db.journalEntry.update({
      where: { id: originalId },
      data: { reversedById: reversalId, status: 'EXTORNADO' },
    })
  }

  /**
   * Sumas por cuenta. Se agrega en SQL, no en memoria: un ejercicio completo
   * puede tener cientos de miles de lineas y traerlas todas para sumarlas en
   * JavaScript es justamente lo que no hay que hacer.
   */
  async accountSums(
    clientId: string,
    period: string,
    cumulative: boolean,
  ): Promise<AccountSums[]> {
    // Acumulado: desde el primer periodo del mismo ejercicio hasta el indicado.
    const year = period.slice(0, 4)
    const periodFilter = cumulative
      ? Prisma.sql`e.period >= ${`${year}-01`} AND e.period <= ${period}`
      : Prisma.sql`e.period = ${period}`

    const rows = await this.db.$queryRaw<
      { accountCode: string; accountName: string; debit: string; credit: string }[]
    >`
      SELECT
        l."accountCode"           AS "accountCode",
        MIN(l."accountName")      AS "accountName",
        COALESCE(SUM(l.debit), 0)::text  AS debit,
        COALESCE(SUM(l.credit), 0)::text AS credit
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE e."clientId" = ${clientId}
        AND e.status = 'CONFIRMADO'
        AND ${periodFilter}
      GROUP BY l."accountCode"
      ORDER BY l."accountCode" ASC
    `

    // Los totales vuelven como texto (::text) a proposito: convertirlos a
    // `number` en el driver perderia precision en importes grandes.
    return rows.map((row) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: Money.fromString(row.debit),
      credit: Money.fromString(row.credit),
    }))
  }

  async linesForPeriod(clientId: string, period: string): Promise<LedgerLine[]> {
    const rows = await this.db.journalLine.findMany({
      where: { entry: { clientId, period, status: 'CONFIRMADO' } },
      orderBy: [{ entry: { number: 'asc' } }, { order: 'asc' }],
      select: {
        accountCode: true, accountName: true, debit: true, credit: true,
        counterpartyDocType: true, counterpartyDocNumber: true,
        docType: true, serie: true, docNumber: true,
        entry: { select: { date: true, number: true, glossa: true } },
      },
    })

    return rows.map((row) => ({
      date: row.entry.date,
      entryNumber: row.entry.number,
      glossa: row.entry.glossa,
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: toMoney(row.debit),
      credit: toMoney(row.credit),
      counterpartyDocType: row.counterpartyDocType,
      counterpartyDocNumber: row.counterpartyDocNumber,
      docType: row.docType,
      serie: row.serie,
      docNumber: row.docNumber,
    }))
  }
}

// ---------------------------------------------------------------------------
// Cierre de periodo
// ---------------------------------------------------------------------------

export class PrismaAccountingPeriodRepository implements AccountingPeriodRepository {
  constructor(private readonly db: PrismaClient) {}

  async find(clientId: string, period: string): Promise<AccountingPeriodRecord | null> {
    return this.db.accountingPeriod.findUnique({
      where: { clientId_period: { clientId, period } },
      select: { id: true, period: true, status: true, closedAt: true, clientId: true },
    })
  }

  async list(clientId: string, limit: number): Promise<AccountingPeriodRecord[]> {
    return this.db.accountingPeriod.findMany({
      where: { clientId },
      orderBy: { period: 'desc' },
      take: limit,
      select: { id: true, period: true, status: true, closedAt: true, clientId: true },
    })
  }

  async open(clientId: string, period: string): Promise<AccountingPeriodRecord> {
    return this.db.accountingPeriod.upsert({
      where: { clientId_period: { clientId, period } },
      create: { clientId, period, status: 'ABIERTO' },
      update: {},
      select: { id: true, period: true, status: true, closedAt: true, clientId: true },
    })
  }

  async close(clientId: string, period: string, userId: string): Promise<AccountingPeriodRecord> {
    return this.db.accountingPeriod.upsert({
      where: { clientId_period: { clientId, period } },
      create: { clientId, period, status: 'CERRADO', closedAt: new Date(), closedById: userId },
      update: { status: 'CERRADO', closedAt: new Date(), closedById: userId },
      select: { id: true, period: true, status: true, closedAt: true, clientId: true },
    })
  }

  async reopen(clientId: string, period: string): Promise<AccountingPeriodRecord> {
    const existing = await this.find(clientId, period)
    if (!existing) throw new NotFoundError('el periodo contable', period)
    return this.db.accountingPeriod.update({
      where: { clientId_period: { clientId, period } },
      data: { status: 'ABIERTO', closedAt: null, closedById: null },
      select: { id: true, period: true, status: true, closedAt: true, clientId: true },
    })
  }
}

// ---------------------------------------------------------------------------
// Declaraciones y exportaciones PLE
// ---------------------------------------------------------------------------

const RETURN_FIELDS = {
  id: true, period: true, status: true,
  salesBase: true, salesIgv: true, purchasesBase: true, purchasesIgv: true,
  previousCredit: true, igvToPay: true, carryForward: true,
  incomeTaxBase: true, incomeTaxRate: true, incomeTax: true, totalToPay: true,
  presentedAt: true, orderNumber: true, clientId: true,
} as const

type ReturnRow = Prisma.TaxReturnGetPayload<{ select: typeof RETURN_FIELDS }>

function toReturnRecord(row: ReturnRow): TaxReturnRecord {
  return {
    id: row.id,
    period: row.period,
    status: row.status,
    salesBase: toMoney(row.salesBase),
    salesIgv: toMoney(row.salesIgv),
    purchasesBase: toMoney(row.purchasesBase),
    purchasesIgv: toMoney(row.purchasesIgv),
    previousCredit: toMoney(row.previousCredit),
    igvToPay: toMoney(row.igvToPay),
    carryForward: toMoney(row.carryForward),
    incomeTaxBase: toMoney(row.incomeTaxBase),
    incomeTaxRate: rateToString(row.incomeTaxRate),
    incomeTax: toMoney(row.incomeTax),
    totalToPay: toMoney(row.totalToPay),
    presentedAt: row.presentedAt,
    orderNumber: row.orderNumber,
    clientId: row.clientId,
  }
}

export class PrismaTaxReturnRepository implements TaxReturnRepository {
  constructor(private readonly db: PrismaClient) {}

  async find(clientId: string, period: string): Promise<TaxReturnRecord | null> {
    const row = await this.db.taxReturn.findUnique({
      where: { clientId_period: { clientId, period } },
      select: RETURN_FIELDS,
    })
    return row ? toReturnRecord(row) : null
  }

  async list(clientId: string, limit: number): Promise<TaxReturnRecord[]> {
    const rows = await this.db.taxReturn.findMany({
      where: { clientId },
      orderBy: { period: 'desc' },
      take: limit,
      select: RETURN_FIELDS,
    })
    return rows.map(toReturnRecord)
  }

  async upsert(
    input: Omit<TaxReturnRecord, 'id' | 'presentedAt' | 'orderNumber' | 'status'> & {
      createdById: string | null
    },
  ): Promise<TaxReturnRecord> {
    const data = {
      salesBase: toDecimal(input.salesBase),
      salesIgv: toDecimal(input.salesIgv),
      purchasesBase: toDecimal(input.purchasesBase),
      purchasesIgv: toDecimal(input.purchasesIgv),
      previousCredit: toDecimal(input.previousCredit),
      igvToPay: toDecimal(input.igvToPay),
      carryForward: toDecimal(input.carryForward),
      incomeTaxBase: toDecimal(input.incomeTaxBase),
      incomeTaxRate: new Prisma.Decimal(input.incomeTaxRate),
      incomeTax: toDecimal(input.incomeTax),
      totalToPay: toDecimal(input.totalToPay),
    }

    const row = await this.db.taxReturn.upsert({
      where: { clientId_period: { clientId: input.clientId, period: input.period } },
      create: { ...data, clientId: input.clientId, period: input.period, createdById: input.createdById },
      // Recalcular NO revierte una declaracion ya presentada a "calculada":
      // el estado se conserva y solo cambian las cifras de referencia.
      update: data,
      select: RETURN_FIELDS,
    })
    return toReturnRecord(row)
  }

  async markPresented(
    id: string,
    orderNumber: string,
    presentedAt: Date,
  ): Promise<TaxReturnRecord> {
    const row = await this.db.taxReturn.update({
      where: { id },
      data: { status: 'PRESENTADO', orderNumber, presentedAt },
      select: RETURN_FIELDS,
    })
    return toReturnRecord(row)
  }
}

export class PrismaPleExportRepository implements PleExportRepository {
  constructor(private readonly db: PrismaClient) {}

  async record(
    input: Omit<PleExportRecord, 'id' | 'generatedAt'> & { generatedById: string | null },
  ): Promise<PleExportRecord> {
    const row = await this.db.pleExport.create({
      data: {
        period: input.period,
        bookCode: input.bookCode,
        bookName: input.bookName,
        fileName: input.fileName,
        layoutVersion: input.layoutVersion,
        lineCount: input.lineCount,
        totalDebit: toDecimalOrNull(input.totalDebit),
        totalCredit: toDecimalOrNull(input.totalCredit),
        checksum: input.checksum,
        clientId: input.clientId,
        generatedById: input.generatedById,
      },
    })
    return {
      ...row,
      totalDebit: toMoneyOrNull(row.totalDebit),
      totalCredit: toMoneyOrNull(row.totalCredit),
    }
  }

  async list(clientId: string, period?: string): Promise<PleExportRecord[]> {
    const rows = await this.db.pleExport.findMany({
      where: { clientId, ...(period ? { period } : {}) },
      orderBy: { generatedAt: 'desc' },
      take: 100,
    })
    return rows.map((row) => ({
      ...row,
      totalDebit: toMoneyOrNull(row.totalDebit),
      totalCredit: toMoneyOrNull(row.totalCredit),
    }))
  }
}
