import { Money } from '../value-objects/money'
import { JournalService, type JournalEntryDraft, type JournalLineDraft } from './journal'

/**
 * Asiento automatico a partir de un comprobante.
 *
 * Los codigos de cuenta NO estan incrustados: llegan como configuracion, con
 * valores por defecto del PCGE. Cada estudio tiene sus preferencias (que
 * divisionaria usa para ventas, si separa mercaderias de servicios) y un
 * codigo fijo obligaria a editar el sistema para cada cliente.
 *
 * Lo que si es fijo es la ESTRUCTURA del asiento, porque la dicta la tecnica
 * contable y no la preferencia de nadie:
 *
 *   Venta:   cuenta por cobrar (total)  =  IGV (tributo) + ingreso (base)
 *   Compra:  gasto/compra (base) + IGV (credito fiscal)  =  cuenta por pagar (total)
 *
 * Las notas de credito invierten el asiento del comprobante que modifican.
 */

export interface EntryAccountMap {
  /** Cuentas por cobrar comerciales. Por defecto 1212. */
  receivable: string
  /** Cuentas por pagar comerciales. Por defecto 4212. */
  payable: string
  /** IGV por pagar (ventas). Por defecto 40111. */
  outputVat: string
  /** IGV credito fiscal (compras). Por defecto 40111 tambien. */
  inputVat: string
  /** Ingreso por ventas. Por defecto 7011. */
  revenue: string
  /** Compras / gastos. Por defecto 6011. */
  expense: string
}

export const DEFAULT_ACCOUNTS: EntryAccountMap = {
  receivable: '1212',
  payable: '4212',
  outputVat: '40111',
  inputVat: '40111',
  revenue: '7011',
  expense: '6011',
}

export interface DocumentForEntry {
  kind: 'VENTA' | 'COMPRA'
  docType: string
  serie: string
  number: string
  issueDate: Date
  period: string
  counterpartyDocType: string
  counterpartyDocNumber: string
  counterpartyName: string
  taxableBase: Money
  exemptAmount: Money
  unaffectedAmount: Money
  igv: Money
  total: Money
}

/** Catalogo 10 de SUNAT: los tipos que restan en vez de sumar. */
const CREDIT_NOTE = '07'

export const EntryBuilderService = {
  build(
    document: DocumentForEntry,
    accounts: Partial<EntryAccountMap> = {},
    accountNames: Record<string, string> = {},
  ): JournalEntryDraft {
    const map = { ...DEFAULT_ACCOUNTS, ...accounts }
    const isCreditNote = document.docType === CREDIT_NOTE

    const base = document.taxableBase
      .add(document.exemptAmount)
      .add(document.unaffectedAmount)

    const reference = `${document.serie}-${document.number}`
    const common = {
      counterpartyDoc: document.counterpartyDocNumber,
      documentRef: reference,
    }

    const lines: JournalLineDraft[] =
      document.kind === 'VENTA'
        ? [
            line(map.receivable, document.total, Money.zero(), common),
            line(map.outputVat, Money.zero(), document.igv, common),
            line(map.revenue, Money.zero(), base, common),
          ]
        : [
            line(map.expense, base, Money.zero(), common),
            line(map.inputVat, document.igv, Money.zero(), common),
            line(map.payable, Money.zero(), document.total, common),
          ]

    // Una nota de credito reduce lo que el comprobante original aumento:
    // el asiento es el mismo, con debe y haber invertidos.
    const finalLines = isCreditNote
      ? lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))
      : lines

    // Las lineas sin importe (IGV cero en una operacion exonerada) se quitan:
    // una linea en cero no aporta informacion y el PLE la rechaza.
    const nonEmpty = finalLines.filter((l) => !l.debit.isZero() || !l.credit.isZero())

    const draft: JournalEntryDraft = {
      date: document.issueDate,
      period: document.period,
      glossa: buildGlossa(document, reference, isCreditNote),
      lines: nonEmpty.map((l) => ({
        ...l,
        glossa: accountNames[l.accountCode] ?? undefined,
      })),
    }

    // Se valida antes de devolverlo: un asiento automatico descuadrado es peor
    // que uno manual, porque nadie lo revisa.
    JournalService.assertValid(draft)
    return draft
  },
}

function line(
  accountCode: string,
  debit: Money,
  credit: Money,
  common: { counterpartyDoc: string; documentRef: string },
): JournalLineDraft {
  return { accountCode, debit, credit, ...common }
}

function buildGlossa(
  document: DocumentForEntry,
  reference: string,
  isCreditNote: boolean,
): string {
  const verb = isCreditNote
    ? document.kind === 'VENTA'
      ? 'Nota de credito emitida'
      : 'Nota de credito recibida'
    : document.kind === 'VENTA'
      ? 'Venta'
      : 'Compra'

  return `${verb} ${reference} - ${document.counterpartyName}`.slice(0, 200)
}
