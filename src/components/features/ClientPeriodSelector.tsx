'use client'

import { useFilters } from './FilterBar'

/**
 * Selector de cliente y periodo.
 *
 * Todo el modulo contable trabaja sobre un par (cliente, periodo): sin esos
 * dos datos no hay libro, ni balance, ni declaracion. Vive en la URL como el
 * resto de los filtros, asi que el enlace a "el balance de agosto de tal
 * cliente" se puede compartir y el boton Atras funciona.
 */
export function ClientPeriodSelector({
  clients,
  periods,
  selectedClientId,
  selectedPeriod,
  showPeriod = true,
}: {
  clients: { id: string; businessName: string; ruc: string }[]
  periods: string[]
  /**
   * Seleccion EFECTIVA, que el servidor ya resolvio.
   *
   * No se lee de la URL: cuando no se indica empresa, el servidor elige la
   * primera del alcance del usuario y trabaja con ella. Si el selector leyera
   * la URL mostraria "Seleccione una empresa" mientras la pantalla ya esta
   * mostrando datos de otra: el usuario veria una cosa y el sistema estaria
   * haciendo otra.
   */
  selectedClientId: string | null
  selectedPeriod: string
  showPeriod?: boolean
}) {
  const { setParam } = useFilters()

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[260px] flex-1">
        <label htmlFor="sel-cliente" className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
          Empresa
        </label>
        <select
          id="sel-cliente"
          value={selectedClientId ?? ''}
          onChange={(e) => setParam('clientId', e.target.value || null)}
          className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 text-sm"
        >
          {!selectedClientId && <option value="">Seleccione una empresa...</option>}
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.businessName} - {client.ruc}
            </option>
          ))}
        </select>
      </div>

      {showPeriod && (
        <div className="min-w-[170px]">
          <label htmlFor="sel-periodo" className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            Periodo tributario
          </label>
          <select
            id="sel-periodo"
            value={selectedPeriod}
            onChange={(e) => setParam('period', e.target.value || null)}
            className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 text-sm"
          >
            {periods.map((period) => (
              <option key={period} value={period}>
                {periodLabel(period)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function periodLabel(period: string): string {
  const [year, month] = period.split('-')
  const names = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${names[Number(month) - 1] ?? month} ${year}`
}
