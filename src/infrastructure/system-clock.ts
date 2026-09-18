import type { Clock } from '@/core/application/ports'

/**
 * El reloj es una dependencia inyectada, no `new Date()` esparcido por el
 * codigo. Asi los tests de vencimientos pueden fijar "hoy" y ser
 * deterministas, que es justo lo que se necesita cuando la logica gira
 * alrededor de fechas limite.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}

export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}
  now(): Date {
    return new Date(this.fixed)
  }
}
