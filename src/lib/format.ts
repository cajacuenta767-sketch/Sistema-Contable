/**
 * Formateo para la interfaz.
 *
 * Todo centralizado: si el estudio decide mostrar las fechas de otra forma, se
 * cambia aqui y no en veinte componentes. El locale es es-PE y la zona horaria
 * America/Lima de forma explicita -- confiar en la zona del navegador haria que
 * un contador viendo el sistema desde otro pais lea vencimientos corridos un
 * dia.
 */

const TZ = 'America/Lima'

/** Cadena "YYYY-MM-DD" sin hora. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

export function formatDate(value: string | Date): string {
  // Una cadena "YYYY-MM-DD" ya ES un dia de calendario, no un instante.
  // `new Date('2026-09-18')` la interpreta como medianoche UTC y, al mostrarla
  // en Lima (UTC-5), retrocede al 17. Se construye la fecha en la zona local
  // para que el dia mostrado sea exactamente el recibido.
  if (typeof value === 'string' && DATE_ONLY_RE.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year!, month! - 1, day!).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return new Date(value).toLocaleDateString('es-PE', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('es-PE', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value)
}

const REGIME_LABELS: Record<string, string> = {
  NRUS: 'NRUS',
  RER: 'RER',
  MYPE: 'MYPE Tributario',
  GENERAL: 'Regimen General',
}

export function regimeLabel(regime: string): string {
  return REGIME_LABELS[regime] ?? regime
}

const CATEGORY_LABELS: Record<string, string> = {
  DECLARACION: 'Declaracion',
  LIBRO: 'Libros',
  PLANILLA: 'Planillas',
  TRAMITE: 'Tramite',
  REPORTE: 'Reporte',
  OTRO: 'Otro',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}

export function roleLabel(role: string): string {
  return (
    { ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', CONTADOR: 'Contador', ASISTENTE: 'Asistente' }[
      role
    ] ?? role
  )
}

/** "en 3 dias", "vencio hace 2 dias", "vence hoy". */
export function relativeDueLabel(dueDate: string | Date, now = new Date()): string {
  const days = Math.round(
    (new Date(dueDate).getTime() - now.getTime()) / 86_400_000,
  )
  if (days === 0) return 'Vence hoy'
  if (days === 1) return 'Vence maniana'
  if (days > 1) return `Vence en ${days} dias`
  if (days === -1) return 'Vencio ayer'
  return `Vencio hace ${Math.abs(days)} dias`
}

/** Formatea el periodo "YYYY-MM" como "Setiembre 2026". */
export function periodLabel(period: string | null): string {
  if (!period) return '-'
  const [year, month] = period.split('-')
  const names = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  const index = Number(month) - 1
  return names[index] ? `${names[index]} ${year}` : period
}
