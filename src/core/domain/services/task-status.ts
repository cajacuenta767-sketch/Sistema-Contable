import { ConflictError } from '../errors'
import type { DerivedTaskState, Role, TaskStatus } from '../types'

/**
 * Maquina de estados de una tarea.
 *
 * Centralizar las transiciones evita que cada endpoint invente sus propias
 * reglas. Cualquier cambio de flujo (por ejemplo, agregar un estado
 * "OBSERVADA") se hace unicamente aqui.
 */

const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  PENDIENTE: ['EN_PROCESO'],
  EN_PROCESO: ['EN_REVISION', 'PENDIENTE', 'TERMINADA'],
  // Devolver a EN_PROCESO es "el supervisor observo el trabajo".
  EN_REVISION: ['TERMINADA', 'EN_PROCESO'],
  // Reabrir una tarea terminada es excepcional pero legitimo (SUNAT rechaza
  // una declaracion, aparece un comprobante tardio...). Queda en la bitacora.
  TERMINADA: ['EN_PROCESO'],
}

/** Solo estos roles pueden cerrar una tarea que paso por revision. */
const ROLES_THAT_CAN_APPROVE: readonly Role[] = ['ADMIN', 'SUPERVISOR']

export const TaskStatusService = {
  canTransition(from: TaskStatus, to: TaskStatus): boolean {
    return TRANSITIONS[from].includes(to)
  },

  allowedTransitions(from: TaskStatus): readonly TaskStatus[] {
    return TRANSITIONS[from]
  },

  /**
   * Valida una transicion considerando tambien el rol.
   * Lanza ConflictError/ForbiddenError en vez de devolver boolean para que
   * el caso de uso no tenga que construir el mensaje de error.
   */
  assertTransition(from: TaskStatus, to: TaskStatus, role: Role): void {
    if (from === to) {
      throw new ConflictError(`La tarea ya se encuentra en estado ${to}`)
    }
    if (!TaskStatusService.canTransition(from, to)) {
      throw new ConflictError(
        `Transicion no permitida: ${from} -> ${to}. Permitidas: ${TRANSITIONS[from].join(', ') || 'ninguna'}`,
      )
    }
    // Un asistente no aprueba su propio trabajo.
    if (from === 'EN_REVISION' && to === 'TERMINADA' && !ROLES_THAT_CAN_APPROVE.includes(role)) {
      throw new ConflictError('Solo un supervisor o administrador puede aprobar una tarea en revision')
    }
  },

  isClosed(status: TaskStatus): boolean {
    return status === 'TERMINADA'
  },

  /**
   * Estado visible en la UI. "ATRASADA" no se persiste: se deriva del reloj.
   * Ver nota en domain/types.ts.
   */
  derive(status: TaskStatus, dueDate: Date, now: Date): DerivedTaskState {
    if (status === 'TERMINADA') return 'TERMINADA'
    return dueDate.getTime() < now.getTime() ? 'ATRASADA' : status
  },
}
