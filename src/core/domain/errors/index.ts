/**
 * Errores del dominio.
 *
 * La capa HTTP los traduce a codigos de estado en un unico lugar
 * (src/lib/http.ts). Ningun caso de uso conoce a Next.js ni devuelve
 * Response: lanza estos errores y se acabo.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string
  abstract readonly httpStatus: number

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR'
  readonly httpStatus = 422
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND'
  readonly httpStatus = 404

  /** @param entity Nombre en minusculas y con articulo: "la tarea", "el cliente". */
  constructor(entity: string, id?: string) {
    super(id ? `No se encontro ${entity} (${id})` : `No se encontro ${entity}`)
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT'
  readonly httpStatus = 409
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED'
  readonly httpStatus = 401

  constructor(message = 'Credenciales invalidas o sesion expirada') {
    super(message)
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN'
  readonly httpStatus = 403

  constructor(message = 'No tiene permisos para realizar esta accion') {
    super(message)
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
