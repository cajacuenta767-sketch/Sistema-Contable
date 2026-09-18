import { Money } from '../value-objects/money'
import { JournalService, type JournalEntryDraft, type JournalLineDraft } from '../accounting/journal'

/**
 * Asiento de provision de planilla.
 *
 * Es lo que conecta el modulo de planillas con la contabilidad: sin este
 * asiento, el gasto de personal no aparece en el Estado de Resultados y las
 * retenciones no figuran como deuda en el balance, aunque la planilla este
 * calculada al centimo.
 *
 * Estructura (la dicta la tecnica contable, no la preferencia):
 *
 *   DEBE
 *     62 Gastos de personal ............ total de ingresos brutos
 *     6271 EsSalud ..................... aporte del empleador
 *     6274 SCTR ........................ aporte del empleador
 *   HABER
 *     4031 EsSalud por pagar ........... aporte del empleador
 *     4032 ONP por pagar ............... retenido a los afiliados a ONP
 *     4071 AFP por pagar ............... aporte + comision + prima retenidos
 *     40173 Renta de quinta por pagar .. retenido
 *     469 Otras cuentas por pagar ...... SCTR y descuentos de terceros
 *     4111 Sueldos por pagar ........... neto que se deposita
 *
 * Cuadra por construccion: el debe es (bruto + aportes del empleador) y el
 * haber descompone exactamente esa misma cifra entre lo retenido, lo aportado
 * y lo que se paga. Aun asi se valida antes de devolverlo.
 */

export interface PayrollEntryAccounts {
  salaryExpense: string
  essaludExpense: string
  sctrExpense: string
  essaludPayable: string
  onpPayable: string
  afpPayable: string
  incomeTaxPayable: string
  otherPayable: string
  netPayable: string
}

export const DEFAULT_PAYROLL_ACCOUNTS: PayrollEntryAccounts = {
  salaryExpense: '6211',
  essaludExpense: '6271',
  sctrExpense: '6274',
  essaludPayable: '4031',
  onpPayable: '4032',
  afpPayable: '4071',
  incomeTaxPayable: '40173',
  otherPayable: '469',
  netPayable: '4111',
}

/** Totales de la planilla, separados por sistema previsional. */
export interface PayrollEntryTotals {
  gross: Money
  onpContributions: Money
  afpContributions: Money
  incomeTax: Money
  otherDeductions: Money
  netPay: Money
  employerEssalud: Money
  employerSctr: Money
}

export const PayrollEntryService = {
  build(
    totals: PayrollEntryTotals,
    context: { date: Date; period: string; periodLabel: string },
    accounts: Partial<PayrollEntryAccounts> = {},
  ): JournalEntryDraft {
    const map = { ...DEFAULT_PAYROLL_ACCOUNTS, ...accounts }
    const zero = Money.zero()

    const candidates: JournalLineDraft[] = [
      { accountCode: map.salaryExpense, debit: totals.gross, credit: zero },
      { accountCode: map.essaludExpense, debit: totals.employerEssalud, credit: zero },
      { accountCode: map.sctrExpense, debit: totals.employerSctr, credit: zero },
      { accountCode: map.essaludPayable, debit: zero, credit: totals.employerEssalud },
      { accountCode: map.onpPayable, debit: zero, credit: totals.onpContributions },
      { accountCode: map.afpPayable, debit: zero, credit: totals.afpContributions },
      { accountCode: map.incomeTaxPayable, debit: zero, credit: totals.incomeTax },
      {
        accountCode: map.otherPayable,
        debit: zero,
        credit: totals.employerSctr.add(totals.otherDeductions),
      },
      { accountCode: map.netPayable, debit: zero, credit: totals.netPay },
    ]

    // Las lineas en cero se omiten: una empresa sin trabajadores en AFP no debe
    // tener una linea de AFP en cero, y el PLE la rechazaria.
    const lines = candidates.filter((line) => !line.debit.isZero() || !line.credit.isZero())

    const draft: JournalEntryDraft = {
      date: context.date,
      period: context.period,
      glossa: `Provision de planilla ${context.periodLabel}`.slice(0, 200),
      lines,
    }

    JournalService.assertValid(draft)
    return draft
  },
}
