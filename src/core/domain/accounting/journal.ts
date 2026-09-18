import { ValidationError } from '../errors'
import { Money } from '../value-objects/money'
import { AccountCode } from './account-code'

/**
 * Partida doble.
 *
 * La regla es una sola y no admite excepciones: en todo asiento, la suma del
 * debe es igual a la suma del haber. Validarlo aqui, antes de tocar la base,
 * es lo que impide que un libro mayor quede descuadrado — y un libro
 * descuadrado no se arregla despues, hay que rehacer el periodo.
 */

export interface JournalLineDraft {
  accountCode: string
  debit: Money
  credit: Money
  glossa?: string | null
  /** RUC o documento del tercero, requerido por el PLE en varias cuentas. */
  counterpartyDoc?: string | null
  /** Referencia al comprobante que origina la linea. */
  documentRef?: string | null
}

export interface JournalEntryDraft {
  date: Date
  period: string
  glossa: string
  lines: JournalLineDraft[]
}

export interface EntryTotals {
  debit: Money
  credit: Money
  balanced: boolean
  difference: Money
}

export const JournalService = {
  totals(lines: JournalLineDraft[], currency: Money['currency'] = 'PEN'): EntryTotals {
    const debit = Money.sum(
      lines.map((l) => l.debit),
      currency,
    )
    const credit = Money.sum(
      lines.map((l) => l.credit),
      currency,
    )
    const difference = debit.subtract(credit)
    return { debit, credit, balanced: difference.isZero(), difference }
  },

  /**
   * Valida un asiento completo antes de grabarlo.
   * Lanza al primer problema con un mensaje que dice exactamente que corregir.
   */
  assertValid(draft: JournalEntryDraft): void {
    if (draft.lines.length < 2) {
      throw new ValidationError('Un asiento requiere al menos dos lineas')
    }
    if (!draft.glossa?.trim()) {
      throw new ValidationError('La glosa del asiento es obligatoria')
    }

    for (const [index, line] of draft.lines.entries()) {
      const position = index + 1

      if (!AccountCode.isValid(line.accountCode)) {
        throw new ValidationError(
          `Linea ${position}: codigo de cuenta invalido "${line.accountCode}"`,
        )
      }
      if (line.debit.isNegative() || line.credit.isNegative()) {
        throw new ValidationError(
          `Linea ${position}: los importes no pueden ser negativos. ` +
            'Para revertir un movimiento se invierte debe y haber, no se usa signo.',
        )
      }
      // Una linea carga O abona. Las dos cosas a la vez esconde dos
      // movimientos distintos y rompe la trazabilidad del mayor.
      if (!line.debit.isZero() && !line.credit.isZero()) {
        throw new ValidationError(
          `Linea ${position}: una linea no puede tener importe en el debe y en el haber a la vez`,
        )
      }
      if (line.debit.isZero() && line.credit.isZero()) {
        throw new ValidationError(`Linea ${position}: la linea no tiene importe`)
      }
    }

    const totals = JournalService.totals(draft.lines)
    if (!totals.balanced) {
      throw new ValidationError(
        `El asiento no cuadra: debe ${totals.debit.toString()} contra haber ` +
          `${totals.credit.toString()} (diferencia ${totals.difference.toString()})`,
        {
          debit: totals.debit.toString(),
          credit: totals.credit.toString(),
          difference: totals.difference.toString(),
        },
      )
    }
  },

  /**
   * Invierte un asiento (extorno).
   *
   * No se borra el original: en contabilidad un asiento confirmado no se
   * elimina, se contrapone con otro que lo anula. El rastro tiene que quedar.
   */
  reverse(draft: JournalEntryDraft, glossa?: string): JournalEntryDraft {
    return {
      ...draft,
      glossa: glossa ?? `EXTORNO: ${draft.glossa}`,
      lines: draft.lines.map((line) => ({
        ...line,
        debit: line.credit,
        credit: line.debit,
      })),
    }
  },
}
