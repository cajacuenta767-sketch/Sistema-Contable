import 'server-only'
import { getContainer } from '@/infrastructure/container'
import type { AuthenticatedUser } from '@/core/domain/types'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'

/**
 * Contexto comun de las pantallas contables: la lista de empresas del alcance
 * del usuario, los periodos seleccionables y el par (cliente, periodo) activo.
 *
 * Esta aqui y no repetido en cada pagina porque las cinco pantallas del modulo
 * necesitan exactamente lo mismo, y duplicarlo garantizaria que en alguna se
 * olvide el filtro por alcance.
 */
export interface AccountingContext {
  clients: { id: string; businessName: string; ruc: string }[]
  periods: string[]
  clientId: string | null
  period: string
  clientName: string | null
  periodStatus: 'ABIERTO' | 'CERRADO' | null
}

/** Ultimos 18 periodos, del mas reciente al mas antiguo. */
export function recentPeriods(now: Date, count = 18): string[] {
  const periods: string[] = []
  let period = TaxPeriod.fromDate(now)
  for (let i = 0; i < count; i++) {
    periods.push(period.value)
    period = period.previous()
  }
  return periods
}

export async function loadAccountingContext(
  user: AuthenticatedUser,
  params: { clientId?: string; period?: string },
): Promise<AccountingContext> {
  const container = getContainer()

  // El listado pasa por el caso de uso, que aplica el alcance del rol: un
  // contador solo puede elegir entre SUS clientes.
  const page = await container.clients.list(user, { status: 'ACTIVE' }, { page: 1, pageSize: 100 })
  const clients = page.items.map((c) => ({
    id: c.id,
    businessName: c.businessName,
    ruc: c.ruc,
  }))

  const periods = recentPeriods(container.clock.now())
  // Por defecto, el periodo anterior: en octubre se trabaja setiembre.
  const defaultPeriod = periods[1] ?? periods[0] ?? ''

  const clientId =
    params.clientId && clients.some((c) => c.id === params.clientId)
      ? params.clientId
      : (clients[0]?.id ?? null)

  const period =
    params.period && periods.includes(params.period) ? params.period : defaultPeriod

  let periodStatus: 'ABIERTO' | 'CERRADO' | null = null
  if (clientId) {
    const records = await container.accounting.listPeriods(user, clientId)
    periodStatus = records.find((r) => r.period === period)?.status ?? null
  }

  return {
    clients,
    periods,
    clientId,
    period,
    clientName: clients.find((c) => c.id === clientId)?.businessName ?? null,
    periodStatus,
  }
}

/** Query string que conserva cliente y periodo al navegar entre pantallas. */
export function contextQuery(context: AccountingContext): string {
  const params = new URLSearchParams()
  if (context.clientId) params.set('clientId', context.clientId)
  params.set('period', context.period)
  return params.toString()
}
