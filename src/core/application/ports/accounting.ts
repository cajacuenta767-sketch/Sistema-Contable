import type { Money } from '@/core/domain/value-objects/money'
import type { AccountNature } from '@/core/domain/accounting/account-code'
import type { Page, PageParams } from './index'

/** Puertos del motor contable. Ver la nota de diseno en ports/index.ts. */

// ---------------------------------------------------------------------------
// Plan de cuentas
// ---------------------------------------------------------------------------

export interface AccountRecord {
  id: string
  code: string
  name: string
  level: number
  element: string
  parent: string | null
  nature: AccountNature
  isPosting: boolean
  active: boolean
  clientId: string | null
}

export interface AccountRepository {
  /**
   * Plan de cuentas efectivo del cliente: el catalogo maestro (PCGE) mas sus
   * cuentas propias, con las propias pisando al maestro si comparten codigo.
   */
  chartFor(clientId: string): Promise<AccountRecord[]>
  findByCode(clientId: string, code: string): Promise<AccountRecord | null>
  create(input: Omit<AccountRecord, 'id'>): Promise<AccountRecord>
  update(id: string, input: Partial<Omit<AccountRecord, 'id'>>): Promise<AccountRecord>
  /** Carga del catalogo maestro. Ignora los codigos que ya existen. */
  seedMaster(accounts: Omit<AccountRecord, 'id' | 'clientId'>[]): Promise<number>
}

// ---------------------------------------------------------------------------
// Comprobantes
// ---------------------------------------------------------------------------

export type DocumentKind = 'VENTA' | 'COMPRA'
export type DocumentStatus = 'REGISTRADO' | 'ANULADO'
export type CurrencyCode = 'PEN' | 'USD'

export interface TaxDocumentRecord {
  id: string
  kind: DocumentKind
  status: DocumentStatus
  docType: string
  serie: string
  number: string
  issueDate: Date
  dueDate: Date | null
  period: string
  counterpartyDocType: string
  counterpartyDocNumber: string
  counterpartyName: string
  currency: CurrencyCode
  exchangeRate: string
  taxableBase: Money
  exemptAmount: Money
  unaffectedAmount: Money
  igv: Money
  isc: Money
  otherCharges: Money
  total: Money
  detractionRate: string | null
  detractionAmount: Money | null
  detractionDate: Date | null
  detractionNumber: string | null
  refDocType: string | null
  refSerie: string | null
  refNumber: string | null
  refIssueDate: Date | null
  notes: string | null
  clientId: string
  entryId: string | null
  createdAt: Date
}

export type CreateTaxDocumentInput = Omit<
  TaxDocumentRecord,
  'id' | 'createdAt' | 'entryId' | 'status'
> & { createdById?: string | null }

export interface TaxDocumentFilters {
  clientId: string
  period?: string
  kind?: DocumentKind
  status?: DocumentStatus
  search?: string
  from?: Date
  to?: Date
}

export interface PeriodTotals {
  taxableBase: Money
  exemptAmount: Money
  unaffectedAmount: Money
  igv: Money
  total: Money
  count: number
}

export interface TaxDocumentRepository {
  list(filters: TaxDocumentFilters, page: PageParams): Promise<Page<TaxDocumentRecord>>
  findById(id: string): Promise<TaxDocumentRecord | null>
  create(input: CreateTaxDocumentInput): Promise<TaxDocumentRecord>
  /** Importacion masiva. Ignora duplicados por la clave natural. */
  createManyIgnoringDuplicates(inputs: CreateTaxDocumentInput[]): Promise<number>
  /** Todos los del periodo, ordenados, para armar el libro. Sin paginar. */
  listForBook(clientId: string, period: string, kind: DocumentKind): Promise<TaxDocumentRecord[]>
  totalsByPeriod(clientId: string, period: string, kind: DocumentKind): Promise<PeriodTotals>
  void_(id: string): Promise<TaxDocumentRecord>
  linkEntry(documentId: string, entryId: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Asientos
// ---------------------------------------------------------------------------

export type EntrySource = 'AUTOMATICO' | 'MANUAL' | 'AJUSTE' | 'APERTURA' | 'CIERRE'
export type EntryStatus = 'BORRADOR' | 'CONFIRMADO' | 'EXTORNADO'

export interface JournalLineRecord {
  id: string
  order: number
  accountCode: string
  accountName: string
  debit: Money
  credit: Money
  glossa: string | null
  counterpartyDocType: string | null
  counterpartyDocNumber: string | null
  docType: string | null
  serie: string | null
  docNumber: string | null
}

export interface JournalEntryRecord {
  id: string
  number: number
  date: Date
  period: string
  glossa: string
  source: EntrySource
  status: EntryStatus
  totalDebit: Money
  totalCredit: Money
  clientId: string
  reversesId: string | null
  reversedById: string | null
  createdAt: Date
  lines: JournalLineRecord[]
}

export interface CreateJournalEntryInput {
  clientId: string
  date: Date
  period: string
  glossa: string
  source: EntrySource
  status: EntryStatus
  createdById: string | null
  reversesId?: string | null
  lines: Omit<JournalLineRecord, 'id'>[]
}

export interface JournalFilters {
  clientId: string
  period?: string
  source?: EntrySource
  status?: EntryStatus
  search?: string
}

/** Sumas acumuladas por cuenta, para el balance de comprobacion. */
export interface AccountSums {
  accountCode: string
  accountName: string
  debit: Money
  credit: Money
}

export interface LedgerLine {
  date: Date
  entryNumber: number
  glossa: string
  accountCode: string
  accountName: string
  debit: Money
  credit: Money
  counterpartyDocType: string | null
  counterpartyDocNumber: string | null
  docType: string | null
  serie: string | null
  docNumber: string | null
}

export interface JournalRepository {
  list(filters: JournalFilters, page: PageParams): Promise<Page<JournalEntryRecord>>
  findById(id: string): Promise<JournalEntryRecord | null>
  create(input: CreateJournalEntryInput): Promise<JournalEntryRecord>
  /** Siguiente correlativo del periodo. Debe ser atomico. */
  nextNumber(clientId: string, period: string): Promise<number>
  setStatus(id: string, status: EntryStatus): Promise<void>
  linkReversal(originalId: string, reversalId: string): Promise<void>
  /**
   * Sumas por cuenta hasta el periodo indicado (inclusive).
   * `cumulative` incluye los periodos anteriores del mismo ejercicio, que es
   * lo que necesita el balance de comprobacion acumulado.
   */
  accountSums(clientId: string, period: string, cumulative: boolean): Promise<AccountSums[]>
  /** Lineas del periodo, para el Diario y el Mayor. */
  linesForPeriod(clientId: string, period: string): Promise<LedgerLine[]>
}

// ---------------------------------------------------------------------------
// Cierre de periodo
// ---------------------------------------------------------------------------

export interface AccountingPeriodRecord {
  id: string
  period: string
  status: 'ABIERTO' | 'CERRADO'
  closedAt: Date | null
  clientId: string
}

export interface AccountingPeriodRepository {
  find(clientId: string, period: string): Promise<AccountingPeriodRecord | null>
  list(clientId: string, limit: number): Promise<AccountingPeriodRecord[]>
  open(clientId: string, period: string): Promise<AccountingPeriodRecord>
  close(clientId: string, period: string, userId: string): Promise<AccountingPeriodRecord>
  reopen(clientId: string, period: string): Promise<AccountingPeriodRecord>
}

// ---------------------------------------------------------------------------
// Declaraciones
// ---------------------------------------------------------------------------

export interface TaxReturnRecord {
  id: string
  period: string
  status: 'CALCULADO' | 'PRESENTADO'
  salesBase: Money
  salesIgv: Money
  purchasesBase: Money
  purchasesIgv: Money
  previousCredit: Money
  igvToPay: Money
  carryForward: Money
  incomeTaxBase: Money
  incomeTaxRate: string
  incomeTax: Money
  totalToPay: Money
  presentedAt: Date | null
  orderNumber: string | null
  clientId: string
}

export interface TaxReturnRepository {
  find(clientId: string, period: string): Promise<TaxReturnRecord | null>
  list(clientId: string, limit: number): Promise<TaxReturnRecord[]>
  upsert(input: Omit<TaxReturnRecord, 'id' | 'presentedAt' | 'orderNumber' | 'status'> & {
    createdById: string | null
  }): Promise<TaxReturnRecord>
  markPresented(id: string, orderNumber: string, presentedAt: Date): Promise<TaxReturnRecord>
}

// ---------------------------------------------------------------------------
// Exportaciones PLE
// ---------------------------------------------------------------------------

export interface PleExportRecord {
  id: string
  period: string
  bookCode: string
  bookName: string
  fileName: string
  layoutVersion: string
  lineCount: number
  totalDebit: Money | null
  totalCredit: Money | null
  checksum: string | null
  generatedAt: Date
  clientId: string
}

export interface PleExportRepository {
  record(input: Omit<PleExportRecord, 'id' | 'generatedAt'> & {
    generatedById: string | null
  }): Promise<PleExportRecord>
  list(clientId: string, period?: string): Promise<PleExportRecord[]>
}
