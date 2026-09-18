/**
 * Calculo del "avance diario" que pide el dashboard.
 *
 * Vive en el dominio y no en el componente de React por dos razones: el job
 * nocturno que consolida ProductivitySnapshot necesita exactamente la misma
 * formula, y una regla de negocio no se define en la capa de pintado.
 */

export interface WorkloadInput {
  assigned: number
  completed: number
  overdue: number
  capacity: number
}

export interface WorkloadResult {
  assigned: number
  completed: number
  overdue: number
  /** 0-100, entero. */
  progressPct: number
  /** 0-100+, entero. Puede pasar de 100: eso es justamente la senal. */
  utilizationPct: number
  level: 'ok' | 'alto' | 'sobrecargado'
}

export const ProductivityService = {
  /**
   * Avance = terminadas / asignadas.
   * Sin tareas asignadas el avance es 100%: no hay nada pendiente, y mostrar
   * 0% penalizaria a quien simplemente no tiene carga ese dia.
   */
  progressPct(completed: number, assigned: number): number {
    if (assigned <= 0) return 100
    return Math.min(100, Math.round((completed / assigned) * 100))
  },

  utilizationPct(openTasks: number, capacity: number): number {
    if (capacity <= 0) return 0
    return Math.round((openTasks / capacity) * 100)
  },

  evaluate(input: WorkloadInput): WorkloadResult {
    const open = Math.max(0, input.assigned - input.completed)
    const utilizationPct = ProductivityService.utilizationPct(open, input.capacity)
    return {
      assigned: input.assigned,
      completed: input.completed,
      overdue: input.overdue,
      progressPct: ProductivityService.progressPct(input.completed, input.assigned),
      utilizationPct,
      // Con tareas vencidas el trabajador esta sobrecargado aunque su
      // utilizacion sea baja: el atraso pesa mas que el conteo.
      level: input.overdue > 0 || utilizationPct > 100 ? 'sobrecargado' : utilizationPct > 80 ? 'alto' : 'ok',
    }
  },
}
