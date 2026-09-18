import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { isDomainError } from '@/core/domain/errors'

/**
 * Traduccion de errores a HTTP en UN solo lugar.
 *
 * Sin esto, cada endpoint termina con su propio try/catch y su propio criterio
 * de codigos de estado. Con 20 rutas eso son 20 criterios distintos y un 500
 * donde deberia haber un 409.
 */

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown }
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function jsonError(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message, details } }, { status })
}

/**
 * Envuelve un handler y normaliza cualquier error.
 * El handler solo se ocupa del camino feliz: lanza y se acabo.
 *
 * El tipo de retorno es `Response` y no `NextResponse` porque hay rutas que
 * devuelven algo que no es JSON —la descarga de un libro electronico, por
 * ejemplo— y forzarlas a NextResponse solo agregaria un cast inutil.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonError(
          'VALIDATION_ERROR',
          'Los datos enviados no son validos',
          422,
          error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        )
      }

      if (isDomainError(error)) {
        return jsonError(error.code, error.message, error.httpStatus, error.details)
      }

      // Cualquier otra cosa es un bug. Se registra completo del lado del
      // servidor y al cliente solo le llega un mensaje generico: los detalles
      // internos (stack, SQL, nombres de tabla) no salen al navegador.
      console.error('[api] error no controlado:', error)
      return jsonError('INTERNAL_ERROR', 'Ocurrio un error inesperado', 500)
    }
  }
}

/** Lee el body JSON tolerando cuerpo vacio o malformado. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

/** Convierte los query params en un objeto plano para Zod. */
export function searchParamsToObject(url: string): Record<string, string> {
  const params = new URL(url).searchParams
  const out: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    if (value !== '') out[key] = value
  }
  return out
}
