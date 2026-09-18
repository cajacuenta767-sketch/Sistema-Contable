import { Money } from '../value-objects/money'
import type { TrialBalance } from './trial-balance'

/**
 * Estados financieros a partir del balance de comprobacion.
 *
 * LIMITACION QUE HAY QUE TENER PRESENTE: la separacion entre corriente y no
 * corriente se hace por el codigo de cuenta del PCGE, que es una aproximacion
 * buena pero no exacta. Lo corriente se define por el plazo de realizacion o
 * exigibilidad (doce meses), y eso depende del vencimiento de cada partida, no
 * de su cuenta: una cuenta por cobrar a dos anios vive en la misma cuenta 12
 * que una a treinta dias.
 *
 * El mapa de abajo cubre el caso general y sirve para cerrar un mes. Para los
 * EEFF anuales que se presentan, el contador debe revisar la clasificacion y
 * reclasificar lo que corresponda. El sistema lo indica explicitamente en el
 * reporte en vez de aparentar una precision que no tiene.
 */

export type StatementLineKey =
  | 'EFECTIVO'
  | 'CUENTAS_POR_COBRAR_COMERCIALES'
  | 'OTRAS_CUENTAS_POR_COBRAR'
  | 'EXISTENCIAS'
  | 'GASTOS_PAGADOS_POR_ANTICIPADO'
  | 'INMUEBLES_MAQUINARIA_EQUIPO'
  | 'DEPRECIACION_ACUMULADA'
  | 'INTANGIBLES'
  | 'OTROS_ACTIVOS_NO_CORRIENTES'
  | 'TRIBUTOS_POR_PAGAR'
  | 'REMUNERACIONES_POR_PAGAR'
  | 'CUENTAS_POR_PAGAR_COMERCIALES'
  | 'OBLIGACIONES_FINANCIERAS'
  | 'OTRAS_CUENTAS_POR_PAGAR'
  | 'PASIVO_DIFERIDO'
  | 'CAPITAL'
  | 'RESERVAS'
  | 'RESULTADOS_ACUMULADOS'

/**
 * Mapa cuenta (2 digitos) -> linea del estado de situacion financiera.
 * `contra: true` marca cuentas de valuacion (saldo acreedor que resta del
 * activo), como la depreciacion acumulada.
 */
const ESF_MAP: Record<string, { key: StatementLineKey; group: EsfGroup; contra?: boolean }> = {
  '10': { key: 'EFECTIVO', group: 'ACTIVO_CORRIENTE' },
  '11': { key: 'OTRAS_CUENTAS_POR_COBRAR', group: 'ACTIVO_CORRIENTE' },
  '12': { key: 'CUENTAS_POR_COBRAR_COMERCIALES', group: 'ACTIVO_CORRIENTE' },
  '13': { key: 'CUENTAS_POR_COBRAR_COMERCIALES', group: 'ACTIVO_CORRIENTE' },
  '14': { key: 'OTRAS_CUENTAS_POR_COBRAR', group: 'ACTIVO_CORRIENTE' },
  '16': { key: 'OTRAS_CUENTAS_POR_COBRAR', group: 'ACTIVO_CORRIENTE' },
  '17': { key: 'OTRAS_CUENTAS_POR_COBRAR', group: 'ACTIVO_CORRIENTE' },
  '18': { key: 'GASTOS_PAGADOS_POR_ANTICIPADO', group: 'ACTIVO_CORRIENTE' },
  '19': { key: 'CUENTAS_POR_COBRAR_COMERCIALES', group: 'ACTIVO_CORRIENTE', contra: true },
  '20': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '21': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '22': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '23': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '24': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '25': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '26': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '28': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE' },
  '29': { key: 'EXISTENCIAS', group: 'ACTIVO_CORRIENTE', contra: true },
  '30': { key: 'OTROS_ACTIVOS_NO_CORRIENTES', group: 'ACTIVO_NO_CORRIENTE' },
  '31': { key: 'OTROS_ACTIVOS_NO_CORRIENTES', group: 'ACTIVO_NO_CORRIENTE' },
  '32': { key: 'INMUEBLES_MAQUINARIA_EQUIPO', group: 'ACTIVO_NO_CORRIENTE' },
  '33': { key: 'INMUEBLES_MAQUINARIA_EQUIPO', group: 'ACTIVO_NO_CORRIENTE' },
  '34': { key: 'INTANGIBLES', group: 'ACTIVO_NO_CORRIENTE' },
  '35': { key: 'INTANGIBLES', group: 'ACTIVO_NO_CORRIENTE' },
  '37': { key: 'OTROS_ACTIVOS_NO_CORRIENTES', group: 'ACTIVO_NO_CORRIENTE' },
  '38': { key: 'OTROS_ACTIVOS_NO_CORRIENTES', group: 'ACTIVO_NO_CORRIENTE' },
  '39': { key: 'DEPRECIACION_ACUMULADA', group: 'ACTIVO_NO_CORRIENTE', contra: true },
  '40': { key: 'TRIBUTOS_POR_PAGAR', group: 'PASIVO_CORRIENTE' },
  '41': { key: 'REMUNERACIONES_POR_PAGAR', group: 'PASIVO_CORRIENTE' },
  '42': { key: 'CUENTAS_POR_PAGAR_COMERCIALES', group: 'PASIVO_CORRIENTE' },
  '43': { key: 'CUENTAS_POR_PAGAR_COMERCIALES', group: 'PASIVO_CORRIENTE' },
  '44': { key: 'OTRAS_CUENTAS_POR_PAGAR', group: 'PASIVO_CORRIENTE' },
  '45': { key: 'OBLIGACIONES_FINANCIERAS', group: 'PASIVO_NO_CORRIENTE' },
  '46': { key: 'OTRAS_CUENTAS_POR_PAGAR', group: 'PASIVO_CORRIENTE' },
  '47': { key: 'OTRAS_CUENTAS_POR_PAGAR', group: 'PASIVO_CORRIENTE' },
  '48': { key: 'OTRAS_CUENTAS_POR_PAGAR', group: 'PASIVO_CORRIENTE' },
  '49': { key: 'PASIVO_DIFERIDO', group: 'PASIVO_NO_CORRIENTE' },
  '50': { key: 'CAPITAL', group: 'PATRIMONIO' },
  '51': { key: 'CAPITAL', group: 'PATRIMONIO' },
  '52': { key: 'CAPITAL', group: 'PATRIMONIO' },
  '56': { key: 'CAPITAL', group: 'PATRIMONIO' },
  '57': { key: 'RESERVAS', group: 'PATRIMONIO' },
  '58': { key: 'RESERVAS', group: 'PATRIMONIO' },
  '59': { key: 'RESULTADOS_ACUMULADOS', group: 'PATRIMONIO' },
}

export type EsfGroup =
  | 'ACTIVO_CORRIENTE'
  | 'ACTIVO_NO_CORRIENTE'
  | 'PASIVO_CORRIENTE'
  | 'PASIVO_NO_CORRIENTE'
  | 'PATRIMONIO'

const LINE_LABELS: Record<StatementLineKey, string> = {
  EFECTIVO: 'Efectivo y equivalentes de efectivo',
  CUENTAS_POR_COBRAR_COMERCIALES: 'Cuentas por cobrar comerciales',
  OTRAS_CUENTAS_POR_COBRAR: 'Otras cuentas por cobrar',
  EXISTENCIAS: 'Existencias',
  GASTOS_PAGADOS_POR_ANTICIPADO: 'Gastos pagados por anticipado',
  INMUEBLES_MAQUINARIA_EQUIPO: 'Inmuebles, maquinaria y equipo',
  DEPRECIACION_ACUMULADA: 'Depreciacion y amortizacion acumulada',
  INTANGIBLES: 'Activos intangibles',
  OTROS_ACTIVOS_NO_CORRIENTES: 'Otros activos no corrientes',
  TRIBUTOS_POR_PAGAR: 'Tributos y aportes por pagar',
  REMUNERACIONES_POR_PAGAR: 'Remuneraciones y participaciones por pagar',
  CUENTAS_POR_PAGAR_COMERCIALES: 'Cuentas por pagar comerciales',
  OBLIGACIONES_FINANCIERAS: 'Obligaciones financieras',
  OTRAS_CUENTAS_POR_PAGAR: 'Otras cuentas por pagar',
  PASIVO_DIFERIDO: 'Pasivo diferido',
  CAPITAL: 'Capital',
  RESERVAS: 'Reservas',
  RESULTADOS_ACUMULADOS: 'Resultados acumulados',
}

export interface StatementLine {
  key: string
  label: string
  amount: Money
}

export interface BalanceSheet {
  groups: { group: EsfGroup; label: string; lines: StatementLine[]; total: Money }[]
  totalAssets: Money
  totalLiabilities: Money
  totalEquity: Money
  /** Resultado del ejercicio, que aun no paso a resultados acumulados. */
  netIncome: Money
  /** Activo = Pasivo + Patrimonio + Resultado. Si no cuadra, algo falta. */
  balanced: boolean
  difference: Money
  warnings: string[]
}

/** Estado de resultados por naturaleza (elementos 6 y 7 del PCGE). */
export interface IncomeStatement {
  revenue: StatementLine[]
  totalRevenue: Money
  expenses: StatementLine[]
  totalExpenses: Money
  netIncome: Money
}

const GROUP_LABELS: Record<EsfGroup, string> = {
  ACTIVO_CORRIENTE: 'Activo corriente',
  ACTIVO_NO_CORRIENTE: 'Activo no corriente',
  PASIVO_CORRIENTE: 'Pasivo corriente',
  PASIVO_NO_CORRIENTE: 'Pasivo no corriente',
  PATRIMONIO: 'Patrimonio neto',
}

const GROUP_ORDER: EsfGroup[] = [
  'ACTIVO_CORRIENTE',
  'ACTIVO_NO_CORRIENTE',
  'PASIVO_CORRIENTE',
  'PASIVO_NO_CORRIENTE',
  'PATRIMONIO',
]

export const FinancialStatementsService = {
  balanceSheet(trialBalance: TrialBalance): BalanceSheet {
    const zero = Money.zero()
    const warnings: string[] = []
    const accumulator = new Map<string, { group: EsfGroup; key: StatementLineKey; amount: Money }>()

    for (const row of trialBalance.rows) {
      const account = row.accountCode.slice(0, 2)
      // Elementos 6, 7, 8, 9 y 0 no van al estado de situacion financiera.
      if (!['1', '2', '3', '4', '5'].includes(account[0] ?? '')) continue

      const mapping = ESF_MAP[account]
      if (!mapping) {
        warnings.push(
          `La cuenta ${row.accountCode} (${row.accountName}) no esta clasificada en el estado ` +
            'de situacion financiera y quedo fuera del reporte. Revise el plan de cuentas.',
        )
        continue
      }

      // Signo segun la naturaleza del grupo: el activo suma por su saldo
      // deudor; el pasivo y el patrimonio por su saldo acreedor. Una cuenta
      // de valuacion (contra) invierte ese criterio.
      const isAssetSide = mapping.group.startsWith('ACTIVO')
      const natural = isAssetSide
        ? row.debitBalance.subtract(row.creditBalance)
        : row.creditBalance.subtract(row.debitBalance)
      const amount = mapping.contra ? natural : natural

      const mapKey = `${mapping.group}:${mapping.key}`
      const existing = accumulator.get(mapKey)
      accumulator.set(mapKey, {
        group: mapping.group,
        key: mapping.key,
        amount: existing ? existing.amount.add(amount) : amount,
      })
    }

    const groups = GROUP_ORDER.map((group) => {
      const lines = [...accumulator.values()]
        .filter((entry) => entry.group === group && !entry.amount.isZero())
        .map((entry) => ({
          key: entry.key,
          label: LINE_LABELS[entry.key],
          amount: entry.amount,
        }))
        .sort((a, b) => a.label.localeCompare(b.label))

      return {
        group,
        label: GROUP_LABELS[group],
        lines,
        total: Money.sum(lines.map((l) => l.amount)),
      }
    }).filter((g) => g.lines.length > 0)

    const totalOf = (target: EsfGroup) =>
      groups.find((g) => g.group === target)?.total ?? zero

    const totalAssets = totalOf('ACTIVO_CORRIENTE').add(totalOf('ACTIVO_NO_CORRIENTE'))
    const totalLiabilities = totalOf('PASIVO_CORRIENTE').add(totalOf('PASIVO_NO_CORRIENTE'))
    const totalEquity = totalOf('PATRIMONIO')

    const difference = totalAssets
      .subtract(totalLiabilities)
      .subtract(totalEquity)
      .subtract(trialBalance.netIncome)

    if (!difference.isZero()) {
      warnings.push(
        `El estado de situacion financiera no cuadra por ${difference.toString()}. ` +
          'Revise el balance de comprobacion antes de presentarlo.',
      )
    }

    warnings.push(
      'La separacion entre corriente y no corriente se deriva del codigo de cuenta. ' +
        'Para los estados financieros anuales, revise y reclasifique las partidas segun ' +
        'su plazo real de realizacion o exigibilidad.',
    )

    return {
      groups,
      totalAssets,
      totalLiabilities,
      totalEquity,
      netIncome: trialBalance.netIncome,
      balanced: difference.isZero(),
      difference,
      warnings,
    }
  },

  incomeStatement(trialBalance: TrialBalance): IncomeStatement {
    const revenue: StatementLine[] = []
    const expenses: StatementLine[] = []

    for (const row of trialBalance.rows) {
      const element = row.accountCode[0]
      if (element === '7') {
        const amount = row.creditBalance.subtract(row.debitBalance)
        if (!amount.isZero()) {
          revenue.push({ key: row.accountCode, label: row.accountName, amount })
        }
      } else if (element === '6') {
        const amount = row.debitBalance.subtract(row.creditBalance)
        if (!amount.isZero()) {
          expenses.push({ key: row.accountCode, label: row.accountName, amount })
        }
      }
    }

    const totalRevenue = Money.sum(revenue.map((l) => l.amount))
    const totalExpenses = Money.sum(expenses.map((l) => l.amount))

    return {
      revenue: revenue.sort((a, b) => a.key.localeCompare(b.key)),
      totalRevenue,
      expenses: expenses.sort((a, b) => a.key.localeCompare(b.key)),
      totalExpenses,
      netIncome: totalRevenue.subtract(totalExpenses),
    }
  },
}
