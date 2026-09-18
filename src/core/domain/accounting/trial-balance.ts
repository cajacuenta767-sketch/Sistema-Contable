import { Money } from '../value-objects/money'
import { AccountCode } from './account-code'

/**
 * Balance de comprobacion.
 *
 * Es el punto de control del periodo: si las sumas del debe y del haber no
 * coinciden, hay un asiento mal grabado y no tiene sentido emitir ningun
 * estado financiero encima. Por eso el resultado incluye `balanced` y los
 * casos de uso se niegan a generar EEFF si es false.
 *
 * Estructura clasica de cuatro pares de columnas:
 *   Sumas      (debe / haber acumulados)
 *   Saldos     (deudor / acreedor, por diferencia)
 *   Balance    (solo cuentas de balance: elementos 1 a 5)
 *   Resultados (solo cuentas de resultado: elementos 6 y 7)
 */

export interface AccountMovement {
  accountCode: string
  accountName: string
  debit: Money
  credit: Money
}

export interface TrialBalanceRow {
  accountCode: string
  accountName: string
  /** Sumas */
  debit: Money
  credit: Money
  /** Saldos */
  debitBalance: Money
  creditBalance: Money
  /** Inventario y balances (elementos 1-5) */
  assetBalance: Money
  liabilityBalance: Money
  /** Resultados por naturaleza (elementos 6-7) */
  lossBalance: Money
  gainBalance: Money
}

export interface TrialBalance {
  rows: TrialBalanceRow[]
  totals: {
    debit: Money
    credit: Money
    debitBalance: Money
    creditBalance: Money
    assetBalance: Money
    liabilityBalance: Money
    lossBalance: Money
    gainBalance: Money
  }
  balanced: boolean
  /** Resultado del ejercicio: ganancias menos perdidas. */
  netIncome: Money
}

export const TrialBalanceService = {
  /**
   * @param movements Sumas acumuladas por cuenta al cierre del periodo.
   * @param level Nivel de agregacion (2 = cuenta, 3 = subcuenta, 4 = divisionaria).
   *   El balance de comprobacion se presenta habitualmente a nivel de
   *   divisionaria, pero para revisar rapido conviene agrupar a dos digitos.
   */
  build(movements: AccountMovement[], level = 4): TrialBalance {
    const grouped = new Map<string, AccountMovement>()

    for (const movement of movements) {
      const code = movement.accountCode.slice(0, level)
      const existing = grouped.get(code)
      if (existing) {
        existing.debit = existing.debit.add(movement.debit)
        existing.credit = existing.credit.add(movement.credit)
      } else {
        grouped.set(code, {
          accountCode: code,
          accountName: movement.accountName,
          debit: movement.debit,
          credit: movement.credit,
        })
      }
    }

    const zero = Money.zero()
    const rows: TrialBalanceRow[] = [...grouped.values()]
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
      .map((movement) => {
        const account = AccountCode.create(movement.accountCode)
        const difference = movement.debit.subtract(movement.credit)

        // El saldo va a la columna que corresponde a su signo, no a la que
        // corresponde a la naturaleza teorica de la cuenta: una cuenta de
        // activo con saldo acreedor existe (un banco en sobregiro) y tiene que
        // verse asi, no corregirse en silencio.
        const debitBalance = difference.isPositive() ? difference : zero
        const creditBalance = difference.isNegative() ? difference.negate() : zero

        const isBalance = account.isBalanceAccount
        const isResult = account.isResultAccount

        return {
          accountCode: movement.accountCode,
          accountName: movement.accountName,
          debit: movement.debit,
          credit: movement.credit,
          debitBalance,
          creditBalance,
          assetBalance: isBalance ? debitBalance : zero,
          liabilityBalance: isBalance ? creditBalance : zero,
          lossBalance: isResult ? debitBalance : zero,
          gainBalance: isResult ? creditBalance : zero,
        }
      })

    const totals = {
      debit: Money.sum(rows.map((r) => r.debit)),
      credit: Money.sum(rows.map((r) => r.credit)),
      debitBalance: Money.sum(rows.map((r) => r.debitBalance)),
      creditBalance: Money.sum(rows.map((r) => r.creditBalance)),
      assetBalance: Money.sum(rows.map((r) => r.assetBalance)),
      liabilityBalance: Money.sum(rows.map((r) => r.liabilityBalance)),
      lossBalance: Money.sum(rows.map((r) => r.lossBalance)),
      gainBalance: Money.sum(rows.map((r) => r.gainBalance)),
    }

    return {
      rows,
      totals,
      balanced: totals.debit.equals(totals.credit),
      netIncome: totals.gainBalance.subtract(totals.lossBalance),
    }
  },
}
